use serde::{Deserialize, Serialize};

use crate::server::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckoutPayload {
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub items: Vec<CartItemPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CartItemPayload {
    pub video_id: String,
    pub delivery_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderCreatedNotification {
    pub order_id: String,
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub total_ks: i64,
    pub items_count: usize,
    pub created_at: String,
}

pub async fn process_order(
    checkout: CheckoutPayload,
    state: &AppState,
) -> Result<OrderCreatedNotification, String> {
    validate_checkout(&checkout)?;

    let order_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let mut tx = state.db.begin().await.map_err(|error| error.to_string())?;
    let mut selected_videos = Vec::with_capacity(checkout.items.len());
    let mut total_ks = 0_i64;
    let mut total_size = 0_i64;

    // Prices and files are always read from the catalog. A phone can choose an
    // item, but it must not be able to alter the price or create a fake item.
    for item in &checkout.items {
        let video = sqlx::query_as::<_, (String, String, i64, i64, String)>(
            "SELECT title, video_path, price_ks, file_size_bytes, content_type FROM videos WHERE id = ? AND is_available = 1",
        )
        .bind(&item.video_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "One or more selected titles are no longer available.".to_string())?;

        total_ks = total_ks
            .checked_add(video.2)
            .ok_or_else(|| "Order total is too large.".to_string())?;
        total_size = total_size
            .checked_add(video.3.max(0))
            .ok_or_else(|| "Order size is too large.".to_string())?;
        selected_videos.push((item, video));
    }

    sqlx::query(
        r#"INSERT INTO orders
           (id, customer_name, customer_phone, device_ip, total_ks, total_size_bytes, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"#,
    )
    .bind(&order_id)
    .bind(checkout.customer_name.trim())
    .bind(&checkout.customer_phone)
    .bind("LAN customer")
    .bind(total_ks)
    .bind(total_size)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?;

    for (item, (title, path, price, size, content_type)) in selected_videos {
        sqlx::query(
            r#"INSERT INTO order_items
               (id, order_id, video_id, video_title, video_path, price_ks, file_size_bytes, content_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&order_id)
        .bind(&item.video_id)
        .bind(title)
        .bind(path)
        .bind(price)
        .bind(size)
        .bind(content_type)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    }

    tx.commit().await.map_err(|error| error.to_string())?;

    Ok(OrderCreatedNotification {
        order_id,
        customer_name: checkout.customer_name,
        customer_phone: checkout.customer_phone,
        total_ks,
        items_count: checkout.items.len(),
        created_at: now,
    })
}

pub fn validate_checkout(checkout: &CheckoutPayload) -> Result<(), String> {
    let name = checkout.customer_name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Please provide a name or device identifier up to 100 characters.".to_string());
    }
    if checkout.items.is_empty() || checkout.items.len() > 50 {
        return Err("An order must contain between 1 and 50 titles.".to_string());
    }

    let mut ids = std::collections::HashSet::with_capacity(checkout.items.len());
    for item in &checkout.items {
        if item.video_id.is_empty()
            || !ids.insert(&item.video_id)
            || !matches!(
                item.delivery_type.as_str(),
                "local_download" | "usb_copy" | "stream_pass"
            )
        {
            return Err("The order contains invalid or duplicate titles.".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_checkout, CartItemPayload, CheckoutPayload};

    fn checkout(items: Vec<CartItemPayload>) -> CheckoutPayload {
        CheckoutPayload {
            customer_name: "Test device".to_string(),
            customer_phone: None,
            items,
        }
    }

    #[test]
    fn accepts_a_valid_checkout() {
        assert!(validate_checkout(&checkout(vec![CartItemPayload {
            video_id: "movie-1".to_string(),
            delivery_type: "usb_copy".to_string(),
        }]))
        .is_ok());
    }

    #[test]
    fn rejects_duplicate_or_invalid_items() {
        let duplicate = checkout(vec![
            CartItemPayload {
                video_id: "movie-1".to_string(),
                delivery_type: "usb_copy".to_string(),
            },
            CartItemPayload {
                video_id: "movie-1".to_string(),
                delivery_type: "usb_copy".to_string(),
            },
        ]);
        assert!(validate_checkout(&duplicate).is_err());

        let invalid_delivery = checkout(vec![CartItemPayload {
            video_id: "movie-2".to_string(),
            delivery_type: "courier".to_string(),
        }]);
        assert!(validate_checkout(&invalid_delivery).is_err());
    }
}
