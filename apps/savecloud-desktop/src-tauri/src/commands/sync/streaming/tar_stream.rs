//! Manejo de streaming de archivos TAR en memoria.
//!
//! Implementa la transferencia de archivos en modo streaming,
//! sin necesidad de almacenamiento temporal en disco.
//!
//! El tamaño de chunk (`TAR_STREAM_CHUNK_BYTES`) está alineado intencionalmente
//! con el rango de 2–4 MB para reducir la impedancia con el consumidor multipart,
//! que acumula partes de 32 MB antes de subirlas. Con chunks de 2 MB se necesitan
//! ~16 iteraciones por parte en lugar de las ~128 que generaban chunks de 256 KB.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Tamaño de chunk emitido al canal.
///
/// Elegido para minimizar llamadas a `extend_from_slice` en el consumidor multipart
/// (PART_SIZE / TAR_STREAM_CHUNK_BYTES = ~16 iteraciones por parte de 32 MB).
/// Si el crate tar envía un bloque más grande, se envía completo sin copia adicional.
const TAR_STREAM_CHUNK_BYTES: usize = 2 * 1024 * 1024;

/// Capacidad del canal entre el hilo TAR y el consumidor multipart.
///
/// Calculada como PART_SIZE / TAR_STREAM_CHUNK_BYTES para que el buffer
/// en tránsito no supere una parte completa (~32 MB), aplicando backpressure
/// natural cuando la red no puede seguir el ritmo del disco.
/// PART_SIZE se define en multipart.rs (32 MiB).
pub(crate) const TAR_CHANNEL_CAPACITY: usize = 32 * 1024 * 1024 / TAR_STREAM_CHUNK_BYTES;

#[derive(Debug)]
pub(crate) enum TarStreamMsg {
    Chunk(Vec<u8>),
    Done,
    Err(String),
}

struct ChannelWriter {
    tx: tokio::sync::mpsc::Sender<TarStreamMsg>,
    buf: Vec<u8>,
}

impl ChannelWriter {
    fn new(tx: tokio::sync::mpsc::Sender<TarStreamMsg>) -> Self {
        Self {
            tx,
            buf: Vec::with_capacity(TAR_STREAM_CHUNK_BYTES),
        }
    }

    /// Vacía todo el contenido actual del buffer al canal.
    ///
    /// Usa `std::mem::take` para transferir la propiedad del vector sin copia,
    /// dejando el buffer interno en estado vacío de forma O(1).
    fn flush_all(&mut self) -> io::Result<()> {
        if !self.buf.is_empty() {
            let chunk = std::mem::take(&mut self.buf);
            self.tx
                .blocking_send(TarStreamMsg::Chunk(chunk))
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receiver dropped"))?;
        }
        Ok(())
    }
}

impl Write for ChannelWriter {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        // Fast path: si el buffer está vacío y el bloque entrante supera el umbral,
        // se envía directamente al canal sin pasar por el buffer interno.
        if self.buf.is_empty() && data.len() >= TAR_STREAM_CHUNK_BYTES {
            self.tx
                .blocking_send(TarStreamMsg::Chunk(data.to_vec()))
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receiver dropped"))?;
            return Ok(data.len());
        }

        self.buf.extend_from_slice(data);

        // Cuando el buffer alcanza el umbral se vacía completo en O(1).
        // Se pre-reserva capacidad para el ciclo siguiente y evitar
        // reubicaciones de memoria en la próxima escritura.
        if self.buf.len() >= TAR_STREAM_CHUNK_BYTES {
            let chunk = std::mem::take(&mut self.buf);
            self.buf.reserve(TAR_STREAM_CHUNK_BYTES);
            self.tx
                .blocking_send(TarStreamMsg::Chunk(chunk))
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receiver dropped"))?;
        }

        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.flush_all()
    }
}

/// Spawnea la creación del TAR en un hilo blocking y devuelve un receptor de mensajes.
///
/// El canal tiene capacidad acotada para aplicar backpressure natural: si el consumidor
/// multipart no retira chunks (por ejemplo, porque la red es lenta), el hilo blocking
/// se bloqueará en `blocking_send` en lugar de acumular memoria sin límite.
///
/// La capacidad recomendada es `PART_SIZE / TAR_STREAM_CHUNK_BYTES` (ver multipart.rs),
/// lo que limita el buffer en tránsito a aproximadamente una parte de 32 MB.
pub(crate) fn spawn_tar_stream(
    source_dir: PathBuf,
    channel_capacity: usize,
) -> (
    tokio::sync::mpsc::Receiver<TarStreamMsg>,
    tokio::task::JoinHandle<()>,
) {
    let (tx, rx) = tokio::sync::mpsc::channel::<TarStreamMsg>(channel_capacity);
    let handle = tokio::task::spawn_blocking(move || {
        if let Err(e) = run_tar_to_channel(&source_dir, tx.clone()) {
            let _ = tx.blocking_send(TarStreamMsg::Err(e));
        }
        // Cierre explícito para que el receptor pueda detectar el fin del stream.
        let _ = tx.blocking_send(TarStreamMsg::Done);
    });
    (rx, handle)
}

fn run_tar_to_channel(
    source_dir: &Path,
    tx: tokio::sync::mpsc::Sender<TarStreamMsg>,
) -> Result<(), String> {
    let writer = ChannelWriter::new(tx);
    let mut builder = tar::Builder::new(writer);

    builder
        .append_dir_all(".", source_dir)
        .map_err(|e| format!("Error empaquetando dir: {}", e))?;

    // `into_inner` llama a `finish` internamente antes de devolver el writer.
    // Después se fuerza el volcado de los bytes restantes en el buffer.
    let mut inner_writer = builder
        .into_inner()
        .map_err(|e| format!("Error finalizando tar: {}", e))?;

    inner_writer
        .flush_all()
        .map_err(|e| format!("Error vaciando buffer final: {}", e))?;

    Ok(())
}
