use crate::server::AppState;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::RwLock;
use std::time::{Duration, Instant};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;

const CACHE_TTL: Duration = Duration::from_secs(60);
const READ_BUFFER: usize = 256 * 1024;
const CHUNK_SIZE: u64 = 2 * 1024 * 1024;

/// Cached per-video metadata so the many range requests made by a video
/// player never hammer the SQLite database.
#[derive(Clone)]
pub struct VideoMeta {
    pub video_path: String,
    pub mime_type: Option<String>,
}

pub struct MetaCache(RwLock<HashMap<String, (VideoMeta, Instant)>>);

impl Default for MetaCache {
    fn default() -> Self {
        Self(RwLock::new(HashMap::new()))
    }
}

impl MetaCache {
    fn get(&self, id: &str) -> Option<VideoMeta> {
        let guard = self.0.read().unwrap();
        guard.get(id).and_then(|(meta, at)| {
            if at.elapsed() < CACHE_TTL {
                Some(meta.clone())
            } else {
                None
            }
        })
    }

    fn insert(&self, id: String, meta: VideoMeta) {
        let mut guard = self.0.write().unwrap();
        guard.insert(id, (meta, Instant::now()));
    }
}

async fn video_meta(state: &AppState, id: &str) -> Result<VideoMeta, (StatusCode, String)> {
    if let Some(meta) = state.video_meta_cache.get(id) {
        return Ok(meta);
    }

    let row = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT video_path, mime_type FROM videos WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        StatusCode::NOT_FOUND,
        "Video not found in store catalog".to_string(),
    ))?;

    let meta = VideoMeta {
        video_path: row.0,
        mime_type: row.1,
    };
    state.video_meta_cache.insert(id.to_string(), meta.clone());
    Ok(meta)
}

pub async fn stream_video_handler(
    State(state): State<Arc<AppState>>,
    Path(video_id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, String)> {
    // 1. Resolve video path + mime from cache (DB on first request only).
    let meta = video_meta(&state, &video_id).await?;
    let file_path = PathBuf::from(&meta.video_path);

    if !file_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!(
                "Video file missing on host system at path: {}",
                meta.video_path
            ),
        ));
    }

    // 2. Open file and get length.
    let mut file = File::open(&file_path).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to open file: {}", e),
        )
    })?;

    let total_size = file
        .metadata()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read metadata: {}", e),
            )
        })?
        .len();

    if total_size == 0 {
        return Err((StatusCode::NOT_FOUND, "Video file is empty".to_string()));
    }

    let mime_type = meta
        .mime_type
        .clone()
        .unwrap_or_else(|| "video/mp4".to_string());
    let content_hdr = header::HeaderValue::from_str(&mime_type)
        .unwrap_or_else(|_| header::HeaderValue::from_static("video/mp4"));

    // 3. HTTP Range Requests (206 Partial Content).
    if let Some(range_str) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(range_val) = range_str.strip_prefix("bytes=") {
            // Multiple ranges are deliberately not supported; a single range is
            // enough for browser video playback and avoids expensive multipart bodies.
            if range_val.contains(',') {
                return Ok(range_not_satisfiable(total_size));
            }
            let (start_text, end_text) = match range_val.split_once('-') {
                Some(range) => range,
                None => return Ok(range_not_satisfiable(total_size)),
            };
            let (start, end) = if start_text.is_empty() {
                let suffix_length = match end_text.parse::<u64>() {
                    Ok(length) if length > 0 => length.min(total_size),
                    _ => return Ok(range_not_satisfiable(total_size)),
                };
                (total_size - suffix_length, total_size - 1)
            } else {
                let start = match start_text.parse::<u64>() {
                    Ok(start) => start,
                    Err(_) => return Ok(range_not_satisfiable(total_size)),
                };
                let end = match end_text.parse::<u64>() {
                    Ok(end) => end.min(total_size - 1),
                    Err(_) if end_text.is_empty() => (start + CHUNK_SIZE - 1).min(total_size - 1),
                    Err(_) => return Ok(range_not_satisfiable(total_size)),
                };
                (start, end)
            };

            if start >= total_size || end >= total_size || start > end {
                return Ok(range_not_satisfiable(total_size));
            }

            let content_length = end - start + 1;
            file.seek(SeekFrom::Start(start))
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let reader = file.take(content_length);
            let stream = ReaderStream::with_capacity(reader, READ_BUFFER);
            let content_range = format!("bytes {}-{}/{}", start, end, total_size);

            let mut resp = Response::new(Body::from_stream(stream));
            resp.headers_mut().insert(header::CONTENT_TYPE, content_hdr);
            resp.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&content_range).unwrap(),
            );
            resp.headers_mut().insert(
                header::CONTENT_LENGTH,
                HeaderValue::from_str(&content_length.to_string()).unwrap(),
            );
            resp.headers_mut()
                .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=3600"),
            );
            *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
            return Ok(resp);
        }
    }

    // 4. Default: full content stream (HTTP 200).
    let stream = ReaderStream::with_capacity(file, READ_BUFFER);
    let mut resp = Response::new(Body::from_stream(stream));
    resp.headers_mut().insert(header::CONTENT_TYPE, content_hdr);
    resp.headers_mut().insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&total_size.to_string()).unwrap(),
    );
    resp.headers_mut()
        .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    Ok(resp)
}

fn range_not_satisfiable(total_size: u64) -> Response {
    (
        StatusCode::RANGE_NOT_SATISFIABLE,
        [(header::CONTENT_RANGE, format!("bytes */{}", total_size))],
        "Requested range not satisfiable",
    )
        .into_response()
}
