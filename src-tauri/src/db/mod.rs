pub mod models;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::time::Duration;

pub async fn init_db_pool(db_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let connection_options = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        // SQLite serializes writes; a small pool avoids contention while keeping
        // catalog reads responsive during order and copy operations.
        .max_connections(8)
        .connect_with(connection_options)
        .await?;

    run_embedded_migrations(&pool).await?;
    seed_default_data(&pool).await?;

    Ok(pool)
}

async fn run_embedded_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY NOT NULL,
            category_id TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'movie', -- 'movie' or 'series'
            title TEXT NOT NULL,
            description TEXT,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            release_year INTEGER,
            price_ks INTEGER NOT NULL DEFAULT 200, -- 200 Ks default for movie, 150 Ks for series ep
            episode_number INTEGER,
            episode_count INTEGER,
            season_number INTEGER,
            series_title TEXT,
            video_path TEXT NOT NULL, -- Physical file path on a configured storage drive
            hard_disk_label TEXT,     -- e.g. "Disk 1 (D:)", "Disk 2 (E:)"
            trailer_path TEXT,
            thumbnail_path TEXT,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            mime_type TEXT NOT NULL DEFAULT 'video/mp4',
            is_available BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT,
            device_ip TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'copying', 'completed', 'cancelled')) DEFAULT 'pending',
            total_ks INTEGER NOT NULL DEFAULT 0,
            total_size_bytes INTEGER NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL DEFAULT 'cash_counter',
            notes TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY NOT NULL,
            order_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            video_title TEXT NOT NULL,
            video_path TEXT NOT NULL,
            price_ks INTEGER NOT NULL DEFAULT 0,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            content_type TEXT NOT NULL DEFAULT 'movie',
            episode_info TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            customer_info TEXT NOT NULL,
            task_type TEXT NOT NULL DEFAULT 'coming_soon_request',
            is_read BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        "#,
    )
    .execute(pool)
    .await?;

    // 1) Add new columns to existing tables BEFORE any index is created on them.
    //    Otherwise CREATE TABLE IF NOT EXISTS is a no-op on old databases and the
    //    column/index creation fails with "no such column".
    ensure_columns(
        pool,
        "videos",
        &[
            ("content_type", "TEXT NOT NULL DEFAULT 'movie'"),
            ("episode_number", "INTEGER"),
            ("episode_count", "INTEGER"),
            ("season_number", "INTEGER"),
            ("series_title", "TEXT"),
            ("hard_disk_label", "TEXT"),
            ("trailer_path", "TEXT"),
            ("thumbnail_path", "TEXT"),
            ("file_size_bytes", "INTEGER NOT NULL DEFAULT 0"),
            ("mime_type", "TEXT NOT NULL DEFAULT 'video/mp4'"),
            ("is_available", "BOOLEAN NOT NULL DEFAULT 1"),
        ],
    )
    .await?;

    ensure_columns(
        pool,
        "order_items",
        &[
            ("content_type", "TEXT NOT NULL DEFAULT 'movie'"),
            ("episode_info", "TEXT"),
        ],
    )
    .await?;

    // 2) Create indexes now that all columns are guaranteed to exist.
    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);
        CREATE INDEX IF NOT EXISTS idx_videos_category_created ON videos(category_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_videos_available_created ON videos(is_available, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(content_type);
        CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
        "#,
    )
    .execute(pool)
    .await?;

    // 3) Tune SQLite for read-heavy local catalog serving.
    for pragma in ["PRAGMA cache_size = -20000", "PRAGMA mmap_size = 268435456"] {
        let _ = sqlx::query(pragma).execute(pool).await;
    }

    Ok(())
}

async fn ensure_columns(
    pool: &SqlitePool,
    table: &str,
    columns: &[(&str, &str)],
) -> Result<(), sqlx::Error> {
    let rows: Vec<(String,)> =
        sqlx::query_as(&format!("SELECT name FROM pragma_table_info('{}')", table))
            .fetch_all(pool)
            .await?;
    let existing: std::collections::HashSet<String> =
        rows.into_iter().map(|(name,)| name).collect();

    for (name, type_def) in columns {
        if !existing.contains(*name) {
            sqlx::query(&format!(
                "ALTER TABLE {} ADD COLUMN {} {}",
                table, name, type_def
            ))
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

async fn seed_default_data(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // 1. Seed Settings (Pricing & Hard Disk Paths)
    let settings = [
        ("movie_price_ks", "200"),
        ("series_episode_price_ks", "150"),
        ("currency_symbol", "Ks"),
        ("default_phone_copy_path", ""),
        ("hard_disk_paths", "[]"),
    ];

    for (k, v) in settings {
        sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
            .bind(k)
            .bind(v)
            .execute(pool)
            .await?;
    }

    // 2. Seed useful storefront categories. INSERT OR IGNORE preserves both
    // existing stores and any categories an owner has already added.
    let categories = [
        ("cat-latest-2026", "Latest 2026", "latest-2026"),
        ("cat-myanmar", "Myanmar Movies", "myanmar-movies"),
        ("cat-thai-series", "Thai Series", "thai-series"),
        ("cat-kdrama", "K-Drama", "k-drama"),
        ("cat-anime", "Anime & Cartoon", "anime-cartoon"),
        ("cat-action", "Action Movies", "action-movies"),
        ("cat-comedy", "Comedy", "comedy"),
        ("cat-horror", "Horror & Thriller", "horror-thriller"),
    ];

    for (id, name, slug) in categories {
        sqlx::query("INSERT OR IGNORE INTO categories (id, name, slug) VALUES (?, ?, ?)")
            .bind(id)
            .bind(name)
            .bind(slug)
            .execute(pool)
            .await?;
    }

    Ok(())
}
