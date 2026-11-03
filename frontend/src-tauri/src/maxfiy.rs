//! Fixed application credential only; ACL AND runtime local-main checks precede access.
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

struct SessiyaBusena {
    davr: u64,
    yopiq: bool,
}
impl SessiyaBusena {
    fn bilet(&self, davr: u64) -> Result<(), &'static str> {
        if self.davr != davr {
            return Err("DESKTOP_SESSION_STALE");
        }
        Ok(())
    }
    fn bekor(&mut self) -> Result<(), &'static str> {
        self.yopiq = true;
        self.davr = self
            .davr
            .checked_add(1)
            .ok_or("DESKTOP_SESSION_EXHAUSTED")?;
        Ok(())
    }
}
static QULF: Mutex<SessiyaBusena> = Mutex::new(SessiyaBusena {
    davr: 0,
    yopiq: false,
});
const SERVICE: &str = "uz.anncorp.smeta";
const ACCOUNT: &str = "desktop-session-v1";

fn entry() -> Result<keyring::Entry, &'static str> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "DESKTOP_CREDENTIAL_UNAVAILABLE")
}

fn caller_tekshir(window: &str, webview: &str, url: &tauri::Url) -> Result<(), &'static str> {
    // Exact packaged Windows origin. No dev server, remote HTTPS or wildcard subdomain.
    if window != "main"
        || webview != "main"
        || url.scheme() != "http"
        || url.host_str() != Some("tauri.localhost")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("DESKTOP_CALLER_DENIED");
    }
    Ok(())
}

fn runtime_tekshir(webview: &tauri::Webview) -> Result<(), &'static str> {
    let url = webview.url().map_err(|_| "DESKTOP_CALLER_DENIED")?;
    caller_tekshir(webview.window().label(), webview.label(), &url)
}

fn hozir() -> Result<u64, &'static str> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| u64::try_from(d.as_millis()).ok())
        .ok_or("DESKTOP_CLOCK_INVALID")
}

fn token_tekshir(token: &str) -> Result<(), &'static str> {
    if token.is_empty() || token.len() > 2400 || token.bytes().any(|b| b.is_ascii_control()) {
        return Err("DESKTOP_TOKEN_INVALID");
    }
    Ok(())
}

fn yozuv(token: &str, tugaydi_ms: u64, now: u64) -> Result<String, &'static str> {
    token_tekshir(token)?;
    // Metadata supplied by trusted login integration is NOT server authorization.
    if tugaydi_ms <= now || tugaydi_ms > 9_007_199_254_740_991 {
        return Err("DESKTOP_TOKEN_EXPIRED");
    }
    Ok(format!("v2:{tugaydi_ms}\n{token}"))
}

fn yozuv_oqi(value: &str, now: u64) -> Option<String> {
    let (expiry, token) = value.strip_prefix("v2:")?.split_once('\n')?;
    let tugaydi = expiry.parse().ok()?;
    yozuv(token, tugaydi, now).ok()?;
    Some(token.to_owned())
}

fn ochir() -> Result<(), &'static str> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("DESKTOP_CREDENTIAL_DELETE_FAILED"),
    }
}

#[tauri::command]
pub fn sessiya_token_saqla(
    webview: tauri::Webview,
    token: String,
    tugaydi_ms: u64,
    davr: u64,
) -> Result<(), &'static str> {
    let mut guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    runtime_tekshir(&webview)?;
    guard.bilet(davr)?;
    // Consume ticket before credential IO: queued pre-logout/refresh writes cannot restore it.
    guard.bekor()?;
    let value = match yozuv(&token, tugaydi_ms, hozir()?) {
        Ok(value) => value,
        Err(e) => {
            ochir()?;
            return Err(e);
        }
    };
    entry()?
        .set_password(&value)
        .map_err(|_| "DESKTOP_CREDENTIAL_WRITE_FAILED")?;
    guard.yopiq = false;
    Ok(())
}

#[tauri::command]
pub fn sessiya_token_ol(webview: tauri::Webview) -> Result<(Option<String>, u64), &'static str> {
    let mut guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    runtime_tekshir(&webview)?;
    if guard.yopiq {
        return Ok((None, guard.davr));
    }
    match entry()?.get_password() {
        Ok(value) => {
            let token = yozuv_oqi(&value, hozir()?);
            // Expired/malformed/legacy credentials cannot restore an authenticated session.
            if token.is_none() {
                guard.bekor()?;
                ochir()?;
            }
            Ok((token, guard.davr))
        }
        Err(keyring::Error::NoEntry) => Ok((None, guard.davr)),
        Err(_) => Err("DESKTOP_CREDENTIAL_READ_FAILED"),
    }
}

#[tauri::command]
pub fn sessiya_token_ochir(webview: tauri::Webview) -> Result<(), &'static str> {
    let mut guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    runtime_tekshir(&webview)?;
    guard.bekor()?;
    ochir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logout_and_refresh_reject_delayed_write_tickets() {
        let mut state = SessiyaBusena {
            davr: 0,
            yopiq: false,
        };
        let old = state.davr;
        state.bekor().unwrap();
        assert!(state.yopiq);
        assert!(state.bilet(old).is_err());
        let fresh = state.davr;
        assert!(state.bilet(fresh).is_ok());
        state.bekor().unwrap();
        assert!(state.bilet(fresh).is_err());
    }

    #[test]
    fn token_chegarasi() {
        assert!(token_tekshir("SYNTHETIC.test.token").is_ok());
        for token in ["".to_string(), "test\r\nforged".into(), "a".repeat(2401)] {
            assert!(token_tekshir(&token).is_err());
        }
    }

    #[test]
    fn only_packaged_main_origin() {
        let local = tauri::Url::parse("http://tauri.localhost/admin?test=1").unwrap();
        assert!(caller_tekshir("main", "main", &local).is_ok());
        assert!(caller_tekshir("other", "main", &local).is_err());
        assert!(caller_tekshir("main", "child", &local).is_err());
        for url in [
            "https://smeta-tizimi.pages.dev",
            "http://localhost:5173",
            "https://tauri.localhost",
            "http://tauri.localhost.evil",
            "http://tauri.localhost:8080",
            "http://user@tauri.localhost",
            "tauri://localhost",
            "about:blank",
        ] {
            assert!(
                caller_tekshir("main", "main", &tauri::Url::parse(url).unwrap()).is_err(),
                "{url}"
            );
        }
    }

    #[test]
    fn ttl_and_legacy_fail_closed_without_credential_io() {
        let value = yozuv("SYNTHETIC", 101, 100).unwrap();
        assert_eq!(yozuv_oqi(&value, 100).as_deref(), Some("SYNTHETIC"));
        assert_eq!(yozuv_oqi(&value, 101), None);
        for value in [
            "SYNTHETIC_LEGACY",
            "v2:nope\nSYNTHETIC",
            "v2:999\n",
            "v2:999\nx\r",
        ] {
            assert_eq!(yozuv_oqi(value, 100), None);
        }
        assert!(yozuv("SYNTHETIC", 100, 100).is_err());
    }

    #[test]
    fn command_manifest_and_local_capability_are_explicit() {
        let build = include_str!("../build.rs");
        let permission = include_str!("../permissions/session.toml");
        let capability = include_str!("../capabilities/default.json");
        assert!(build.contains("AppManifest::new().commands"));
        for command in [
            "sessiya_token_saqla",
            "sessiya_token_ol",
            "sessiya_token_ochir",
        ] {
            assert!(build.contains(command));
            assert!(permission.contains(command));
        }
        assert!(capability.contains("\"local\": true"));
        assert!(capability.contains("\"webviews\": [\"main\"]"));
        assert!(capability.contains("session-local"));
        assert!(!capability.contains("remote"));
        assert!(!capability.contains('*'));
    }
}
