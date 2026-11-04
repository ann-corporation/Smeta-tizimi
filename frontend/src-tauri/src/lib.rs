mod cache;
mod maxfiy;
mod transport;
fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![
        transport::desktop_request,
        maxfiy::desktop_session_info,
        maxfiy::desktop_session_clear,
        cache::desktop_cache_read,
        cache::desktop_cache_write,
        cache::desktop_cache_delete,
        cache::desktop_cache_keys
    ])
}
#[cfg(not(test))]
pub fn run() {
    builder()
        .setup(|_app| {
            #[cfg(feature = "desktop-e2e")]
            {
                if _app.config().identifier != "uz.anncorp.smeta.e2e" {
                    return Err(
                        "desktop-e2e requires isolated uz.anncorp.smeta.e2e identifier".into(),
                    );
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Windows ilovasini ishga tushirib bo‘lmadi");
}
