use std::io;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Tamaño de chunk que se envía por el canal desde el writer síncrono.
/// Evita enviar miles de mensajes pequeños.
const TAR_STREAM_CHUNK_BYTES: usize = 256 * 1024;

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

    fn flush_chunks(&mut self) -> io::Result<()> {
        while self.buf.len() >= TAR_STREAM_CHUNK_BYTES {
            let chunk = self
                .buf
                .drain(..TAR_STREAM_CHUNK_BYTES)
                .collect::<Vec<u8>>();
            self.tx
                .blocking_send(TarStreamMsg::Chunk(chunk))
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "receiver dropped"))?;
        }
        Ok(())
    }

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
        self.buf.extend_from_slice(data);
        self.flush_chunks()?;
        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.flush_all()
    }
}

/// Spawnea la creación del TAR en un hilo blocking y devuelve un stream de bytes.
///
/// El TAR contiene el contenido de `source_dir` bajo el path raíz `"."` (igual que append_dir_all).
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
        // Asegurar un cierre explícito para que el receiver pueda terminar.
        let _ = tx.blocking_send(TarStreamMsg::Done);
    });
    (rx, handle)
}

fn run_tar_to_channel(
    source_dir: &Path,
    tx: tokio::sync::mpsc::Sender<TarStreamMsg>,
) -> Result<(), String> {
    let writer = ChannelWriter::new(tx.clone());
    let mut builder = tar::Builder::new(writer);
    builder
        .append_dir_all(".", source_dir)
        .map_err(|e| e.to_string())?;
    builder.finish().map_err(|e| e.to_string())?;
    Ok(())
}
