//! Streaming de directorios como archivos TAR hacia un canal de chunks en memoria.
//!
//! Este módulo integra `tar-rs` con un `tokio::sync::mpsc` para producir un
//! flujo de chunks (`bytes::Bytes`) a medida que se genera el archivo TAR,
//! evitando almacenamiento intermedio en disco.
//!
//! La generación del TAR se ejecuta en un hilo blocking mediante
//! [`tokio::task::spawn_blocking`], ya que `tar-rs` opera de forma síncrona
//! sobre el sistema de archivos. Los datos producidos se escriben en un
//! [`ChannelWriter`], que implementa [`std::io::Write`] y se encarga de
//! fragmentarlos en chunks de tamaño fijo antes de enviarlos al canal.
//!
//! El consumidor recibe una secuencia de [`TarStreamMsg`] que representa:
//!
//! - [`TarStreamMsg::Chunk`]: datos del TAR en orden de generación.
//! - [`TarStreamMsg::Done`]: finalización correcta del stream.
//! - [`TarStreamMsg::Err`]: fallo durante el empaquetado o envío.
//!
//! El canal actúa como mecanismo de backpressure, limitando la producción
//! según su capacidad configurada.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use bytes::{BufMut, BytesMut};

use super::upload_strategy::TAR_STREAM_CHUNK_BYTES;

/// Mensajes que el hilo TAR envía al consumidor async.
///
/// El canal se cierra con [`TarStreamMsg::Done`] en el camino feliz o con
/// [`TarStreamMsg::Err`] ante cualquier fallo de I/O. El consumidor debe tratar
/// ambos como señal de fin de stream y actuar en consecuencia.
#[derive(Debug)]
pub(crate) enum TarStreamMsg {
    /// Chunk de bytes listos para subir. El tamaño es exactamente
    /// [`TAR_STREAM_CHUNK_BYTES`] salvo para el último chunk del stream,
    /// que puede ser menor.
    Chunk(bytes::Bytes),
    /// El TAR se generó y todos los bytes fueron enviados correctamente.
    Done,
    /// Error irrecuperable durante la generación o el envío al canal.
    Err(String),
}

/// Implementa [`Write`] sobre un canal [`tokio::sync::mpsc`], acumulando bytes
/// en un [`BytesMut`] y enviando chunks al alcanzar el umbral configurado.
///
/// # Diseño sin copias extra
///
/// `BytesMut` es un buffer de bytes con conteo de referencias interno. La operación
/// `split_to(n)` devuelve los primeros `n` bytes como un [`BytesMut`] independiente
/// en O(1) sin mover los bytes subyacentes: sólo incrementa el contador de referencia
/// y ajusta los punteros de inicio y fin. Llamar a `.freeze()` sobre ese fragmento
/// produce un [`bytes::Bytes`] inmutable listo para enviar por el canal, también O(1).
///
/// El buffer principal continúa apuntando al espacio restante del mismo bloque de
/// memoria, evitando reallocaciones hasta que ese espacio se agota.
struct ChannelWriter {
    tx: tokio::sync::mpsc::Sender<TarStreamMsg>,
    /// Buffer de acumulación. Se mantiene siempre pre-reservado con al menos
    /// `TAR_STREAM_CHUNK_BYTES` de capacidad disponible para evitar reallocaciones
    /// en el camino caliente.
    buf: BytesMut,
}

impl ChannelWriter {
    /// Crea un nuevo `ChannelWriter` conectado al [`Sender`] proporcionado.
    ///
    /// El buffer se inicializa con capacidad exacta para un chunk completo,
    /// eliminando cualquier reallocación durante la primera escritura.
    fn new(tx: tokio::sync::mpsc::Sender<TarStreamMsg>) -> Self {
        Self {
            tx,
            buf: BytesMut::with_capacity(TAR_STREAM_CHUNK_BYTES),
        }
    }

    /// Envía el contenido actual del buffer como un chunk y resetea el buffer.
    ///
    /// Usa `split_to` en vez de `mem::take` para evitar mover los bytes: el chunk
    /// resultante comparte la misma región de memoria que el buffer hasta que el
    /// receptor lo dropea. El buffer queda apuntando al espacio contiguo restante.
    ///
    /// Si tras el split el buffer no tiene capacidad suficiente para el siguiente
    /// ciclo, se reserva aquí para que la próxima escritura nunca provoque una
    /// reallocación.
    fn flush_chunk(&mut self) -> io::Result<()> {
        if self.buf.is_empty() {
            return Ok(());
        }

        // `split_to` es O(1): no copia bytes, sólo ajusta los punteros internos
        // del `BytesMut` y devuelve una vista independiente del mismo bloque.
        // `.freeze()` convierte ese fragmento en `Bytes` inmutable, también O(1).
        let chunk = self.buf.split_to(self.buf.len()).freeze();

        self.tx
            .blocking_send(TarStreamMsg::Chunk(chunk))
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receptor descartado"))?;

        // Pre-reservar capacidad para el siguiente ciclo de escritura.
        // Si `split_to` dejó capacidad contigua disponible, `reserve` es un no-op.
        if self.buf.capacity() < TAR_STREAM_CHUNK_BYTES {
            self.buf.reserve(TAR_STREAM_CHUNK_BYTES);
        }

        Ok(())
    }
}

impl Write for ChannelWriter {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        // Fast path: buffer vacío y bloque entrante supera o iguala el umbral.
        //
        // Se evita pasar el slice por el buffer intermedio. `copy_from_slice`
        // realiza una única copia directa al heap del `Bytes` final, mientras
        // que el path anterior hacía `data.to_vec()` (copia al Vec) seguido de
        // `blocking_send` (movimiento del Vec), sumando dos operaciones de memoria
        // donde ahora hay una sola.
        if self.buf.is_empty() && data.len() >= TAR_STREAM_CHUNK_BYTES {
            let chunk = bytes::Bytes::copy_from_slice(data);
            self.tx
                .blocking_send(TarStreamMsg::Chunk(chunk))
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receptor descartado"))?;
            return Ok(data.len());
        }

        // Path normal: acumular en el buffer pre-reservado.
        //
        // `put_slice` en `BytesMut` opera directamente sobre la capacidad disponible
        // sin verificar el tipo de colección subyacente, evitando la indirección de
        // `Vec::extend_from_slice`.
        self.buf.put_slice(data);

        // Flush cuando el buffer alcanza o supera el umbral.
        if self.buf.len() >= TAR_STREAM_CHUNK_BYTES {
            self.flush_chunk()?;
        }

        Ok(data.len())
    }

    /// Vacía cualquier byte pendiente en el buffer hacia el canal.
    ///
    /// Llamado por `tar-rs` durante `finish` e `into_inner` para garantizar que
    /// los bytes finales del TAR (bloques de terminación de 1024 bytes) llegan
    /// al consumidor antes de que el hilo termine.
    fn flush(&mut self) -> io::Result<()> {
        self.flush_chunk()
    }
}

/// Lanza la generación del TAR en un hilo blocking y devuelve el receptor de chunks.
///
/// `tar-rs` realiza I/O síncrona sobre el sistema de archivos. Ejecutarlo en un
/// hilo blocking dedicado via [`tokio::task::spawn_blocking`] es el patrón correcto:
/// evita bloquear los hilos del executor async sin introducir la complejidad de un
/// wrapper async sobre operaciones de disco inherentemente secuenciales.
///
/// # Parameters
///
/// - `source_dir`: directorio raíz a empaquetar. Se toma posesión para que el
///   closure sea `'static`.
/// - `channel_capacity`: capacidad del canal mpsc. Debe derivarse de
///   `UploadStrategy::tar_channel_capacity` para que el backpressure esté
///   calibrado con el tamaño de parte elegido en tiempo de ejecución. No usar
///   literales hardcodeados aquí.
///
/// # Return
///
/// `(Receiver<TarStreamMsg>, JoinHandle<()>)`. El receptor produce chunks hasta
/// recibir [`TarStreamMsg::Done`] o [`TarStreamMsg::Err`]. El `JoinHandle` puede
/// ignorarse si no se necesita esperar la finalización del hilo blocking.
pub(crate) fn spawn_tar_stream(
    source_dir: PathBuf,
    channel_capacity: usize,
) -> (
    tokio::sync::mpsc::Receiver<TarStreamMsg>,
    tokio::task::JoinHandle<()>,
) {
    let (tx, rx) = tokio::sync::mpsc::channel::<TarStreamMsg>(channel_capacity);

    let handle = tokio::task::spawn_blocking(move || {
        match run_tar_to_channel(&source_dir, tx.clone()) {
            Ok(()) => {
                let _ = tx.blocking_send(TarStreamMsg::Done);
            }
            Err(e) => {
                // El error se envía antes del cierre implícito del canal para que
                // el consumidor pueda distinguir un fin limpio de un fallo de I/O.
                let _ = tx.blocking_send(TarStreamMsg::Err(e));
            }
        }
        // `tx` se dropea al salir del scope. El canal queda cerrado desde el lado
        // productor, liberando al consumidor de `recv` si aún está bloqueado en él.
    });

    (rx, handle)
}

/// Empaqueta `source_dir` en formato TAR escribiendo los chunks en el canal.
///
/// Crea un [`ChannelWriter`] y se lo pasa al [`tar::Builder`]. Al llamar a
/// `into_inner`, `tar-rs` invoca `finish` internamente (escribe los dos bloques
/// de 512 bytes de terminación) y devuelve el writer. El flush explícito final
/// garantiza que cualquier byte residual en el buffer llega al canal.
///
/// # Errors
///
/// Devuelve `Err(String)` ante cualquier fallo de I/O al leer el directorio
/// o al escribir sobre el canal (receptor descartado prematuramente).
fn run_tar_to_channel(
    source_dir: &Path,
    tx: tokio::sync::mpsc::Sender<TarStreamMsg>,
) -> Result<(), String> {
    let writer = ChannelWriter::new(tx);
    let mut builder = tar::Builder::new(writer);

    // Preservar symlinks como entradas TAR de tipo enlace simbólico en vez de
    // seguirlos y copiar el contenido del destino. Reduce el tamaño del TAR
    // generado y el tiempo de I/O en directorios con muchos enlaces simbólicos.
    builder.follow_symlinks(false);

    builder
        .append_dir_all(".", source_dir)
        .map_err(|e| format!("error empaquetando '{}': {}", source_dir.display(), e))?;

    // `into_inner` llama a `finish` internamente antes de devolver el writer.
    // `finish` escribe los bloques de terminación del TAR (1024 bytes de ceros)
    // e invoca `flush` sobre el writer, lo que llama a `ChannelWriter::flush_chunk`
    // y envía el último chunk pendiente al canal.
    let mut channel_writer = builder.into_inner().map_err(|e| {
        format!(
            "error finalizando tar para '{}': {}",
            source_dir.display(),
            e
        )
    })?;

    // Flush explícito de defensa: garantiza que cualquier byte que `into_inner`
    // no haya drenado por algún codepath de `finish` llegue al canal antes de
    // que el hilo termine. Es un no-op si el buffer ya está vacío.
    channel_writer
        .flush_chunk()
        .map_err(|e| format!("error vaciando buffer final: {}", e))?;

    Ok(())
}
