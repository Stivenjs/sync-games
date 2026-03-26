//! Cliente de red centralizado para SaveCloud.
//!
//! Este módulo gestiona el ciclo de vida de las conexiones HTTP, utilizando
//! un pool de conexiones persistentes para minimizar la latencia de red
//! y optimizar el ancho de banda en transferencias S3.

use std::sync::LazyLock;
use std::time::Duration;

/// Identificador de agente de usuario para todas las peticiones de la aplicación.
const USER_AGENT: &str = "SaveCloud-desktop/1.0";

/// Cliente HTTP optimizado para operaciones de API rápidas y metadatos.
///
/// Características:
/// * Timeouts cortos para evitar bloqueos en la interfaz.
/// * `tcp_nodelay` activo para reducir la latencia en paquetes JSON pequeños.
/// * Reutilización de conexiones para llamadas frecuentes a la API de AWS.
pub static API_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .tcp_nodelay(true)
        .build()
        .expect("Fallo crítico al inicializar API_CLIENT")
});

/// Cliente HTTP de alto rendimiento para transferencias de archivos pesados.
///
/// Este cliente unifica las operaciones de:
/// * Subidas (Uploads) y Descargas (Downloads).
/// * Operaciones Multipart de S3.
/// * Sincronización de backups de gran tamaño.
///
/// Características:
/// * Timeouts extendidos (10 min) para soportar archivos de guardado grandes o conexiones lentas.
/// * `tcp_keepalive` configurado para mantener túneles abiertos durante procesos largos.
pub static DATA_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(600))
        .connect_timeout(Duration::from_secs(30))
        .tcp_keepalive(Duration::from_secs(60))
        .build()
        .expect("Fallo crítico al inicializar DATA_CLIENT")
});

/// Cliente especializado para el raspado de datos y API de Steam.
///
/// Utiliza un User-Agent de navegador moderno para evitar bloqueos por
/// parte de los firewalls de Valve (WAF) y simular tráfico legítimo.
pub static STEAM_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(15))
        .build()
        .expect("Fallo crítico al inicializar STEAM_CLIENT")
});
