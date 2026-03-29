//! DTOs cacheables devueltos por comandos Tauri y rellenados desde `steam_search`.

/// URLs de medios de una aplicación de Steam (portada, capturas, vídeo).
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAppdetailsMedia {
    pub media_urls: Vec<String>,
    pub video_url: Option<String>,
}

/// Ficha completa de una aplicación de Steam.
///
/// Incluye textos descriptivos, metadatos (desarrollador, editor, géneros,
/// fecha de lanzamiento) y medios asociados.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAppDetails {
    pub name: String,
    pub short_description: String,
    pub detailed_description: String,
    pub header_image: String,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub genres: Vec<String>,
    pub categories: Vec<String>,
    pub release_date: Option<String>,
    pub pc_requirements_minimum: Option<String>,
    pub pc_requirements_recommended: Option<String>,
    pub media: SteamAppdetailsMedia,
}
