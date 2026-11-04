fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "sessiya_token_saqla",
            "sessiya_token_ol",
            "sessiya_token_ochir",
        ]),
    ))
    .expect("Desktop command ACL generation failed")
}
