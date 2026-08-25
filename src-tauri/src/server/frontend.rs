use axum::{
    body::Body,
    http::{header, HeaderValue, Request},
    response::{IntoResponse, Response},
};
use mime_guess::mime;

// Frontend React build snapshot embedded at compile time by build.rs
// (which copies ../dist into OUT_DIR and generates frontend_files.rs).
include!(concat!(std::env!("OUT_DIR"), "/frontend_files.rs"));

fn find_file(rel_path: &str) -> Option<&'static [u8]> {
    FILES
        .iter()
        .find(|(name, _)| *name == rel_path)
        .map(|(_, bytes)| *bytes)
}

pub async fn frontend_index() -> impl IntoResponse {
    match find_file("index.html") {
        Some(bytes) => file_response("index.html", bytes),
        None => fallback_not_built(),
    }
}

pub async fn static_asset(req: Request<Body>) -> Response {
    let path = req.uri().path().trim_start_matches('/');
    match find_file(path) {
        Some(bytes) => file_response(path, bytes),
        None => frontend_index().await.into_response(),
    }
}

fn file_response(path: &str, bytes: &'static [u8]) -> Response {
    let mime_type = mime_guess::from_path(path).first_or_octet_stream();
    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime_type.as_ref())
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    // Hashed production assets (dist/assets/*) are immutable → cache aggressively.
    if path.starts_with("assets/") {
        resp.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    }
    resp
}

fn fallback_not_built() -> Response {
    let body = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Movie House Store</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b0b10; color: #e4e4e7; display: grid; place-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .card { padding: 2rem; border: 1px solid #27272a; border-radius: 1rem; background: #18181b; max-width: 420px; }
    h1 { color: #818cf8; font-size: 1.25rem; }
    code { background: #27272a; padding: .2rem .4rem; border-radius: .4rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>&#127916; Movie House Storefront</h1>
    <p>The React customer site has not been built yet.</p>
    <p>On the store PC, run <code>npm run build</code> and restart the app.</p>
  </div>
</body>
</html>"#;
    Response::builder()
        .status(axum::http::StatusCode::OK)
        .header(header::CONTENT_TYPE, mime::TEXT_HTML.as_ref())
        .body(Body::from(body))
        .unwrap()
}
