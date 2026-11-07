use std::{env, sync::Arc};

use axum::{
    body::Body,
    extract::{Query, State},
    middleware::from_fn,
    response::IntoResponse,
    routing::{get, post, MethodRouter},
    Json, Router,
};
use entity::{history, lib_comic};
use futures::future::join_all;
use sea_orm::Set;
use tower_http::services::{ServeDir, ServeFile};

use serde::{Deserialize, Serialize};

use crate::{
    db,
    server::types::{AppError, AppResult},
    source::{Comic, ComicBrief, ComicChapter, ComicSource, SourceInfo, SourceRegistry},
};

use super::{
    middleware::{password_validate_middleware, wrap_response_middleware},
    AppState,
};

pub fn get_router() -> Router<AppState> {
    let auth_api_router = Router::new()
        .merge(search_comic())
        .merge(get_comic())
        .merge(get_chapter())
        .merge(get_sources())
        .merge(proxy_image())
        .merge(upsert_history())
        .merge(get_history())
        .merge(delete_history())
        .merge(get_library())
        .merge(add_to_library())
        .merge(remove_from_library())
        .merge(check_in_library())
        .merge(get_comic_history())
        .layer(from_fn(password_validate_middleware));

    let api_router = auth_api_router
        .merge(check_password())
        .layer(from_fn(wrap_response_middleware));

    let serve_dir = ServeDir::new("dist").fallback(ServeFile::new("dist/index.html"));

    Router::new()
        .nest("/api", api_router)
        .fallback_service(serve_dir)
}

fn search_comic() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(SearchComicQuery { keyword, source }): Query<SearchComicQuery>,
    ) -> AppResult<Json<Vec<ComicBrief>>> {
        let keyword = keyword.trim();
        if keyword.is_empty() {
            return Ok(Json(Vec::new()));
        }

        let source_id = source.as_deref().map(str::trim).filter(|id| !id.is_empty());

        let list = match source_id {
            Some(id) => {
                let source = resolve_source(&state, Some(id))?;
                source.search_comic(keyword).await?
            }
            None => search_all_sources(&state.sources, keyword).await?,
        };

        Ok(Json(list))
    }

    route("/search_comic", get(handler))
}

fn get_comic() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(GetComicBriefQuery { id, source }): Query<GetComicBriefQuery>,
    ) -> AppResult<Json<Comic>> {
        let source = resolve_source(&state, source.as_deref())?;
        let res = source.get_comic(&id).await?;
        Ok(Json(res))
    }

    route("/get_comic", get(handler))
}

fn get_chapter() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(GetChapterImagesQuery {
            comic_id,
            chapter_id,
            source,
        }): Query<GetChapterImagesQuery>,
    ) -> AppResult<Json<ComicChapter>> {
        let source = resolve_source(&state, source.as_deref())?;
        let chapter = source.get_chapter(&comic_id, &chapter_id).await?;
        Ok(Json(chapter))
    }

    route("/get_chapter", get(handler))
}

fn get_sources() -> Router<AppState> {
    async fn handler(State(state): State<AppState>) -> AppResult<Json<Vec<SourceInfo>>> {
        Ok(Json(state.sources.list()))
    }

    route("/get_sources", get(handler))
}

fn proxy_image() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(ProxyImageQuery { url, source }): Query<ProxyImageQuery>,
    ) -> AppResult<impl IntoResponse> {
        let source = resolve_source(&state, source.as_deref())?;
        let decoded_url =
            urlencoding::decode(&url).map_err(|_| AppError::bad_request("无效的图片地址"))?;
        let parsed_url = reqwest::Url::parse(decoded_url.as_ref())
            .map_err(|_| AppError::bad_request("无效的图片地址"))?;

        if !matches!(parsed_url.scheme(), "http" | "https") {
            return Err(AppError::bad_request("不支持的图片地址"));
        }

        let mut request = state.sources.http().get(parsed_url);
        for (name, value) in source.image_headers() {
            request = request.header(*name, *value);
        }

        let resp = request.send().await?;
        let headers = resp.headers().to_owned();
        let stream = resp.bytes_stream();

        Ok((headers, Body::from_stream(stream)))
    }

    route("/proxy_image", get(handler))
}

fn check_password() -> Router<AppState> {
    async fn handler(
        Json(CheckPasswordData { password }): Json<CheckPasswordData>,
    ) -> AppResult<Json<CheckPasswordResp>> {
        let coconfigured_password = env::var("PASSWORD").unwrap_or("".to_string());
        let configured_password = coconfigured_password.trim();

        Ok(Json(CheckPasswordResp {
            valid: configured_password.is_empty() || password.trim() == configured_password,
        }))
    }

    route("/check_password", post(handler))
}

fn upsert_history() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Json(UpsertHistoryData {
            source,
            comic_id,
            chapter_id,
            comic_name,
            chapter_name,
            page,
            visible,
        }): Json<UpsertHistoryData>,
    ) -> AppResult<Json<()>> {
        let source = resolve_source(&state, source.as_deref())?;

        db::upsert_history(
            &state.db,
            history::ActiveModel {
                source: Set(source.id().to_string()),
                comic_id: Set(comic_id),
                chapter_id: Set(chapter_id),
                comic_name: Set(comic_name),
                chapter_name: Set(chapter_name),
                page: Set(page),
                visible: Set(visible),
                updated_at: Set(chrono::Utc::now()),
                ..Default::default()
            },
        )
        .await?;

        Ok(Json(()))
    }

    route("/upsert_history", post(handler))
}

fn get_history() -> Router<AppState> {
    async fn handler(State(state): State<AppState>) -> AppResult<Json<Vec<history::Model>>> {
        let list = db::get_history(&state.db).await?;
        Ok(Json(list))
    }

    route("/get_history", get(handler))
}

fn delete_history() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Json(DeleteHistoryData { source, comic_id }): Json<DeleteHistoryData>,
    ) -> AppResult<Json<()>> {
        let source = resolve_source(&state, source.as_deref())?;
        db::delete_history(&state.db, source.id(), &comic_id).await?;
        Ok(Json(()))
    }

    route("/delete_history", post(handler))
}

fn get_library() -> Router<AppState> {
    async fn handler(State(state): State<AppState>) -> AppResult<Json<Vec<lib_comic::Model>>> {
        let list = db::get_library(&state.db).await?;
        Ok(Json(list))
    }

    route("/get_library", get(handler))
}

fn add_to_library() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Json(AddToLibraryData {
            source,
            id,
            name,
            cover,
        }): Json<AddToLibraryData>,
    ) -> AppResult<Json<()>> {
        let source = resolve_source(&state, source.as_deref())?;

        db::add_to_library(
            &state.db,
            lib_comic::ActiveModel {
                source: Set(source.id().to_string()),
                id: Set(id),
                name: Set(name),
                cover: Set(cover),
                updated_at: Set(chrono::Utc::now()),
                ..Default::default()
            },
        )
        .await?;
        Ok(Json(()))
    }

    route("/add_to_library", post(handler))
}

fn remove_from_library() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Json(RemoveFromLibraryData { source, id }): Json<RemoveFromLibraryData>,
    ) -> AppResult<Json<()>> {
        let source = resolve_source(&state, source.as_deref())?;
        db::remove_from_library(&state.db, source.id(), &id).await?;
        Ok(Json(()))
    }

    route("/remove_from_library", post(handler))
}

fn check_in_library() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(CheckInLibraryData { source, id }): Query<CheckInLibraryData>,
    ) -> AppResult<Json<CheckInLibraryResp>> {
        let source = resolve_source(&state, source.as_deref())?;
        let in_library = db::check_in_library(&state.db, source.id(), &id).await?;
        Ok(Json(CheckInLibraryResp { in_library }))
    }

    route("/check_in_library", get(handler))
}

fn get_comic_history() -> Router<AppState> {
    async fn handler(
        State(state): State<AppState>,
        Query(GetComicHistoryData { source, id }): Query<GetComicHistoryData>,
    ) -> AppResult<Json<GetComicHistoryResp>> {
        let source = resolve_source(&state, source.as_deref())?;
        let history = db::get_comic_history(&state.db, source.id(), &id).await?;
        Ok(Json(GetComicHistoryResp { history }))
    }

    route("/get_comic_history", get(handler))
}

fn resolve_source(state: &AppState, id: Option<&str>) -> AppResult<Arc<dyn ComicSource>> {
    state
        .sources
        .resolve(id)
        .map_err(|error| AppError::bad_request(error.to_string()))
}

async fn search_all_sources(
    registry: &SourceRegistry,
    keyword: &str,
) -> anyhow::Result<Vec<ComicBrief>> {
    let results = join_all(registry.all().into_iter().map(|source| {
        let keyword = keyword.to_string();
        async move {
            let result = source.search_comic(&keyword).await;
            (source.id(), result)
        }
    }))
    .await;

    let mut comics = Vec::new();
    let mut first_error = None;

    for (source_id, result) in results {
        match result {
            Ok(mut list) => comics.append(&mut list),
            Err(error) => {
                tracing::warn!(source = source_id, error = %error, "漫画源搜索失败");
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }

    if comics.is_empty() {
        if let Some(error) = first_error {
            return Err(error);
        }
    }

    Ok(comics)
}

fn route(path: &str, method_router: MethodRouter<AppState>) -> Router<AppState> {
    Router::new().route(path, method_router)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchComicQuery {
    keyword: String,
    source: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetComicBriefQuery {
    id: String,
    source: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetChapterImagesQuery {
    comic_id: String,
    chapter_id: String,
    source: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyImageQuery {
    url: String,
    source: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckPasswordData {
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckPasswordResp {
    valid: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertHistoryData {
    source: Option<String>,
    comic_id: String,
    chapter_id: String,
    comic_name: String,
    chapter_name: String,
    page: i32,
    visible: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteHistoryData {
    source: Option<String>,
    comic_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddToLibraryData {
    source: Option<String>,
    id: String,
    name: String,
    cover: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveFromLibraryData {
    source: Option<String>,
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckInLibraryData {
    source: Option<String>,
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckInLibraryResp {
    in_library: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetComicHistoryData {
    source: Option<String>,
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetComicHistoryResp {
    history: Option<history::Model>,
}
