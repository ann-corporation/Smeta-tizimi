fn main() {
    // Windows test executables that link the Tauri mock runtime need Common Controls v6 (otherwise the loader fails
    // with STATUS_ENTRYPOINT_NOT_FOUND). The shipped binary gets its manifest from tauri-build; this only affects tests.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let manifest = std::path::Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("test-comctl6.manifest");
        std::fs::write(
            &manifest,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency><dependentAssembly>
    <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
  </dependentAssembly></dependency>
</assembly>
"#,
        )
        .expect("write test manifest");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
    }
    println!("cargo:rerun-if-env-changed=SMETA_DESKTOP_BFF_ORIGIN");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_request",
            "desktop_logout",
            "desktop_session_info",
            "desktop_session_clear",
            "desktop_cache_read",
            "desktop_cache_write",
            "desktop_cache_delete",
            "desktop_cache_keys",
            "oflayn_holat",
            "oflayn_kesh_yoz",
            "oflayn_kesh_oqi",
            "oflayn_kesh_tozala",
            "oflayn_navbat_qosh",
            "oflayn_navbat_royxat",
            "oflayn_navbat_ochir",
            "oflayn_qobiq_tayyor",
            "oflayn_qobiq_bor",
        ]),
    ))
    .expect("Desktop command ACL generation failed")
}
