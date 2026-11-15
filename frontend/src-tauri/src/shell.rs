//! "Onlayn qobiq" (default): the window loads the live website. The remote origin gets NO Tauri IPC
//! (capabilities are `local: true` only); this module only decides which navigations stay in the webview.
#![cfg_attr(feature = "local-bff", allow(dead_code))]
use tauri::Url;

/// The production site. Compile-time constant: IPC, config files and the environment cannot choose it.
pub const SITE_HOST: &str = "smeta-tizimi.pages.dev";
/// Google Identity Services sign-in popup/redirect (see src/kirish/GoogleKirish.tsx).
const AUTH_HOSTS: [&str; 1] = ["accounts.google.com"];

/// Site path that must open in the system browser (OAuth providers refuse embedded WebViews).
const BROWSER_LOGIN_PATH: &str = "/brauzer-kirish";

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Nav {
    /// Stays in the app webview.
    Stay,
    /// Opens in the system browser / mail / phone handler; the webview stays where it is.
    External,
}

fn is_local(url: &Url) -> bool {
    matches!(url.scheme(), "tauri" | "about" | "blob" | "data")
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
}

pub fn classify(url: &Url) -> Nav {
    if is_local(url) {
        return Nav::Stay;
    }
    let https = url.scheme() == "https" && url.username().is_empty() && url.password().is_none();
    // «Brauzer orqali kirish»: Google WebView'da bloklanadi (disallowed_useragent), shuning uchun bu sahifa tizim brauzerida
    // ochiladi va ilovaga qurai://kirish bilet bilan qaytadi (src/kirish/IlovaKirish.tsx). Yangi IPC kerak emas.
    if https && url.host_str() == Some(SITE_HOST) && url.path() == BROWSER_LOGIN_PATH {
        return Nav::External;
    }
    match url.host_str() {
        Some(host) if https && (host == SITE_HOST || AUTH_HOSTS.contains(&host)) => Nav::Stay,
        _ => Nav::External,
    }
}

#[cfg(not(test))]
pub fn open_external(url: &Url) {
    // Only web and contact schemes ever reach the OS handler.
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
    }
}

/// Creates the main window (config has `create: false`) with the navigation guard.
#[cfg(not(test))]
pub fn create_main_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::WebviewWindowBuilder;
    let cfg = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .ok_or("MAIN_WINDOW_CONFIG_MISSING")?
        .clone();
    let builder = WebviewWindowBuilder::from_config(app.handle(), &cfg)?.on_navigation(|url| {
        match classify(url) {
            Nav::Stay => true,
            Nav::External => {
                open_external(url);
                false
            }
        }
    });
    // window.open / target=_blank (desktop only; mobile WebViews do not support it): the Google sign-in
    // popup is allowed with the default implementation, everything else goes to the system browser.
    #[cfg(desktop)]
    let builder = builder.on_new_window(|url, _features| match classify(&url) {
        Nav::Stay => tauri::webview::NewWindowResponse::Allow,
        Nav::External => {
            open_external(&url);
            tauri::webview::NewWindowResponse::Deny
        }
    });
    builder.build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn nav(s: &str) -> Nav {
        classify(&Url::parse(s).unwrap())
    }
    #[test]
    fn site_auth_and_local_stay() {
        assert_eq!(nav("https://smeta-tizimi.pages.dev/obyekt/1?x=2"), Nav::Stay);
        assert_eq!(nav("https://accounts.google.com/gsi/select"), Nav::Stay);
        assert_eq!(nav("tauri://localhost/index.html"), Nav::Stay);
        assert_eq!(nav("http://tauri.localhost/index.html"), Nav::Stay);
        assert_eq!(nav("about:blank"), Nav::Stay);
    }
    #[test]
    fn browser_login_goes_to_system_browser_but_return_page_stays() {
        assert_eq!(nav("https://smeta-tizimi.pages.dev/brauzer-kirish?h=abc"), Nav::External);
        assert_eq!(nav("https://smeta-tizimi.pages.dev/ilova-qaytdi?t=abc"), Nav::Stay);
        assert_eq!(nav("https://smeta-tizimi.pages.dev/brauzer-kirish-x"), Nav::Stay);
    }
    #[test]
    fn everything_else_goes_external() {
        for u in [
            "http://smeta-tizimi.pages.dev/",
            "https://smeta-tizimi.pages.dev.evil.example/",
            "https://evil.smeta-tizimi.pages.dev/",
            "https://user@smeta-tizimi.pages.dev/",
            "https://accounts.google.com.evil.example/",
            "https://example.com/",
            "mailto:a@b.uz",
            "tel:+998901234567",
            "file:///C:/x",
        ] {
            assert_eq!(nav(u), Nav::External, "{u}");
        }
    }
}
