//! Estrategia de subida adaptativa para backups de juegos.
//!
//! Centraliza todas las decisiones de configuración del pipeline de subida:
//! tamaño de parte, concurrencia, capacidad del canal TAR y prefetch de URLs.
//!
//! El objetivo es mantener el número de partes entre 100 y 800 para cualquier
//! tamaño de archivo, punto donde el overhead de HTTP es bajo y el pipeline
//! de concurrencia se llena rápido sin desperdiciar memoria.
//!
//! La concurrencia se ajusta dinámicamente durante la subida a partir del
//! throughput medido en las primeras partes completadas, evitando que equipos
//! con conexiones lentas desperdicien RAM compitiendo entre sí.
//!
//! Todos los valores tienen límites mínimos y máximos explícitos para garantizar
//! comportamiento correcto en los extremos (archivos vacíos, archivos de cientos de GB).

/// Tamaño mínimo de parte impuesto por la especificación de S3 (excepto la última parte).
const S3_MIN_PART_SIZE: usize = 5 * 1024 * 1024;

/// Tamaño máximo de parte permitido por S3.
const S3_MAX_PART_SIZE: usize = 5 * 1024 * 1024 * 1024;

/// Número mínimo de partes concurrentes. Por debajo de 2 el pipeline
/// no tiene sentido y la subida es secuencial.
const MIN_CONCURRENT_PARTS: usize = 2;

/// Número máximo de partes concurrentes. Con partes de 64 MB y 16 slots
/// el consumo de RAM en vuelo es ~1 GB, límite razonable para equipos de escritorio.
const MAX_CONCURRENT_PARTS: usize = 16;

/// Tamaño de chunk emitido por el hilo TAR al canal.
/// Fijo en 2 MB como base; `UploadStrategy` calcula cuántos slots necesita
/// el canal para cubrir exactamente una parte.
const TAR_CHUNK_SIZE: usize = 2 * 1024 * 1024;

/// Umbrales de throughput (Mbps) para ajuste de concurrencia.
/// Por debajo de LOW se reduce a concurrencia mínima.
/// Por encima de HIGH se permite concurrencia máxima.
const THROUGHPUT_LOW_MBPS: f64 = 50.0;
const THROUGHPUT_HIGH_MBPS: f64 = 200.0;

/// Número de partes completadas necesarias antes de ajustar la concurrencia.
/// Las primeras partes sufren cold start de TCP/TLS y no son representativas.
const THROUGHPUT_SAMPLE_PARTS: usize = 2;

/// Parámetros de configuración calculados para una subida concreta.
///
/// Se construye una vez al inicio de cada subida y permanece inmutable
/// excepto por `current_concurrency`, que el `ConcurrencyController` ajusta
/// en tiempo de ejecución según el throughput medido.
#[derive(Debug, Clone)]
pub(crate) struct UploadStrategy {
    /// Tamaño en bytes de cada parte (excepto la última).
    pub part_size: usize,

    /// Número inicial de partes concurrentes antes de medir throughput.
    /// Conservador para no saturar conexiones lentas al arranque.
    pub initial_concurrency: usize,

    /// Número total de partes estimado para este archivo.
    pub estimated_parts: u32,

    /// Capacidad del canal entre el hilo TAR y el consumidor multipart.
    /// Calculada para que el buffer en tránsito no supere una parte completa,
    /// aplicando backpressure natural cuando la red es más lenta que el disco.
    pub tar_channel_capacity: usize,

    /// Cuántas URLs adelante del número de parte actual deben estar en caché
    /// antes de lanzar un prefetch especulativo del siguiente batch.
    pub prefetch_threshold: u32,
}

impl UploadStrategy {
    /// Calcula la estrategia óptima para un archivo de `total_bytes` bytes.
    ///
    /// Si `total_bytes` es cero se devuelve una estrategia mínima válida
    /// que el llamador puede usar para completar la subida vacía.
    pub fn for_file(total_bytes: u64) -> Self {
        if total_bytes == 0 {
            return Self::minimal();
        }

        let part_size = optimal_part_size(total_bytes);
        let estimated_parts = estimated_part_count(total_bytes, part_size);
        let initial_concurrency = initial_concurrency_for_part_size(part_size);
        let tar_channel_capacity = (part_size / TAR_CHUNK_SIZE).max(1);

        // El prefetch se dispara cuando quedan menos del 20% de un batch de 100 URLs
        // por delante del número de parte actual, o al menos 10 como mínimo.
        let prefetch_threshold = (estimated_parts / 5).clamp(10, 50);

        Self {
            part_size,
            initial_concurrency,
            estimated_parts,
            tar_channel_capacity,
            prefetch_threshold,
        }
    }

    /// Estrategia mínima para archivos vacíos o cuando no hay estimación disponible.
    fn minimal() -> Self {
        Self {
            part_size: S3_MIN_PART_SIZE,
            initial_concurrency: MIN_CONCURRENT_PARTS,
            estimated_parts: 1,
            tar_channel_capacity: 1,
            prefetch_threshold: 10,
        }
    }

    /// Descripción legible para logging.
    pub fn describe(&self) -> String {
        format!(
            "part_size={}MB initial_concurrency={} estimated_parts={} channel_capacity={}",
            self.part_size / (1024 * 1024),
            self.initial_concurrency,
            self.estimated_parts,
            self.tar_channel_capacity,
        )
    }
}

/// Calcula el tamaño de parte óptimo para mantener el número de partes
/// entre ~100 y ~800, independientemente del tamaño del archivo.
///
/// Los rangos están calibrados para los tamaños típicos de backups de juegos:
///
///   <= 128 MB  →  5 MB   (saves pequeños, ~26 partes máximo)
///   <= 1 GB    →  8 MB   (~128 partes)
///   <= 10 GB   → 16 MB   (~640 partes)
///   <= 50 GB   → 32 MB   (~1600 partes, dentro del límite del backend)
///   <= 200 GB  → 64 MB   (~3200 partes con batches, Flight Simulator territory)
///   > 200 GB   → 128 MB  (límite práctico antes del máximo de S3 de 5 GB/parte)
///
/// El resultado siempre está dentro de los límites de S3 (5 MB – 5 GB).
fn optimal_part_size(total_bytes: u64) -> usize {
    let size = match total_bytes {
        0..=134_217_728 => 5 * 1024 * 1024,     // <= 128 MB
        ..=1_073_741_824 => 8 * 1024 * 1024,    // <= 1 GB
        ..=10_737_418_240 => 16 * 1024 * 1024,  // <= 10 GB
        ..=53_687_091_200 => 32 * 1024 * 1024,  // <= 50 GB
        ..=214_748_364_800 => 64 * 1024 * 1024, // <= 200 GB
        _ => 128 * 1024 * 1024,                 // > 200 GB
    };
    size.clamp(S3_MIN_PART_SIZE, S3_MAX_PART_SIZE)
}

/// Número de partes estimado para un archivo de `total_bytes` con partes de `part_size`.
fn estimated_part_count(total_bytes: u64, part_size: usize) -> u32 {
    ((total_bytes + part_size as u64 - 1) / part_size as u64).min(u32::MAX as u64) as u32
}

/// Concurrencia inicial conservadora basada en el tamaño de parte.
///
/// Partes grandes ocupan más RAM por slot, así que se arranca con menos slots.
/// El `ConcurrencyController` ajustará este valor hacia arriba una vez que
/// tenga muestras de throughput reales.
fn initial_concurrency_for_part_size(part_size: usize) -> usize {
    let mb = part_size / (1024 * 1024);
    match mb {
        0..=8 => 4,
        9..=16 => 4,
        17..=32 => 4,
        33..=64 => 3,
        _ => 2,
    }
}

/// Controla la concurrencia de subida en tiempo de ejecución.
///
/// Acumula muestras de throughput de las partes completadas y ajusta
/// el número de slots concurrentes una sola vez, después de haber
/// observado suficientes muestras para filtrar el ruido del cold start TCP/TLS.
///
/// El ajuste es conservador: solo sube la concurrencia, nunca la baja,
/// para evitar cancelar partes en vuelo innecesariamente.
pub(crate) struct ConcurrencyController {
    /// Concurrencia actual. El consumidor la lee para decidir cuántas
    /// tareas puede tener en el JoinSet simultáneamente.
    current: usize,

    /// Muestras de throughput acumuladas (bytes enviados, milisegundos transcurridos).
    samples: Vec<(u64, u128)>,

    /// Indica si el ajuste ya fue aplicado. Solo se ajusta una vez.
    adjusted: bool,
}

impl ConcurrencyController {
    pub fn new(strategy: &UploadStrategy) -> Self {
        Self {
            current: strategy.initial_concurrency,
            samples: Vec::with_capacity(THROUGHPUT_SAMPLE_PARTS + 1),
            adjusted: false,
        }
    }

    /// Concurrencia actual recomendada.
    pub fn current(&self) -> usize {
        self.current
    }

    /// Registra una parte completada con su tamaño y tiempo de subida.
    ///
    /// Si se han acumulado suficientes muestras y el ajuste no se ha aplicado,
    /// calcula el throughput promedio y actualiza la concurrencia.
    pub fn record_part(&mut self, bytes_sent: u64, elapsed_ms: u128) {
        if self.adjusted {
            return;
        }
        if elapsed_ms > 0 {
            self.samples.push((bytes_sent, elapsed_ms));
        }
        if self.samples.len() >= THROUGHPUT_SAMPLE_PARTS {
            self.apply_adjustment();
        }
    }

    /// Calcula el throughput promedio de las muestras y ajusta la concurrencia.
    fn apply_adjustment(&mut self) {
        self.adjusted = true;

        if self.samples.is_empty() {
            return;
        }

        let mut total_throughput_mbps = 0.0;

        for &(bytes, ms) in &self.samples {
            if ms > 0 {
                // Throughput individual de esta tarea en Mbps
                let task_mbps = (bytes as f64 * 8.0) / (ms as f64 / 1000.0) / 1_000_000.0;
                total_throughput_mbps += task_mbps;
            }
        }

        // El throughput promedio por hilo
        let avg_task_mbps = total_throughput_mbps / self.samples.len() as f64;

        // El throughput total estimado de la red es el promedio por hilo
        // multiplicado por los hilos que estaban compitiendo por la red.
        let estimated_network_mbps = avg_task_mbps * self.current as f64;

        let new_concurrency = concurrency_for_throughput(estimated_network_mbps);

        if new_concurrency > self.current {
            self.current = new_concurrency;
        }
    }

    /// Descripción del estado actual para logging.
    pub fn describe(&self) -> String {
        if self.samples.is_empty() {
            return format!("concurrency={} (sin muestras)", self.current);
        }

        let mut total_throughput_mbps = 0.0;

        for &(bytes, ms) in &self.samples {
            if ms > 0 {
                let task_mbps = (bytes as f64 * 8.0) / (ms as f64 / 1000.0) / 1_000_000.0;
                total_throughput_mbps += task_mbps;
            }
        }

        let avg_task_mbps = total_throughput_mbps / self.samples.len() as f64;
        let estimated_network_mbps = avg_task_mbps * self.current as f64;

        format!(
            "concurrency={} throughput_mbps={:.1} adjusted={}",
            self.current, estimated_network_mbps, self.adjusted
        )
    }
}

/// Determina la concurrencia óptima para un throughput medido por parte.
///
/// El throughput medido es por parte individual (un solo slot), así que
/// la concurrencia óptima es aproximadamente cuántos slots caben en el
/// ancho de banda disponible sin saturarlo.
///
///   < 50 Mbps:    2 slots (conexión lenta, minimizar contención)
///   50–100 Mbps:  4 slots
///   100–200 Mbps: 8 slots
///   > 200 Mbps:  16 slots (red rápida, maximizar throughput)
///
/// El resultado siempre está en [MIN_CONCURRENT_PARTS, MAX_CONCURRENT_PARTS].
fn concurrency_for_throughput(throughput_mbps: f64) -> usize {
    let concurrency = if throughput_mbps < THROUGHPUT_LOW_MBPS {
        MIN_CONCURRENT_PARTS
    } else if throughput_mbps < 100.0 {
        4
    } else if throughput_mbps < THROUGHPUT_HIGH_MBPS {
        8
    } else {
        MAX_CONCURRENT_PARTS
    };
    concurrency.clamp(MIN_CONCURRENT_PARTS, MAX_CONCURRENT_PARTS)
}

/// Tamaño de chunk que el hilo TAR emite al canal.
///
/// Es una constante global porque `tar_stream.rs` lo necesita en tiempo
/// de compilación para el `ChannelWriter`. La capacidad del canal se
/// calcula dinámicamente en `UploadStrategy` a partir de este valor.
pub(crate) const TAR_STREAM_CHUNK_BYTES: usize = TAR_CHUNK_SIZE;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_size_within_s3_limits() {
        let sizes = [
            0u64,
            1,
            1024,
            128 * 1024 * 1024,
            10 * 1024 * 1024 * 1024,
            50 * 1024 * 1024 * 1024,
            200 * 1024 * 1024 * 1024,
            u64::MAX,
        ];
        for &s in &sizes {
            let ps = optimal_part_size(s);
            assert!(
                ps >= S3_MIN_PART_SIZE,
                "part_size {} < S3 min for file size {}",
                ps,
                s
            );
            assert!(
                ps <= S3_MAX_PART_SIZE,
                "part_size {} > S3 max for file size {}",
                ps,
                s
            );
        }
    }

    #[test]
    fn strategy_for_empty_file_is_valid() {
        let s = UploadStrategy::for_file(0);
        assert_eq!(s.estimated_parts, 1);
        assert!(s.part_size >= S3_MIN_PART_SIZE);
    }

    #[test]
    fn concurrency_increases_with_throughput() {
        assert!(concurrency_for_throughput(10.0) <= concurrency_for_throughput(300.0));
    }

    #[test]
    fn controller_adjusts_after_samples() {
        let strategy = UploadStrategy::for_file(512 * 1024 * 1024);
        let mut ctrl = ConcurrencyController::new(&strategy);
        let initial = ctrl.current();

        // Simular dos partes con throughput alto (~400 Mbps por parte)
        ctrl.record_part(32 * 1024 * 1024, 640);
        ctrl.record_part(32 * 1024 * 1024, 640);

        assert!(ctrl.current() >= initial);
        assert!(ctrl.adjusted);
    }

    #[test]
    fn controller_does_not_adjust_twice() {
        let strategy = UploadStrategy::for_file(512 * 1024 * 1024);
        let mut ctrl = ConcurrencyController::new(&strategy);
        ctrl.record_part(32 * 1024 * 1024, 640);
        ctrl.record_part(32 * 1024 * 1024, 640);
        let after_first = ctrl.current();
        ctrl.record_part(32 * 1024 * 1024, 100); // throughput extremo, no debe cambiar
        assert_eq!(ctrl.current(), after_first);
    }
}
