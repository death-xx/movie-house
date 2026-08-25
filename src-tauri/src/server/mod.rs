pub mod frontend;
pub mod orders;
pub mod routes;
pub mod streaming;

use axum::{
    routing::{get, post},
    Router,
};
use sqlx::SqlitePool;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;

pub struct AppState {
    pub db: SqlitePool,
    pub app_handle: AppHandle,
    pub video_meta_cache: streaming::MetaCache,
}

pub async fn start_embedded_server(
    app_handle: AppHandle,
    db: SqlitePool,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = Arc::new(AppState {
        db,
        app_handle,
        video_meta_cache: streaming::MetaCache::default(),
    });

    let app = Router::new()
        // React customer storefront (served from embedded build)
        .route("/", get(frontend::frontend_index))
        .route("/index.html", get(frontend::frontend_index))
        // Video Streaming Endpoint with 206 Range Request support
        .route("/stream/:video_id", get(streaming::stream_video_handler))
        // REST API
        .route("/api/catalog", get(routes::get_catalog_handler))
        .route("/api/categories", get(routes::get_categories_handler))
        .route("/api/checkout", post(routes::http_checkout_handler))
        .route("/api/notify", post(routes::http_notify_handler))
        .fallback(frontend::static_asset)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!(
        "⚡ Local WiFi Store Server running on http://0.0.0.0:{}",
        port
    );
    axum::serve(listener, app).await?;

    Ok(())
}
