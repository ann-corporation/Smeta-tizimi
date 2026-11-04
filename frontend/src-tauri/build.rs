fn main() {
    println!("cargo:rerun-if-env-changed=SMETA_DESKTOP_BFF_ORIGIN");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_request",
            "desktop_session_info",
            "desktop_session_clear",
            "desktop_cache_read",
            "desktop_cache_write",
            "desktop_cache_delete",
            "desktop_cache_keys",
        ]),
    ))
    .expect("Desktop command ACL generation failed")
}
