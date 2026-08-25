pub mod commands;
pub mod db;
pub mod network;
pub mod server;

use commands::admin::{
    add_movie, copy_order_to_device, create_category, create_customer_notification,
    delete_category, get_admin_stats, get_all_categories, get_all_movies, get_all_orders,
    get_available_drives, get_income_analytics, get_lan_status, get_notifications,
    get_order_details, get_store_settings, mark_notification_read, save_store_settings,
    scan_hard_drives_for_media, update_category, update_order_status,
};
use db::init_db_pool;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. Resolve local SQLite database storage directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".data"));

            if !app_data_dir.exists() {
                let _ = std::fs::create_dir_all(&app_data_dir);
            }

            let db_path = app_data_dir.join("movie_house.db");
            let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

            // 2. Initialize Database & Launch Axum Server asynchronously
            tauri::async_runtime::block_on(async {
                match init_db_pool(&db_url).await {
                    Ok(pool) => {
                        app_handle.manage(pool.clone());

                        let server_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) =
                                server::start_embedded_server(server_handle, pool, 8080).await
                            {
                                eprintln!("Axum Embedded WiFi Server encountered error: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize SQLite Database: {}", e);
                    }
                }
            });

            println!("Offline Movie House Desktop Storage Hub Initialized.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_lan_status,
            get_admin_stats,
            get_all_movies,
            get_all_categories,
            create_category,
            update_category,
            delete_category,
            add_movie,
            get_all_orders,
            get_order_details,
            update_order_status,
            get_store_settings,
            save_store_settings,
            get_available_drives,
            copy_order_to_device,
            get_income_analytics,
            scan_hard_drives_for_media,
            create_customer_notification,
            get_notifications,
            mark_notification_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
