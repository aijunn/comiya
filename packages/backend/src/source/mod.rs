//! Comic source abstraction.
//!
//! Adding a new source:
//! 1. Create `src/source/<name>.rs` with a type implementing [`ComicSource`].
//! 2. Return a stable, URL-safe id from [`ComicSource::id`] and a display name
//!    from [`ComicSource::name`].
//! 3. Register it in [`SourceRegistry::new`].
//! 4. Implement [`ComicSource::image_headers`] if the source protects images
//!    with hotlink headers (for example `Referer`).
//!
//! The frontend discovers sources through `/api/get_sources`, so no frontend
//! changes are needed when a new source is registered.

mod manhuagui;
mod types;

use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Serialize;

pub use manhuagui::{
    Manhuagui, SOURCE_ID as MANHUAGUI_SOURCE_ID, SOURCE_NAME as MANHUAGUI_SOURCE_NAME,
};
pub use types::{Comic, ComicBrief, ComicChapter, ComicChapterBrief, ComicChapterGroup};

/// Source used when a request omits `source`. It is also the source assigned to
/// rows that existed before multi-source support was introduced.
pub const DEFAULT_SOURCE_ID: &str = manhuagui::SOURCE_ID;

#[async_trait]
pub trait ComicSource: Send + Sync {
    /// Stable, URL-safe identifier persisted in routes, database rows and the
    /// browser download cache. Do not change it after release.
    fn id(&self) -> &'static str;

    /// Human readable name shown in the frontend.
    fn name(&self) -> &'static str;

    /// Headers needed when proxying this source's images.
    fn image_headers(&self) -> &'static [(&'static str, &'static str)] {
        &[]
    }

    async fn search_comic(&self, keyword: &str) -> Result<Vec<ComicBrief>>;

    async fn get_comic(&self, id: &str) -> Result<Comic>;

    async fn get_chapter(&self, comic_id: &str, chapter_id: &str) -> Result<ComicChapter>;
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct UnknownSource(pub String);

impl std::fmt::Display for UnknownSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "未知漫画源: {}", self.0)
    }
}

impl std::error::Error for UnknownSource {}

/// Registry of all compiled-in comic sources.
pub struct SourceRegistry {
    http: reqwest::Client,
    sources: Vec<Arc<dyn ComicSource>>,
    by_id: HashMap<String, Arc<dyn ComicSource>>,
    default: Arc<dyn ComicSource>,
}

impl SourceRegistry {
    pub fn new() -> Result<Self> {
        // A connect timeout keeps a dead source from blocking startup, while
        // leaving the total request duration unbounded for streamed images.
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .build()?;

        let sources: Vec<Arc<dyn ComicSource>> = vec![Arc::new(Manhuagui::new(http.clone()))];

        let mut by_id = HashMap::with_capacity(sources.len());
        for source in &sources {
            if by_id
                .insert(source.id().to_string(), source.clone())
                .is_some()
            {
                return Err(anyhow!("重复的漫画源 ID: {}", source.id()));
            }
        }

        let default = by_id
            .get(DEFAULT_SOURCE_ID)
            .cloned()
            .ok_or_else(|| anyhow!("默认漫画源 {DEFAULT_SOURCE_ID} 未注册"))?;

        Ok(Self {
            http,
            sources,
            by_id,
            default,
        })
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    pub fn list(&self) -> Vec<SourceInfo> {
        self.sources
            .iter()
            .map(|source| SourceInfo {
                id: source.id().to_string(),
                name: source.name().to_string(),
            })
            .collect()
    }

    pub fn all(&self) -> Vec<Arc<dyn ComicSource>> {
        self.sources.clone()
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn ComicSource>> {
        self.by_id.get(id).cloned()
    }

    pub fn default_source(&self) -> Arc<dyn ComicSource> {
        self.default.clone()
    }

    /// Resolve an optional source id. Missing or blank ids fall back to the
    /// default source so older API clients keep working.
    pub fn resolve(&self, id: Option<&str>) -> Result<Arc<dyn ComicSource>, UnknownSource> {
        match id.map(str::trim).filter(|id| !id.is_empty()) {
            Some(id) => self.get(id).ok_or_else(|| UnknownSource(id.to_string())),
            None => Ok(self.default_source()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_registered_sources() {
        let registry = SourceRegistry::new().unwrap();
        let sources = registry.list();

        assert!(
            sources
                .iter()
                .any(|source| source.id == MANHUAGUI_SOURCE_ID
                    && source.name == MANHUAGUI_SOURCE_NAME)
        );
    }

    #[test]
    fn resolves_default_for_missing_or_blank_source() {
        let registry = SourceRegistry::new().unwrap();

        assert_eq!(registry.resolve(None).unwrap().id(), DEFAULT_SOURCE_ID);
        assert_eq!(registry.resolve(Some("")).unwrap().id(), DEFAULT_SOURCE_ID);
        assert_eq!(
            registry.resolve(Some("  ")).unwrap().id(),
            DEFAULT_SOURCE_ID
        );
    }

    #[test]
    fn rejects_unknown_source() {
        let registry = SourceRegistry::new().unwrap();

        match registry.resolve(Some("not-a-source")) {
            Ok(source) => panic!("expected unknown source error, got {}", source.id()),
            Err(error) => {
                assert_eq!(error.0, "not-a-source");
                assert!(error.to_string().contains("未知漫画源"));
            }
        }
    }
}
