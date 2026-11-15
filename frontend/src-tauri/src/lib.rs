mod cache;
mod maxfiy;
mod shell;
mod transport;
fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![
        transport::desktop_request,
        transport::desktop_logout,
        maxfiy::desktop_session_info,
        maxfiy::desktop_session_clear,
        cache::desktop_cache_read,
        cache::desktop_cache_write,
        cache::desktop_cache_delete,
        cache::desktop_cache_keys
    ])
}
// iOS Keychain items survive app deletion while the sandbox (and cache) does not. A missing install marker means a
// fresh install: erase any orphaned credential before the UI can use it.
#[cfg(all(target_os = "ios", not(test)))]
fn ios_fresh_install_wipe(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use maxfiy::Vault;
    use tauri::Manager;
    let dir = app.path().app_local_data_dir()?;
    let marker = dir.join("install-marker-v1");
    if !marker.exists() {
        maxfiy::OsVault.delete()?;
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&marker, b"1")?;
    }
    Ok(())
}
#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = builder().plugin(tauri_plugin_opener::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(smeta_keystore::init());
    builder
        .setup(|_app| {
            #[cfg(feature = "desktop-e2e")]
            {
                if _app.config().identifier != "uz.anncorp.smeta.e2e" {
                    return Err(
                        "desktop-e2e requires isolated uz.anncorp.smeta.e2e identifier".into(),
                    );
                }
            }
            #[cfg(target_os = "ios")]
            ios_fresh_install_wipe(_app)?;
            // Default "Onlayn qobiq": the config has `create: false`; the window is built here with the
            // navigation guard. The local-bff legacy mode keeps the config-created window.
            #[cfg(not(feature = "local-bff"))]
            shell::create_main_window(_app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Windows ilovasini ishga tushirib bo‘lmadi");
}
