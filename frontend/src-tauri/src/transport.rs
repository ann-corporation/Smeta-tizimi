//! Fixed BFF transport. Redirects, caller headers and caller authority are absent by construction.
use crate::maxfiy::{self, Credential, NativeResult, OsVault};
use reqwest::{header, Client, Method};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;
// Compile-time only: IPC, config files and runtime environment cannot choose a server.
const BFF: &str = match option_env!("SMETA_DESKTOP_BFF_ORIGIN") {
    Some(origin) => origin,
    None => "https://smeta-tizimi.pages.dev",
};
fn validated_origin(origin: &str, allow_loopback: bool) -> NativeResult<bool> {
    let url = tauri::Url::parse(origin).map_err(|_| "DESKTOP_BFF_ORIGIN_INVALID")?;
    let loopback = allow_loopback
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !loopback)
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || url.origin().ascii_serialization() != origin
    {
        return Err("DESKTOP_BFF_ORIGIN_INVALID");
    }
    Ok(!loopback)
}
const LOCAL: &str = "http://tauri.localhost";
// Reported app version: server policy (Tizim nazorati → Desktop, min version) decides; never an authority.
const VERSION_HEADER: &str = "X-Smeta-Desktop-Version";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const RESPONSE_LIMIT: usize = 32 * 1024 * 1024;
const AUTH_LIMIT: usize = 32 * 1024;
const BODY_LIMIT: usize = 8 * 1024 * 1024;
fn operation_id() -> NativeResult<String> {
    use aes_gcm::aead::{rand_core::RngCore, OsRng};
    let mut bytes = [0u8; 16];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| "DESKTOP_RANDOM_FAILED")?;
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    ))
}
#[derive(Serialize)]
pub struct DesktopResponse {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
}
fn transport_builder() -> reqwest::ClientBuilder {
    Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .referer(false)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
}
fn client() -> NativeResult<Client> {
    let https_only = validated_origin(BFF, cfg!(feature = "desktop-e2e"))?;
    transport_builder()
        .https_only(https_only)
        .build()
        .map_err(|_| "DESKTOP_HTTP_UNAVAILABLE")
}
fn authenticated_request(
    client: &Client,
    path: &str,
    method: &str,
    body: Option<String>,
    etag: Option<String>,
    credential: &Credential,
) -> NativeResult<reqwest::Request> {
    request_path(path, method, body.as_deref(), etag.as_deref())?;
    if path != "/api/desktop/lease" {
        return gateway_request(client, path, method, body, etag, &credential.token);
    }
    let mut req = client
        .request(Method::POST, format!("{BFF}/api/desktop/lease"))
        .header(header::ORIGIN, LOCAL)
        .header(VERSION_HEADER, APP_VERSION)
        .bearer_auth(&credential.token);
    if let Some(body) = body {
        req = req
            .header(header::CONTENT_TYPE, "application/json")
            .body(body);
    }
    req.build().map_err(|_| "DESKTOP_REQUEST_INVALID")
}
fn gateway_request(
    client: &Client,
    path: &str,
    method: &str,
    body: Option<String>,
    etag: Option<String>,
    token: &str,
) -> NativeResult<reqwest::Request> {
    request_path(path, method, body.as_deref(), etag.as_deref())?;
    if !matches!(
        path.split('?').next(),
        Some(
            "/api/sessiya"
                | "/api/company"
                | "/api/sb"
                | "/api/sb-yoz"
                | "/api/gas"
                | "/api/obyekt-paket"
        )
    ) {
        return Err("DESKTOP_PATH_DENIED");
    }
    // The BFF returns the handler's real HTTP status, body and ETag. No JSON
    // response envelope is unwrapped, and no web-session cookie crosses IPC.
    client
        .post(format!("{BFF}/api/desktop/bff"))
        .header(header::ORIGIN, LOCAL)
        .header(VERSION_HEADER, APP_VERSION)
        .header(header::CONTENT_TYPE, "application/json")
        .bearer_auth(token)
        .body(serde_json::json!({"path":path,"method":method,"body":body,"etag":etag}).to_string())
        .build()
        .map_err(|_| "DESKTOP_REQUEST_INVALID")
}
fn request_path(
    path: &str,
    method: &str,
    body: Option<&str>,
    etag: Option<&str>,
) -> NativeResult<()> {
    if !matches!(method, "GET" | "POST")
        || path.len() > 4096
        || body.is_some_and(|v| v.len() > BODY_LIMIT)
        || (method == "GET" && body.is_some())
        || etag.is_some_and(|v| v.len() > 512 || v.bytes().any(|b| b.is_ascii_control()))
    {
        return Err("DESKTOP_REQUEST_INVALID");
    }
    if path
        .bytes()
        .any(|b| b.is_ascii_control() || b == b'\\' || b == b'#' || b == b' ')
        || !path.starts_with("/api/")
    {
        return Err("DESKTOP_PATH_DENIED");
    }
    let route = path.split('?').next().ok_or("DESKTOP_PATH_DENIED")?;
    // Deny encoded separators/dot-segments and all credential-issuing routes.
    if !matches!(
        route,
        "/api/kirish"
            | "/api/sessiya"
            | "/api/company"
            | "/api/sb"
            | "/api/sb-yoz"
            | "/api/gas"
            | "/api/obyekt-paket"
            | "/api/desktop/lease"
    ) {
        return Err("DESKTOP_PATH_DENIED");
    }
    if route == "/api/kirish" && (path != route || method != "POST" || etag.is_some()) {
        return Err("DESKTOP_PATH_DENIED");
    }
    if route == "/api/desktop/lease" && (path != route || method != "POST" || etag.is_some()) {
        return Err("DESKTOP_PATH_DENIED");
    }
    Ok(())
}
async fn bounded(
    mut response: reqwest::Response,
    limit: usize,
) -> NativeResult<(u16, String, Option<String>)> {
    let status = response.status().as_u16();
    if (300..400).contains(&status) && status != 304 {
        return Err("DESKTOP_REDIRECT_DENIED");
    }
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err("DESKTOP_RESPONSE_TOO_LARGE");
    }
    let etag = response
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() <= 512)
        .map(str::to_owned);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "DESKTOP_HTTP_FAILED")? {
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err("DESKTOP_RESPONSE_TOO_LARGE");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((
        status,
        String::from_utf8(bytes).map_err(|_| "DESKTOP_RESPONSE_INVALID")?,
        etag,
    ))
}
fn authority(body: &str, issued: &Value, now: u64) -> NativeResult<Credential> {
    let data: Value = serde_json::from_str(body).map_err(|_| "DESKTOP_AUTH_INVALID")?;
    let actor = data["foydalanuvchi_id"]
        .as_u64()
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
        .ok_or("DESKTOP_AUTH_INVALID")?;
    let token = issued["token"].as_str().ok_or("DESKTOP_AUTH_INVALID")?;
    let device = issued["device_id"]
        .as_str()
        .filter(|d| maxfiy::device_valid(d))
        .ok_or("DESKTOP_AUTH_INVALID")?;
    if issued["ok"] != true
        || (issued.get("foydalanuvchi_id").is_some()
            && issued["foydalanuvchi_id"].as_u64() != Some(actor))
    {
        return Err("DESKTOP_AUTH_INVALID");
    }
    // Existing /api/sessiya uses Unix milliseconds, not seconds.
    let expires = data["tugaydi"]
        .as_u64()
        .filter(|e| *e > now && *e - now <= maxfiy::MAX_TTL)
        .ok_or("DESKTOP_AUTH_INVALID")?;
    let issued_expiry = issued["tugaydi"]
        .as_u64()
        .filter(|e| *e > now && *e - now <= maxfiy::MAX_TTL)
        .ok_or("DESKTOP_AUTH_INVALID")?;
    if data["ok"] != true {
        return Err("DESKTOP_AUTH_INVALID");
    }
    maxfiy::token_tekshir(token)?;
    let (key, cache_id) = maxfiy::fresh_key()?;
    Ok(Credential {
        version: 3,
        token: token.into(),
        actor,
        device: device.into(),
        expires: expires.min(issued_expiry),
        key,
        cache_id,
    })
}
fn session_cookie(headers: &header::HeaderMap) -> NativeResult<Zeroizing<String>> {
    let mut cookie = None;
    for value in headers.get_all(header::SET_COOKIE) {
        let value = value.to_str().map_err(|_| "DESKTOP_LOGIN_INVALID")?;
        if let Some(token) = value
            .split(';')
            .next()
            .and_then(|v| v.strip_prefix("sess="))
        {
            // Existing web cookie uses standard base64 (may contain + and /).
            if token.is_empty()
                || token.len() > 16000
                || !token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"+/-_.=".contains(&b))
            {
                return Err("DESKTOP_LOGIN_INVALID");
            }
            if cookie.is_some() {
                return Err("DESKTOP_LOGIN_INVALID");
            }
            cookie = Some(Zeroizing::new(format!("sess={token}")));
        }
    }
    cookie.ok_or("DESKTOP_LOGIN_INVALID")
}
async fn login(
    client: &Client,
    body: &str,
    generation: u64,
    webview: &tauri::Webview,
) -> NativeResult<DesktopResponse> {
    // Only the existing password login shape is accepted; no role/device/expiry/header parameters.
    let input: Value = serde_json::from_str(body).map_err(|_| "DESKTOP_LOGIN_INVALID")?;
    let fields = input.as_object().ok_or("DESKTOP_LOGIN_INVALID")?;
    if fields.len() != 2
        || !fields.contains_key("login")
        || !fields.contains_key("parol")
        || !input["login"]
            .as_str()
            .is_some_and(|v| !v.is_empty() && v.len() <= 320)
        || !input["parol"]
            .as_str()
            .is_some_and(|v| !v.is_empty() && v.len() <= 4096)
    {
        return Err("DESKTOP_LOGIN_INVALID");
    }
    let response = client
        .post(format!("{BFF}/api/kirish"))
        .header(header::ORIGIN, BFF)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.to_owned())
        .send()
        .await
        .map_err(|_| "DESKTOP_HTTP_FAILED")?;
    if !response.status().is_success() {
        let _ = bounded(response, AUTH_LIMIT).await?;
        return Err("DESKTOP_LOGIN_REJECTED");
    }
    let cookie = session_cookie(response.headers())?;
    let _ = bounded(response, AUTH_LIMIT).await?;
    let response = client
        .post(format!("{BFF}/api/desktop/qurilma"))
        .header(header::ORIGIN, BFF)
        .header(header::COOKIE, cookie.as_str())
        .header(header::CONTENT_TYPE, "application/json")
        .body(
            serde_json::json!({
                "operation_id": operation_id()?,
                "os": std::env::consts::OS,
                "ilova_versiya": APP_VERSION,
            })
            .to_string(),
        )
        .send()
        .await
        .map_err(|_| "DESKTOP_HTTP_FAILED")?;
    let (status, issued, _) = bounded(response, AUTH_LIMIT).await?;
    let issued = Zeroizing::new(issued);
    if status != 200 {
        return Err(enroll_refusal(&issued));
    }
    let issued: Value = serde_json::from_str(&issued).map_err(|_| "DESKTOP_AUTH_INVALID")?;
    let token = Zeroizing::new(
        issued["token"]
            .as_str()
            .ok_or("DESKTOP_AUTH_INVALID")?
            .to_owned(),
    );
    maxfiy::token_tekshir(&token)?;
    let validation = gateway_request(client, "/api/sessiya", "GET", None, None, token.as_str())?;
    let response = client
        .execute(validation)
        .await
        .map_err(|_| "DESKTOP_HTTP_FAILED")?;
    let (status, body, _) = bounded(response, AUTH_LIMIT).await?;
    if status != 200 {
        return Err("DESKTOP_DEVICE_VALIDATION_REJECTED");
    }
    let credential = authority(&body, &issued, maxfiy::now()?)?;
    maxfiy::runtime_tekshir(webview)?;
    let mut guard = maxfiy::state()?;
    guard.persist(&OsVault, &credential, generation, maxfiy::now()?)?;
    // Explicit safe projection; never relay login/exchange bodies or Set-Cookie.
    Ok(DesktopResponse { status:200, body:serde_json::json!({"ok":true,"device_id":credential.device,"foydalanuvchi_id":credential.actor,"tugaydi":credential.expires}).to_string(),etag:None })
}
/// Server policy refusals (Tizim nazorati) surface as fixed codes; anything else stays generic.
fn enroll_refusal(body: &str) -> &'static str {
    match serde_json::from_str::<Value>(body)
        .ok()
        .as_ref()
        .and_then(|v| v["code"].as_str())
    {
        Some("DESKTOP_DISABLED") => "DESKTOP_DISABLED",
        Some("DESKTOP_UPDATE_REQUIRED") => "DESKTOP_UPDATE_REQUIRED",
        Some("DEVICE_LIMIT") => "DEVICE_LIMIT",
        _ => "DESKTOP_DEVICE_EXCHANGE_REJECTED",
    }
}
fn response_current(
    guard: &mut maxfiy::SessiyaBusena,
    vault: &impl maxfiy::Vault,
    generation: u64,
    status: u16,
    now: u64,
    mono: Instant,
) -> NativeResult<()> {
    guard.ticket(generation)?; // A stale 401 must never revoke a newer login.
    if status == 401 {
        guard.revoke(vault)?;
        return Ok(());
    }
    if guard.load(vault, now, mono)?.is_none() {
        return Err("DESKTOP_SESSION_REQUIRED");
    }
    Ok(())
}
fn revoke_request(client: &Client, c: &Credential) -> NativeResult<reqwest::Request> {
    client
        .delete(format!("{BFF}/api/desktop/qurilma"))
        .header(header::ORIGIN, LOCAL)
        .header(header::CONTENT_TYPE, "application/json")
        .bearer_auth(&c.token)
        .timeout(Duration::from_secs(10))
        .body(serde_json::json!({"device_id":c.device,"operation_id":operation_id()?}).to_string())
        .build()
        .map_err(|_| "DESKTOP_REQUEST_INVALID")
}
async fn revoke_remote(client: &Client, c: &Credential) -> NativeResult<()> {
    let response = client
        .execute(revoke_request(client, c)?)
        .await
        .map_err(|_| "DESKTOP_REVOKE_UNCONFIRMED")?;
    if response.status().as_u16() == 401 {
        return Ok(());
    }
    let (status, body, _) = bounded(response, AUTH_LIMIT).await?;
    let result: Value = serde_json::from_str(&body).map_err(|_| "DESKTOP_REVOKE_UNCONFIRMED")?;
    if status != 200 || result["ok"] != true || result["device_id"] != c.device {
        return Err("DESKTOP_REVOKE_UNCONFIRMED");
    }
    Ok(())
}
#[tauri::command]
pub async fn desktop_logout(webview: tauri::Webview, app: tauri::AppHandle) -> NativeResult<()> {
    maxfiy::runtime_tekshir(&webview)?;
    let (record, generation) = {
        let mut g = maxfiy::state()?;
        (
            g.load(&OsVault, maxfiy::now()?, Instant::now())?,
            g.generation,
        )
    };
    let result = match &record {
        Some(c) => match client() {
            Ok(http) => revoke_remote(&http, c).await,
            Err(e) => Err(e),
        },
        None => Ok(()),
    };
    let mut guard = maxfiy::state()?;
    guard.ticket(generation)?; // Never clear a newer concurrent login.
    guard.revoke(&OsVault)?; // Always crypto-erase locally, including a network failure.
    let cleanup = match record {
        Some(c) => crate::cache::cleanup_retired_cache_for_app(&app, &c.cache_id),
        None => Ok(()),
    };
    cleanup?; // Report failure; key erasure has already happened and is never rolled back.
    result
}
#[tauri::command]
pub async fn desktop_request(
    webview: tauri::Webview,
    path: String,
    method: String,
    body: Option<String>,
    etag: Option<String>,
) -> NativeResult<DesktopResponse> {
    maxfiy::runtime_tekshir(&webview)?;
    request_path(&path, &method, body.as_deref(), etag.as_deref())?;
    let client = client()?;
    if path == "/api/kirish" {
        let (previous, ticket) = {
            let mut g = maxfiy::state()?;
            (
                g.load(&OsVault, maxfiy::now()?, Instant::now())?,
                g.generation,
            )
        };
        if let Some(c) = previous {
            revoke_remote(&client, &c).await?;
        } // Do not enroll a replacement while old revocation is unconfirmed.
        let generation = {
            let mut guard = maxfiy::state()?;
            guard.ticket(ticket)?;
            guard.revoke(&OsVault)?;
            guard.generation
        };
        let result = login(
            &client,
            body.as_deref().ok_or("DESKTOP_LOGIN_INVALID")?,
            generation,
            &webview,
        )
        .await?;
        maxfiy::runtime_tekshir(&webview)?;
        return Ok(result);
    }
    let (credential, generation) = {
        let mut guard = maxfiy::state()?;
        let credential = guard
            .load(&OsVault, maxfiy::now()?, Instant::now())?
            .ok_or("DESKTOP_SESSION_REQUIRED")?;
        (credential, guard.generation)
    };
    let req = authenticated_request(&client, &path, &method, body, etag, &credential)?;
    let response = client
        .execute(req)
        .await
        .map_err(|_| "DESKTOP_HTTP_FAILED")?;
    let status = response.status().as_u16();
    // Revoke as soon as headers say 401, even when the body is malformed/oversized.
    if status == 401 {
        let mut guard = maxfiy::state()?;
        response_current(
            &mut guard,
            &OsVault,
            generation,
            status,
            maxfiy::now()?,
            Instant::now(),
        )?;
        return Ok(DesktopResponse {
            status: 401,
            body: "{\"ok\":false}".into(),
            etag: None,
        });
    }
    let (status, body, etag) = bounded(response, RESPONSE_LIMIT).await?;
    maxfiy::runtime_tekshir(&webview)?;
    response_current(
        &mut *maxfiy::state()?,
        &OsVault,
        generation,
        status,
        maxfiy::now()?,
        Instant::now(),
    )?;
    if body.contains(&credential.token)
        || etag.as_ref().is_some_and(|v| v.contains(&credential.token))
    {
        return Err("DESKTOP_RESPONSE_SECRET_DENIED");
    }
    Ok(DesktopResponse { status, body, etag })
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::maxfiy::{
        tests::{credential, MemoryVault},
        SessiyaBusena,
    };
    #[test]
    fn build_pinned_origin_is_canonical_https_or_explicit_e2e_loopback() {
        assert!(validated_origin("https://smeta-tizimi.pages.dev", false).unwrap());
        assert!(validated_origin("https://synthetic-preview.pages.dev", false).unwrap());
        for origin in [
            "https://user:secret@evil.invalid",
            "https://preview.invalid/path",
            "https://preview.invalid/?x=1",
            "https://preview.invalid#frag",
            "https://preview.invalid/",
            "http://127.0.0.1:4321",
            "http://remote.invalid",
            "file:///tmp",
        ] {
            assert!(validated_origin(origin, false).is_err(), "{origin}");
        }
        assert!(!validated_origin("http://127.0.0.1:4321", true).unwrap());
        assert!(validated_origin("http://remote.invalid:4321", true).is_err());
        assert!(validated_origin("http://localhost:4321", true).is_err());
    }
    #[test]
    fn fixed_api_paths_and_header_free_contract() {
        for p in [
            "https://evil/api/sb",
            "//evil/api/sb",
            "/api/../kirish",
            "/api/%73b",
            "/api/sb#x",
            "/api/sb\\x",
            "/api/desktop/qurilma",
            "/api/kirish-google",
            "/api/sessiya/../../kirish",
        ] {
            assert!(request_path(p, "GET", None, None).is_err(), "{p}");
        }
        assert!(request_path("/api/obyekt-paket?obyekt_id=1", "GET", None, Some("\"v1\"")).is_ok());
        assert!(request_path("/api/sb", "DELETE", None, None).is_err());
        assert!(request_path("/api/sb", "GET", None, Some("x\r\ncookie:x")).is_err());
    }
    #[test]
    fn request_headers_are_native_only_and_url_cannot_change_authority() {
        tauri::async_runtime::block_on(async {
            let client = client().unwrap();
            let c = credential(100);
            let req = authenticated_request(
                &client,
                "/api/sb?x=https://evil.invalid",
                "POST",
                Some("{}".into()),
                Some("\"v1\"".into()),
                &c,
            )
            .unwrap();
            assert_eq!(req.url().origin().ascii_serialization(), BFF);
            assert_eq!(req.headers()[header::ORIGIN], LOCAL);
            assert_eq!(req.headers()[VERSION_HEADER], APP_VERSION);
            assert_eq!(
                req.headers()[header::AUTHORIZATION],
                format!("Bearer {}", c.token)
            );
            assert!(!req.headers().contains_key(header::COOKIE));
            assert_eq!(req.url().path(), "/api/desktop/bff");
            assert_eq!(req.method(), Method::POST);
            assert!(!req.headers().contains_key(header::IF_NONE_MATCH));
            let payload: Value =
                serde_json::from_slice(req.body().unwrap().as_bytes().unwrap()).unwrap();
            assert_eq!(
                payload,
                serde_json::json!({"path":"/api/sb?x=https://evil.invalid","method":"POST","body":"{}","etag":"\"v1\""})
            );
            assert!(client.get("http://127.0.0.1:1").send().await.is_err());
            assert!(maxfiy::device_valid(&operation_id().unwrap()));
        });
    }
    #[test]
    fn all_existing_endpoints_and_login_validation_use_gateway_but_lease_is_direct() {
        tauri::async_runtime::block_on(async {
            let client = client().unwrap();
            let c = credential(100);
            for path in [
                "/api/sessiya",
                "/api/company",
                "/api/sb",
                "/api/sb-yoz",
                "/api/gas",
                "/api/obyekt-paket",
            ] {
                let req = authenticated_request(&client, path, "GET", None, None, &c).unwrap();
                assert_eq!(req.url().as_str(), format!("{BFF}/api/desktop/bff"));
                assert_eq!(req.method(), Method::POST);
                assert_eq!(
                    serde_json::from_slice::<Value>(req.body().unwrap().as_bytes().unwrap())
                        .unwrap(),
                    serde_json::json!({"path":path,"method":"GET","body":null,"etag":null})
                );
                assert!(!req.headers().contains_key(header::COOKIE));
            }
            // The very same helper is used before the newly issued token is persisted.
            let validation = gateway_request(
                &client,
                "/api/sessiya",
                "GET",
                None,
                None,
                "SYNTHETIC-ISSUED",
            )
            .unwrap();
            assert_eq!(
                validation.headers()[header::AUTHORIZATION],
                "Bearer SYNTHETIC-ISSUED"
            );
            let lease = authenticated_request(
                &client,
                "/api/desktop/lease",
                "POST",
                Some("{}".into()),
                None,
                &c,
            )
            .unwrap();
            assert_eq!(lease.url().as_str(), format!("{BFF}/api/desktop/lease"));
            assert_eq!(lease.body().unwrap().as_bytes().unwrap(), b"{}");
            assert!(
                authenticated_request(&client, "/api/desktop/lease", "GET", None, None, &c)
                    .is_err()
            );
            assert!(gateway_request(
                &client,
                "/api/kirish",
                "POST",
                Some("{}".into()),
                None,
                "SYNTHETIC"
            )
            .is_err());
            assert!(gateway_request(
                &client,
                "/api/desktop/bff",
                "POST",
                Some("{}".into()),
                None,
                "SYNTHETIC"
            )
            .is_err());
            assert!(gateway_request(
                &client,
                "/api/desktop/qurilma",
                "POST",
                Some("{}".into()),
                None,
                "SYNTHETIC"
            )
            .is_err());
        });
    }
    #[test]
    fn enroll_refusal_maps_only_known_policy_codes() {
        assert_eq!(
            enroll_refusal(r#"{"ok":false,"code":"DESKTOP_DISABLED"}"#),
            "DESKTOP_DISABLED"
        );
        assert_eq!(
            enroll_refusal(
                r#"{"ok":false,"code":"DESKTOP_UPDATE_REQUIRED","min_versiya":"1.2.0"}"#
            ),
            "DESKTOP_UPDATE_REQUIRED"
        );
        assert_eq!(
            enroll_refusal(r#"{"ok":false,"code":"anything"}"#),
            "DESKTOP_DEVICE_EXCHANGE_REJECTED"
        );
        assert_eq!(
            enroll_refusal("not json"),
            "DESKTOP_DEVICE_EXCHANGE_REJECTED"
        );
    }
    #[test]
    fn revoke_is_fixed_own_device_bearer_delete() {
        tauri::async_runtime::block_on(async {
            let c = credential(100);
            let req = revoke_request(&client().unwrap(), &c).unwrap();
            assert_eq!(req.method(), reqwest::Method::DELETE);
            assert_eq!(req.url().as_str(), format!("{BFF}/api/desktop/qurilma"));
            assert_eq!(req.headers()[header::ORIGIN], LOCAL);
            assert_eq!(
                req.headers()[header::AUTHORIZATION],
                format!("Bearer {}", c.token)
            );
            let body: Value =
                serde_json::from_slice(req.body().unwrap().as_bytes().unwrap()).unwrap();
            assert_eq!(body["device_id"], c.device);
            assert_eq!(body.as_object().unwrap().len(), 2);
            assert_eq!(body["operation_id"].as_str().unwrap().len(), 36);
        });
    }
    // Loopback HTTP exists only in this test helper. Production client remains HTTPS-only.
    fn loopback_response(wire: &'static [u8]) -> reqwest::Response {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let thread = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = [0u8; 8192];
            let _ = socket.read(&mut request).unwrap();
            socket.write_all(wire).unwrap();
        });
        let response = tauri::async_runtime::block_on(async {
            transport_builder()
                .https_only(false)
                .build()
                .unwrap()
                .get(format!("http://{address}/synthetic"))
                .send()
                .await
                .unwrap()
        });
        thread.join().unwrap();
        response
    }
    #[test]
    fn redirects_and_declared_or_chunked_oversize_responses_are_rejected() {
        let redirect=loopback_response(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/credential-sink\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        assert_eq!(redirect.status(), 302); // A redirect follow would have failed to connect.
        assert_eq!(
            tauri::async_runtime::block_on(bounded(redirect, 100)).unwrap_err(),
            "DESKTOP_REDIRECT_DENIED"
        );
        let declared = loopback_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nSYNTHETI",
        );
        assert_eq!(
            tauri::async_runtime::block_on(bounded(declared, 4)).unwrap_err(),
            "DESKTOP_RESPONSE_TOO_LARGE"
        );
        let chunked=loopback_response(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n8\r\nSYNTHETI\r\n0\r\n\r\n");
        assert_eq!(
            tauri::async_runtime::block_on(bounded(chunked, 4)).unwrap_err(),
            "DESKTOP_RESPONSE_TOO_LARGE"
        );
        let cached = loopback_response(
            b"HTTP/1.1 304 Not Modified\r\nETag: \"v1\"\r\nConnection: close\r\n\r\n",
        );
        let (status, body, etag) = tauri::async_runtime::block_on(bounded(cached, 4)).unwrap();
        assert_eq!(status, 304);
        assert!(body.is_empty());
        assert_eq!(etag.as_deref(), Some("\"v1\""));
    }
    #[test]
    fn response_after_expiry_is_not_published() {
        let v = MemoryVault::default();
        let mut s = SessiyaBusena::new();
        s.persist(&v, &credential(100), 0, 100).unwrap();
        assert!(response_current(&mut s, &v, 1, 200, 1100, Instant::now()).is_err());
        assert!(s.closed);
    }
    #[test]
    fn gateway_handler_status_body_and_etag_are_real_http_values() {
        let response=loopback_response(b"HTTP/1.1 403 Forbidden\r\nETag: \"forbidden-v1\"\r\nContent-Length: 12\r\nConnection: close\r\n\r\n{\"ok\":false}");
        let (status, body, etag) = tauri::async_runtime::block_on(bounded(response, 100)).unwrap();
        assert_eq!(status, 403);
        assert_eq!(body, "{\"ok\":false}");
        assert_eq!(etag.as_deref(), Some("\"forbidden-v1\""));
        let response = loopback_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 14\r\nConnection: close\r\n\r\n{\"status\":401}",
        );
        let (status, body, _) = tauri::async_runtime::block_on(bounded(response, 100)).unwrap();
        assert_eq!(status, 200);
        assert_eq!(body, "{\"status\":401}");
    }
    #[test]
    fn revoked_and_stale_responses_do_not_restore_or_revoke_new_session() {
        let v = MemoryVault::default();
        let mut s = SessiyaBusena::new();
        s.persist(&v, &credential(100), 0, 100).unwrap();
        s.revoke(&v).unwrap();
        s.persist(&v, &credential(100), 2, 100).unwrap();
        assert!(response_current(&mut s, &v, 1, 401, 100, Instant::now()).is_err());
        assert!(s.load(&v, 100, Instant::now()).unwrap().is_some());
        assert!(response_current(&mut s, &v, 1, 200, 100, Instant::now()).is_err());
        response_current(&mut s, &v, 3, 401, 100, Instant::now()).unwrap();
        assert!(s.load(&v, 100, Instant::now()).unwrap().is_none());
    }
    #[test]
    fn server_authority_and_device_binding_required() {
        let d = "11111111-1111-4111-8111-111111111111";
        let b = serde_json::json!({"ok":true,"foydalanuvchi_id":1,"tugaydi":1100}).to_string();
        let mut issued =
            serde_json::json!({"ok":true,"token":"SYNTHETIC","device_id":d,"tugaydi":1000});
        assert_eq!(authority(&b, &issued, 100).unwrap().expires, 1000);
        assert!(authority(&b, &issued, 1100).is_err());
        issued["foydalanuvchi_id"] = serde_json::json!(2);
        assert!(authority(&b, &issued, 100).is_err());
        issued["foydalanuvchi_id"] = serde_json::json!(1);
        issued["device_id"] = serde_json::json!("invalid/path");
        assert!(authority(&b, &issued, 100).is_err());
        assert!(authority("{\"ok\":true,\"rol\":\"boss\"}", &issued, 100).is_err());
    }
    #[test]
    fn cookie_is_selected_only_from_server_set_cookie() {
        let mut h = header::HeaderMap::new();
        h.append(
            header::SET_COOKIE,
            header::HeaderValue::from_static("other=x; Secure"),
        );
        assert!(session_cookie(&h).is_err());
        h.append(
            header::SET_COOKIE,
            header::HeaderValue::from_static("sess=SYNTHETIC; HttpOnly; Secure"),
        );
        assert_eq!(session_cookie(&h).unwrap().as_str(), "sess=SYNTHETIC");
        h.append(
            header::SET_COOKIE,
            header::HeaderValue::from_static("sess=duplicate; HttpOnly"),
        );
        assert!(session_cookie(&h).is_err());
    }
}
