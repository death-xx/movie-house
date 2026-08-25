use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::db::models::{
    AdminStats, AppNotification, Category, CopyProgressEvent, DiscoveredVideoItem,
    IncomeAnalyticsPoint, IncomeAnalyticsResponse, Order, OrderItem, ScanResult,
    StorePricingSettings, Video,
};
use crate::network::{get_network_config, NetworkConfig};

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderWithItems {
    pub order: Order,
    pub items: Vec<OrderItem>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMoviePayload {
    pub category_id: String,
    pub content_type: String, // "movie" or "series"
    pub title: String,
    pub description: Option<String>,
    pub duration_seconds: i64,
    pub release_year: Option<i64>,
    pub price_ks: i64,
    pub episode_number: Option<i64>,
    pub episode_count: Option<i64>,
    pub season_number: Option<i64>,
    pub series_title: Option<String>,
    pub video_path: String,
    pub hard_disk_label: Option<String>,
    pub trailer_path: Option<String>,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryPayload {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryPayload {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DriveInfo {
    pub path: String,
    pub label: String,
    pub available_space_bytes: u64,
}

#[tauri::command]
pub async fn get_lan_status() -> Result<NetworkConfig, String> {
    Ok(get_network_config(8080))
}

#[tauri::command]
pub async fn get_admin_stats(pool: State<'_, SqlitePool>) -> Result<AdminStats, String> {
    let total_movies: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM videos")
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let pending_orders: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM orders WHERE status = 'pending'")
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let completed_orders: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM orders WHERE status = 'completed'")
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    let rev_row: (Option<i64>,) =
        sqlx::query_as("SELECT SUM(total_ks) FROM orders WHERE status = 'completed'")
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    Ok(AdminStats {
        total_movies: total_movies.0,
        pending_orders: pending_orders.0,
        completed_orders: completed_orders.0,
        total_revenue_cents: rev_row.0.unwrap_or(0),
    })
}

#[tauri::command]
pub async fn get_store_settings(
    pool: State<'_, SqlitePool>,
) -> Result<StorePricingSettings, String> {
    let rows = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM settings")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut movie_price_ks = 200;
    let mut series_episode_price_ks = 150;
    let mut currency_symbol = "Ks".to_string();
    let mut default_phone_copy_path = "".to_string();
    let mut hard_disk_paths = Vec::new();

    for (k, v) in rows {
        match k.as_str() {
            "movie_price_ks" => movie_price_ks = v.parse().unwrap_or(200),
            "series_episode_price_ks" => series_episode_price_ks = v.parse().unwrap_or(150),
            "currency_symbol" => currency_symbol = v,
            "default_phone_copy_path" => default_phone_copy_path = v,
            "hard_disk_paths" => {
                if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&v) {
                    let paths: Vec<String> = parsed
                        .into_iter()
                        .filter(|path| !path.trim().is_empty())
                        .collect();
                    hard_disk_paths = paths;
                }
            }
            _ => {}
        }
    }

    Ok(StorePricingSettings {
        movie_price_ks,
        series_episode_price_ks,
        currency_symbol,
        default_phone_copy_path,
        hard_disk_paths,
    })
}

#[tauri::command]
pub async fn save_store_settings(
    mut settings: StorePricingSettings,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    settings.hard_disk_paths = settings
        .hard_disk_paths
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect();
    let paths_json = serde_json::to_string(&settings.hard_disk_paths).unwrap_or_default();

    let items = [
        ("movie_price_ks", settings.movie_price_ks.to_string()),
        (
            "series_episode_price_ks",
            settings.series_episode_price_ks.to_string(),
        ),
        ("currency_symbol", settings.currency_symbol),
        ("default_phone_copy_path", settings.default_phone_copy_path),
        ("hard_disk_paths", paths_json),
    ];

    for (k, v) in items {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
            .bind(k)
            .bind(v)
            .execute(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_movies(pool: State<'_, SqlitePool>) -> Result<Vec<Video>, String> {
    let videos = sqlx::query_as::<_, Video>("SELECT * FROM videos ORDER BY created_at DESC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(videos)
}

#[tauri::command]
pub async fn get_all_categories(pool: State<'_, SqlitePool>) -> Result<Vec<Category>, String> {
    let cats = sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(cats)
}

#[tauri::command]
pub async fn create_category(
    payload: CreateCategoryPayload,
    pool: State<'_, SqlitePool>,
) -> Result<Category, String> {
    let name = payload.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Category name must be between 1 and 80 characters.".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let slug = format!("custom-{}", &id[..8]);
    sqlx::query("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(&slug)
        .execute(pool.inner())
        .await
        .map_err(|error| {
            if error.to_string().contains("UNIQUE") {
                "A category with this name already exists.".to_string()
            } else {
                error.to_string()
            }
        })?;

    sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_category(
    payload: UpdateCategoryPayload,
    pool: State<'_, SqlitePool>,
) -> Result<Category, String> {
    let name = payload.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Category name must be between 1 and 80 characters.".to_string());
    }

    let result = sqlx::query("UPDATE categories SET name = ? WHERE id = ?")
        .bind(name)
        .bind(&payload.id)
        .execute(pool.inner())
        .await
        .map_err(|error| {
            if error.to_string().contains("UNIQUE") {
                "A category with this name already exists.".to_string()
            } else {
                error.to_string()
            }
        })?;
    if result.rows_affected() == 0 {
        return Err("Category not found.".to_string());
    }

    sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = ?")
        .bind(payload.id)
        .fetch_one(pool.inner())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_category(
    category_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    let usage: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM videos WHERE category_id = ?")
        .bind(&category_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|error| error.to_string())?;
    if usage.0 > 0 {
        return Err("Move or delete this category's titles before deleting it.".to_string());
    }

    let result = sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(category_id)
        .execute(pool.inner())
        .await
        .map_err(|error| error.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Category not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn add_movie(
    payload: CreateMoviePayload,
    pool: State<'_, SqlitePool>,
) -> Result<Video, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"INSERT INTO videos 
           (id, category_id, content_type, title, description, duration_seconds, release_year, 
            price_ks, episode_number, season_number, series_title, video_path, hard_disk_label, 
            trailer_path, thumbnail_path, file_size_bytes, mime_type, is_available, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1073741824, 'video/mp4', 1, ?)"#,
    )
    .bind(&id)
    .bind(&payload.category_id)
    .bind(&payload.content_type)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(payload.duration_seconds)
    .bind(payload.release_year)
    .bind(payload.price_ks)
    .bind(payload.episode_number)
    .bind(payload.season_number)
    .bind(&payload.series_title)
    .bind(&payload.video_path)
    .bind(&payload.hard_disk_label)
    .bind(&payload.trailer_path)
    .bind(&payload.thumbnail_path)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE videos SET episode_count = ? WHERE id = ?")
        .bind(payload.episode_count)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(&id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(video)
}

#[tauri::command]
pub async fn get_all_orders(pool: State<'_, SqlitePool>) -> Result<Vec<Order>, String> {
    let orders =
        sqlx::query_as::<_, Order>("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50")
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    Ok(orders)
}

#[tauri::command]
pub async fn get_order_details(
    order_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<OrderWithItems, String> {
    let order = sqlx::query_as::<_, Order>("SELECT * FROM orders WHERE id = ?")
        .bind(&order_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM order_items WHERE order_id = ?")
        .bind(&order_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(OrderWithItems { order, items })
}

#[tauri::command]
pub async fn update_order_status(
    order_id: String,
    status: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE orders SET status = ? WHERE id = ?")
        .bind(&status)
        .bind(&order_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Lists plugged-in USB drives / Phone mount paths on the host system
#[tauri::command]
pub async fn get_available_drives() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'D'..=b'Z' {
            let drive_str = format!("{}:\\", letter as char);
            let path = Path::new(&drive_str);
            if path.exists() {
                drives.push(DriveInfo {
                    path: drive_str.clone(),
                    label: format!("Drive ({})", drive_str),
                    available_space_bytes: 64 * 1024 * 1024 * 1024, // 64 GB placeholder
                });
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux / Media mount points
        let media_path = Path::new("/media");
        if media_path.exists() {
            if let Ok(mut entries) = fs::read_dir(media_path).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let sub = entry.path();
                    if let Ok(mut sub_entries) = fs::read_dir(&sub).await {
                        while let Ok(Some(sub_entry)) = sub_entries.next_entry().await {
                            let p = sub_entry.path();
                            drives.push(DriveInfo {
                                path: p.to_string_lossy().to_string(),
                                label: format!(
                                    "Phone/USB: {}",
                                    sub_entry.file_name().to_string_lossy()
                                ),
                                available_space_bytes: 32 * 1024 * 1024 * 1024,
                            });
                        }
                    }
                }
            }
        }

        // Also add user Downloads folder as test destination
        if let Some(home) = std::env::var_os("HOME") {
            let dl = PathBuf::from(home).join("Downloads");
            if dl.exists() {
                drives.push(DriveInfo {
                    path: dl.to_string_lossy().to_string(),
                    label: "Downloads Folder (Test Destination)".to_string(),
                    available_space_bytes: 100 * 1024 * 1024 * 1024,
                });
            }
        }
    }

    Ok(drives)
}

/// 🚀 One-Click File Copy Engine: copies all movies/series in the customer's cart
/// directly to their plugged-in phone/USB drive with live progress events
#[tauri::command]
pub async fn copy_order_to_device(
    order_id: String,
    destination_folder: String,
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    let dest_path = PathBuf::from(&destination_folder);
    if !dest_path.exists() {
        fs::create_dir_all(&dest_path)
            .await
            .map_err(|e| format!("Failed to create destination folder: {}", e))?;
    }
    if !dest_path.is_dir() {
        return Err("The selected destination is not a folder.".to_string());
    }

    // 1. Fetch Order Items
    let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM order_items WHERE order_id = ?")
        .bind(&order_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if items.is_empty() {
        return Err("No items found in this order to copy.".to_string());
    }

    // Validate every source before changing the order state or copying anything.
    // Demo paths must never produce a fake successful delivery in production.
    let mut total_bytes = 0_u64;
    for item in &items {
        let source = PathBuf::from(&item.video_path);
        match fs::metadata(&source).await {
            Ok(metadata) if metadata.is_file() => {
                total_bytes = total_bytes
                    .checked_add(metadata.len())
                    .ok_or_else(|| "Copy size is too large.".to_string())?;
            }
            Ok(_) => return Err(format!("Source is not a file: {}", source.display())),
            Err(_) => return Err(format!("Source file is missing: {}", source.display())),
        }
    }

    // Set order status to "copying"
    let _ = sqlx::query("UPDATE orders SET status = 'copying' WHERE id = ?")
        .bind(&order_id)
        .execute(pool.inner())
        .await;

    let total_files = items.len();

    let mut total_copied_bytes: u64 = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();
    const EMIT_INTERVAL: Duration = Duration::from_millis(80);

    // Rate-limit Tauri IPC progress events to ~12/sec to avoid flooding the
    // webview during multi-GB copies.
    macro_rules! maybe_emit {
        ($event:expr) => {{
            let now = Instant::now();
            if now.duration_since(last_emit) >= EMIT_INTERVAL
                || ($event).overall_progress_percent >= 100.0
            {
                let _ = app_handle.emit("copy:progress", &$event);
                last_emit = now;
            }
        }};
    }

    // 2. Process and copy each file chunk by chunk
    for (idx, item) in items.iter().enumerate() {
        let src_file_path = PathBuf::from(&item.video_path);
        let filename = src_file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("{}.mp4", item.video_title.replace(' ', "_")));

        let target_file_path = dest_path.join(&filename);

        let mut src_file = File::open(&src_file_path)
            .await
            .map_err(|e| format!("Failed to open source file: {}", e))?;

        let mut dst_file = File::create(&target_file_path)
            .await
            .map_err(|e| format!("Failed to create destination file: {}", e))?;

        let mut buffer = vec![0u8; 4 * 1024 * 1024]; // 4MB buffer
        let mut file_copied = 0u64;
        let file_size = src_file
            .metadata()
            .await
            .map(|m| m.len())
            .unwrap_or(item.file_size_bytes as u64);

        loop {
            let n = src_file
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Read error: {}", e))?;
            if n == 0 {
                break;
            }
            dst_file
                .write_all(&buffer[..n])
                .await
                .map_err(|e| format!("Write error: {}", e))?;

            file_copied += n as u64;
            total_copied_bytes += n as u64;

            let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.1);
            let speed_mb_per_sec = (total_copied_bytes as f64 / (1024.0 * 1024.0)) / elapsed_secs;

            let file_pct = if file_size > 0 {
                (file_copied as f64 / file_size as f64) * 100.0
            } else {
                100.0
            };
            let overall_pct = if total_bytes > 0 {
                (total_copied_bytes as f64 / total_bytes as f64) * 100.0
            } else {
                100.0
            };

            let event = CopyProgressEvent {
                order_id: order_id.clone(),
                current_file_index: idx + 1,
                total_files,
                current_file_name: filename.clone(),
                file_progress_percent: file_pct.min(100.0),
                overall_progress_percent: overall_pct.min(100.0),
                bytes_copied: total_copied_bytes,
                total_bytes,
                speed_mb_per_sec,
                status: "copying".to_string(),
                error_message: None,
            };
            maybe_emit!(event);
        }
    }

    // 3. Mark Order Finished and Completed
    let _ = sqlx::query("UPDATE orders SET status = 'completed' WHERE id = ?")
        .bind(&order_id)
        .execute(pool.inner())
        .await;

    let final_event = CopyProgressEvent {
        order_id: order_id.clone(),
        current_file_index: total_files,
        total_files,
        current_file_name: "All Files Copied Successfully".to_string(),
        file_progress_percent: 100.0,
        overall_progress_percent: 100.0,
        bytes_copied: total_bytes,
        total_bytes,
        speed_mb_per_sec: 0.0,
        status: "finished".to_string(),
        error_message: None,
    };
    let _ = app_handle.emit("copy:progress", &final_event);

    Ok(())
}

// ─── Income Analytics ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_income_analytics(
    timeframe: String,
    pool: State<'_, SqlitePool>,
) -> Result<IncomeAnalyticsResponse, String> {
    let (date_format, date_subtract, _label_format) = match timeframe.as_str() {
        "daily" => ("%Y-%m-%d", "'-7 days'", "%a"),
        "weekly" => ("%Y-W%W", "'-8 weeks'", "W%W"),
        "monthly" => ("%Y-%m", "'-12 months'", "%b %Y"),
        "yearly" => ("%Y", "'-5 years'", "%Y"),
        _ => ("%Y-%m-%d", "'-7 days'", "%a"),
    };

    let query = format!(
        r#"SELECT
            strftime('{}', created_at) as period,
            COALESCE(SUM(total_ks), 0) as revenue,
            COUNT(*) as order_count
        FROM orders
        WHERE status = 'completed'
          AND created_at >= datetime('now', {})
        GROUP BY period
        ORDER BY period ASC"#,
        date_format, date_subtract
    );

    let rows = sqlx::query_as::<_, (String, i64, i64)>(&query)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let points: Vec<IncomeAnalyticsPoint> = rows
        .iter()
        .map(|(period, revenue, count)| IncomeAnalyticsPoint {
            label: period.clone(),
            date: period.clone(),
            revenue_ks: *revenue,
            orders_count: *count,
        })
        .collect();

    let total_revenue_ks: i64 = points.iter().map(|p| p.revenue_ks).sum();
    let total_orders: i64 = points.iter().map(|p| p.orders_count).sum();
    let average_order_ks = if total_orders > 0 {
        total_revenue_ks / total_orders
    } else {
        0
    };

    // Simple growth calculation: compare last half vs first half
    let mid = points.len() / 2;
    let first_half: i64 = points[..mid].iter().map(|p| p.revenue_ks).sum();
    let second_half: i64 = points[mid..].iter().map(|p| p.revenue_ks).sum();
    let growth_percent = if first_half > 0 {
        ((second_half - first_half) as f64 / first_half as f64) * 100.0
    } else if second_half > 0 {
        100.0
    } else {
        0.0
    };

    Ok(IncomeAnalyticsResponse {
        timeframe,
        total_revenue_ks,
        total_orders,
        average_order_ks,
        growth_percent,
        points,
    })
}

// ─── Hard Disk Scanner ─────────────────────────────────────────────

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "wmv", "webm", "m4v", "ts"];

fn parse_video_filename(
    file_name: &str,
) -> (String, String, Option<i64>, Option<i64>, Option<String>) {
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Simple pattern matching without regex crate
    let upper = stem.to_uppercase();

    // Check for S##E## pattern
    if let Some(s_pos) = upper.find('S') {
        let after_s = &upper[s_pos + 1..];
        if let Some(e_pos) = after_s.find('E') {
            let season_str = &after_s[..e_pos];
            let ep_str_start = e_pos + 1;
            if let Ok(season) = season_str.trim().parse::<i64>() {
                let ep_rest = &after_s[ep_str_start..];
                let ep_str: String = ep_rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(episode) = ep_str.parse::<i64>() {
                    // Clean title: everything before S##E##
                    let title_part = &stem[..s_pos].trim_end_matches(&[' ', '.', '_', '-'][..]);
                    let clean_title = title_part.replace(&['_', '.'][..], " ").trim().to_string();
                    return (
                        format!("{} - S{:02}E{:02}", clean_title, season, episode),
                        "series".to_string(),
                        Some(season),
                        Some(episode),
                        Some(clean_title),
                    );
                }
            }
        }
    }

    // Check for EP## or Episode ## pattern
    for prefix in &["EP", "EPISODE"] {
        if let Some(pos) = upper.find(prefix) {
            let after = &upper[pos + prefix.len()..];
            let after_trimmed = after.trim_start_matches(&[' ', '.', '_', '-'][..]);
            let ep_str: String = after_trimmed
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(episode) = ep_str.parse::<i64>() {
                let title_part = &stem[..pos].trim_end_matches(&[' ', '.', '_', '-'][..]);
                let clean_title = title_part.replace(&['_', '.'][..], " ").trim().to_string();
                return (
                    format!("{} - Episode {:02}", clean_title, episode),
                    "series".to_string(),
                    Some(1),
                    Some(episode),
                    Some(clean_title),
                );
            }
        }
    }

    // It's a movie - clean up the title
    let clean = stem.replace(&['_', '.'][..], " ").trim().to_string();

    // Remove common tags like 1080p, 720p, WEB-DL, BluRay, x264, etc.
    let tags = [
        "1080p", "720p", "480p", "2160p", "4K", "WEB-DL", "WEBRip", "BluRay", "BDRip", "HDRip",
        "DVDRip", "x264", "x265", "HEVC", "AAC", "DTS", "YIFY", "RARBG",
    ];
    let mut title = clean.clone();
    for tag in tags {
        if let Some(pos) = title.to_uppercase().find(&tag.to_uppercase()) {
            title = title[..pos]
                .trim_end_matches(&[' ', '-', '.'][..])
                .to_string();
        }
    }
    let title = if title.is_empty() { clean } else { title };

    (title, "movie".to_string(), None, None, None)
}

#[tauri::command]
pub async fn scan_hard_drives_for_media(
    folder_paths: Vec<String>,
    default_category_id: Option<String>,
    pool: State<'_, SqlitePool>,
) -> Result<ScanResult, String> {
    let mut all_items: Vec<DiscoveredVideoItem> = Vec::new();
    let mut scanned_files: usize = 0;

    for folder in &folder_paths {
        let folder_path = PathBuf::from(folder);
        if !folder_path.exists() {
            continue;
        }
        scan_directory_recursive(&folder_path, folder, &mut all_items, &mut scanned_files).await;
    }

    // Check which are already in the database (HashSet for O(1) lookups)
    let existing_paths: std::collections::HashSet<String> =
        sqlx::query_as::<_, (String,)>("SELECT video_path FROM videos")
            .fetch_all(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|(p,)| p)
            .collect();

    let cat_id = default_category_id.unwrap_or_else(|| "cat-action".to_string());
    let mut added_count = 0usize;
    let mut skipped_count = 0usize;

    for item in &all_items {
        if existing_paths.contains(&item.file_path) {
            skipped_count += 1;
            continue;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let price = if item.content_type == "series" {
            150
        } else {
            200
        };

        let _ = sqlx::query(
            r#"INSERT INTO videos
               (id, category_id, content_type, title, description, duration_seconds, release_year,
                price_ks, episode_number, season_number, series_title, video_path, hard_disk_label,
                file_size_bytes, mime_type, is_available)
               VALUES (?, ?, ?, ?, NULL, 0, NULL, ?, ?, ?, ?, ?, ?, ?, 'video/mp4', 1)"#,
        )
        .bind(&id)
        .bind(&cat_id)
        .bind(&item.content_type)
        .bind(&item.parsed_title)
        .bind(price)
        .bind(item.episode_number)
        .bind(item.season_number)
        .bind(&item.series_title)
        .bind(&item.file_path)
        .bind(&item.hard_disk_label)
        .bind(item.file_size_bytes)
        .execute(pool.inner())
        .await;

        added_count += 1;
    }

    Ok(ScanResult {
        scanned_files,
        added_count,
        skipped_count,
        items: all_items,
    })
}

async fn scan_directory_recursive(
    dir: &Path,
    root_folder: &str,
    items: &mut Vec<DiscoveredVideoItem>,
    scanned: &mut usize,
) {
    let mut entries = match fs::read_dir(dir).await {
        Ok(e) => e,
        Err(_) => return,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_dir() {
            Box::pin(scan_directory_recursive(&path, root_folder, items, scanned)).await;
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                *scanned += 1;
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let file_size = fs::metadata(&path)
                    .await
                    .map(|m| m.len() as i64)
                    .unwrap_or(0);

                let (parsed_title, content_type, season, episode, series_title) =
                    parse_video_filename(&file_name);

                let disk_label = format!("Folder: {}", root_folder);

                items.push(DiscoveredVideoItem {
                    file_name,
                    file_path: path.to_string_lossy().to_string(),
                    file_size_bytes: file_size,
                    parsed_title,
                    content_type,
                    season_number: season,
                    episode_number: episode,
                    series_title,
                    hard_disk_label: disk_label,
                });
            }
        }
    }
}

// ─── Notifications ─────────────────────────────────────────────────

#[tauri::command]
pub async fn create_customer_notification(
    title: String,
    customer_info: String,
    task_type: String,
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<AppNotification, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO notifications (id, title, customer_info, task_type, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(&customer_info)
    .bind(&task_type)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let notif = AppNotification {
        id,
        title: title.clone(),
        customer_info: customer_info.clone(),
        task_type,
        is_read: false,
        created_at: now,
    };

    let _ = app_handle.emit("notification:new", &notif);

    Ok(notif)
}

#[tauri::command]
pub async fn get_notifications(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AppNotification>, String> {
    let notifs = sqlx::query_as::<_, AppNotification>(
        "SELECT id, title, customer_info, task_type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(notifs)
}

#[tauri::command]
pub async fn mark_notification_read(
    notification_id: String,
    pool: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE notifications SET is_read = 1 WHERE id = ?")
        .bind(&notification_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
