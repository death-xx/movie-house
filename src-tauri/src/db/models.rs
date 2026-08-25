use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Video {
    pub id: String,
    pub category_id: String,
    pub content_type: String, // "movie" or "series"
    pub title: String,
    pub description: Option<String>,
    pub duration_seconds: i64,
    pub release_year: Option<i64>,
    pub price_ks: i64, // Local currency in Kyat (e.g. 200 Ks)
    pub episode_number: Option<i64>,
    pub episode_count: Option<i64>,
    pub season_number: Option<i64>,
    pub series_title: Option<String>,
    pub video_path: String, // Absolute path on a configured storage drive
    pub hard_disk_label: Option<String>, // e.g. "Disk 1 (D:)", "Disk 2 (E:)"
    pub trailer_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_size_bytes: i64,
    pub mime_type: String,
    pub is_available: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Order {
    pub id: String,
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub device_ip: String,
    pub status: String, // "pending", "copying", "completed", "cancelled"
    pub total_ks: i64,
    pub total_size_bytes: i64,
    pub payment_method: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderItem {
    pub id: String,
    pub order_id: String,
    pub video_id: String,
    pub video_title: String,
    pub video_path: String,
    pub price_ks: i64,
    pub file_size_bytes: i64,
    pub content_type: String,
    pub episode_info: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VideoCatalogItem {
    pub id: String,
    pub category_id: String,
    pub category_name: String,
    pub content_type: String,
    pub title: String,
    pub description: Option<String>,
    pub duration_seconds: i64,
    pub release_year: Option<i64>,
    pub price_ks: i64,
    pub episode_number: Option<i64>,
    pub episode_count: Option<i64>,
    pub season_number: Option<i64>,
    pub series_title: Option<String>,
    pub trailer_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_size_bytes: i64,
    pub hard_disk_label: Option<String>,
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoWithCategory {
    pub id: String,
    pub category_id: String,
    pub category_name: String,
    pub content_type: String,
    pub title: String,
    pub description: Option<String>,
    pub duration_seconds: i64,
    pub release_year: Option<i64>,
    pub price_ks: i64,
    pub episode_number: Option<i64>,
    pub episode_count: Option<i64>,
    pub season_number: Option<i64>,
    pub series_title: Option<String>,
    pub trailer_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub file_size_bytes: i64,
    pub hard_disk_label: Option<String>,
    pub is_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminStats {
    pub total_movies: i64,
    pub pending_orders: i64,
    pub completed_orders: i64,
    pub total_revenue_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoreSetting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorePricingSettings {
    pub movie_price_ks: i64,
    pub series_episode_price_ks: i64,
    pub currency_symbol: String,
    pub default_phone_copy_path: String,
    pub hard_disk_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopyProgressEvent {
    pub order_id: String,
    pub current_file_index: usize,
    pub total_files: usize,
    pub current_file_name: String,
    pub file_progress_percent: f64,
    pub overall_progress_percent: f64,
    pub bytes_copied: u64,
    pub total_bytes: u64,
    pub speed_mb_per_sec: f64,
    pub status: String, // "copying", "finished", "error"
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomeAnalyticsPoint {
    pub label: String,
    pub date: String,
    pub revenue_ks: i64,
    pub orders_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomeAnalyticsResponse {
    pub timeframe: String,
    pub total_revenue_ks: i64,
    pub total_orders: i64,
    pub average_order_ks: i64,
    pub growth_percent: f64,
    pub points: Vec<IncomeAnalyticsPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredVideoItem {
    pub file_name: String,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub parsed_title: String,
    pub content_type: String, // "movie" or "series"
    pub season_number: Option<i64>,
    pub episode_number: Option<i64>,
    pub series_title: Option<String>,
    pub hard_disk_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub scanned_files: usize,
    pub added_count: usize,
    pub skipped_count: usize,
    pub items: Vec<DiscoveredVideoItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AppNotification {
    pub id: String,
    pub title: String,
    pub customer_info: String,
    pub task_type: String,
    pub is_read: bool,
    pub created_at: String,
}
