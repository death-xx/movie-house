fn main() {
    // Generate Tauri command and plugin permission manifests. Without this the
    // native dialog and event APIs are compiled but blocked at runtime.
    tauri_build::build();
    println!("cargo:rustc-check-cfg=cfg(mobile)");
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../dist/index.html");

    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist_dir = manifest_dir.join("../dist");
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let target = out_dir.join("frontend");

    let _ = std::fs::remove_dir_all(&target);
    let _ = std::fs::create_dir_all(&target);

    if !dist_dir.join("index.html").exists() {
        println!("cargo:warning=dist/ not built yet - run `npm run build` to serve the React customer site over WiFi");
        return;
    }

    let mut files = Vec::new();
    copy_dir(&dist_dir, &target, &target, &mut files);

    let mut code = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for (name, abs_path) in &files {
        code.push_str(&format!(
            "    (r\"{}\", include_bytes!(r\"{}\")),\n",
            name.replace("\\\\", "/"),
            abs_path
        ));
    }
    code.push_str("];\n");

    let _ = std::fs::write(out_dir.join("frontend_files.rs"), code);
}

fn copy_dir(
    src: &std::path::Path,
    dst: &std::path::Path,
    root: &std::path::Path,
    files: &mut Vec<(String, String)>,
) {
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let sub_dst = dst.join(entry.file_name());
                let _ = std::fs::create_dir_all(&sub_dst);
                copy_dir(&path, &sub_dst, root, files);
            } else {
                let target = dst.join(entry.file_name());
                let _ = std::fs::copy(&path, &target);
                let rel = target
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                files.push((rel, target.to_string_lossy().to_string()));
            }
        }
    }
}
