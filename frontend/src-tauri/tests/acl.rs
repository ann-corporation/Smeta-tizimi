//! Real ACL check: the capabilities and permissions are compiled into the context by tauri-build and resolved by Tauri's
//! own authority. Handlers are stubs (the ACL decides by command name BEFORE any handler runs), so this tests exactly what
//! the remote origin may reach, independent of the implementation.
use tauri::{
    ipc::{CallbackFn, InvokeBody, InvokeResponseBody},
    test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY},
    webview::InvokeRequest,
    Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

macro_rules! stubs { ($($n:ident),*) => { $( #[tauri::command] fn $n() -> Result<(), String> { Ok(()) } )* }; }
stubs!(
    oflayn_holat, oflayn_kesh_yoz, oflayn_kesh_oqi, oflayn_kesh_tozala, oflayn_navbat_qosh, oflayn_navbat_royxat,
    oflayn_navbat_ochir, oflayn_qobiq_tayyor, oflayn_qobiq_bor, desktop_request, desktop_logout, desktop_session_info,
    desktop_session_clear, desktop_cache_read, desktop_cache_write, desktop_cache_delete, desktop_cache_keys
);

const REMOTE_OK: [&str; 8] = [
    "oflayn_holat", "oflayn_kesh_yoz", "oflayn_kesh_oqi", "oflayn_kesh_tozala", "oflayn_navbat_qosh",
    "oflayn_navbat_royxat", "oflayn_navbat_ochir", "oflayn_qobiq_tayyor",
];
const SITE: &str = "https://smeta-tizimi.pages.dev/obyekt/1";

fn window() -> (tauri::App<MockRuntime>, WebviewWindow<MockRuntime>) {
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![
            oflayn_holat, oflayn_kesh_yoz, oflayn_kesh_oqi, oflayn_kesh_tozala, oflayn_navbat_qosh, oflayn_navbat_royxat,
            oflayn_navbat_ochir, oflayn_qobiq_tayyor, oflayn_qobiq_bor, desktop_request, desktop_logout,
            desktop_session_info, desktop_session_clear, desktop_cache_read, desktop_cache_write, desktop_cache_delete,
            desktop_cache_keys
        ])
        .build(tauri::generate_context!())
        .unwrap();
    let w = WebviewWindowBuilder::new(&app, "main", WebviewUrl::External(Url::parse("https://smeta-tizimi.pages.dev/").unwrap()))
        .build()
        .unwrap();
    (app, w)
}
fn ipc(w: &WebviewWindow<MockRuntime>, cmd: &str, origin: &str) -> Result<InvokeResponseBody, serde_json::Value> {
    get_ipc_response(
        w,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: Url::parse(origin).unwrap(),
            body: InvokeBody::Json(serde_json::json!({})),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
}
fn denied(r: &Result<InvokeResponseBody, serde_json::Value>) -> bool {
    matches!(r, Err(e) if e.to_string().contains("not allowed"))
}

#[test]
fn remote_site_reaches_only_the_narrow_oflayn_commands() {
    let (_app, w) = window();
    for cmd in REMOTE_OK {
        let r = ipc(&w, cmd, SITE);
        assert!(!denied(&r), "{cmd} must pass the ACL for the site origin: {r:?}");
    }
    for cmd in [
        "desktop_request", "desktop_logout", "desktop_session_info", "desktop_session_clear", "desktop_cache_read",
        "desktop_cache_write", "desktop_cache_delete", "desktop_cache_keys", "oflayn_qobiq_bor",
        "plugin:opener|open_url", "plugin:fs|read_file", "plugin:shell|execute", "plugin:event|listen",
        "plugin:window|close", "plugin:webview|create_webview_window", "some_other_command",
    ] {
        let r = ipc(&w, cmd, SITE);
        assert!(denied(&r), "{cmd} must be ACL-denied for the remote origin: {r:?}");
    }
}

#[test]
fn look_alike_origins_get_nothing() {
    let (_app, w) = window();
    for origin in [
        "https://smeta-tizimi.pages.dev.evil.example/",
        "https://evil.smeta-tizimi.pages.dev/",
        "http://smeta-tizimi.pages.dev/",
        "https://example.com/",
        "https://accounts.google.com/",
    ] {
        for cmd in REMOTE_OK {
            let r = ipc(&w, cmd, origin);
            assert!(denied(&r), "{cmd} from {origin} must be denied: {r:?}");
        }
    }
}

#[test]
fn local_origin_keeps_loader_and_legacy_commands_but_not_the_remote_bridge() {
    let (_app, w) = window();
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "linux"))]
    let local = "tauri://localhost/index.html";
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "linux")))]
    let local = "http://tauri.localhost/index.html";
    for cmd in ["oflayn_qobiq_bor", "desktop_request", "desktop_session_info", "desktop_cache_read"] {
        let r = ipc(&w, cmd, local);
        assert!(!denied(&r), "{cmd} must stay allowed for the local origin: {r:?}");
    }
    for cmd in ["oflayn_holat", "oflayn_kesh_yoz", "oflayn_kesh_oqi", "oflayn_navbat_qosh"] {
        let r = ipc(&w, cmd, local);
        assert!(denied(&r), "{cmd} is remote-only: {r:?}");
    }
}