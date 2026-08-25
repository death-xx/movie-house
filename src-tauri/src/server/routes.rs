use crate::db::models::{Category, VideoCatalogItem, VideoWithCategory};
use crate::server::orders::{process_order, validate_checkout, CheckoutPayload};
use crate::server::AppState;
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use std::sync::Arc;
use tauri::Emitter;

pub async fn get_categories_handler(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let categories = sqlx::query_as::<_, Category>(
        "SELECT id, name, slug, created_at FROM categories ORDER BY name ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(categories))
}

pub async fn get_catalog_handler(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, VideoCatalogItem>(
        r#"
        SELECT 
            v.id,
            v.category_id,
            c.name as category_name,
            v.content_type,
            v.title,
            v.description,
            v.duration_seconds,
            v.release_year,
            v.price_ks,
            v.episode_number,
            v.episode_count,
            v.season_number,
            v.series_title,
            v.trailer_path,
            v.thumbnail_path,
            v.file_size_bytes,
            v.hard_disk_label,
            v.is_available
        FROM videos v
        JOIN categories c ON v.category_id = c.id
        WHERE v.is_available = 1
        ORDER BY v.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let catalog: Vec<VideoWithCategory> = rows
        .into_iter()
        .map(|r| VideoWithCategory {
            id: r.id.clone(),
            category_id: r.category_id,
            category_name: r.category_name,
            content_type: r.content_type,
            title: r.title,
            description: r.description,
            duration_seconds: r.duration_seconds,
            release_year: r.release_year,
            price_ks: r.price_ks,
            episode_number: r.episode_number,
            episode_count: r.episode_count,
            season_number: r.season_number,
            series_title: r.series_title,
            trailer_url: Some(format!("/stream/{}", r.id)),
            thumbnail_url: r.thumbnail_path,
            file_size_bytes: r.file_size_bytes,
            hard_disk_label: r.hard_disk_label,
            is_available: r.is_available,
        })
        .collect();

    Ok(Json(catalog))
}

pub async fn http_checkout_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CheckoutPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    validate_checkout(&payload).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    let notif = process_order(payload, &state)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Push real-time notification directly to Desktop Tauri Admin UI
    let _ = state.app_handle.emit("order:created", &notif);

    Ok(Json(json!({
        "success": true,
        "order": notif,
        "message": "Order placed successfully. Transmitted to store counter."
    })))
}

#[derive(serde::Deserialize)]
pub struct NotifyRequest {
    pub title: String,
    pub customer_info: String,
    pub task_type: Option<String>,
}

pub async fn http_notify_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NotifyRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let task_type = payload
        .task_type
        .unwrap_or_else(|| "coming_soon_request".to_string());

    sqlx::query(
        "INSERT INTO notifications (id, title, customer_info, task_type, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .bind(&id)
    .bind(&payload.title)
    .bind(&payload.customer_info)
    .bind(&task_type)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Send real-time desktop notification
    let _ = state.app_handle.emit(
        "notification:new",
        &json!({
            "id": id,
            "title": payload.title,
            "customer_info": payload.customer_info,
            "task_type": task_type,
            "is_read": false,
            "created_at": now,
        }),
    );

    Ok(Json(json!({
        "success": true,
        "message": "Notification sent to store!"
    })))
}
