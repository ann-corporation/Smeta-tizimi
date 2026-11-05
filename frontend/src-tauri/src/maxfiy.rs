//! Native-only secrets; IPC never exposes credentials or AES keys.
use aes_gcm::aead::{rand_core::RngCore, OsRng};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use zeroize::Zeroize;
pub(crate) type NativeResult<T> = Result<T, &'static str>;
#[cfg(not(feature = "desktop-e2e"))]
const SERVICE: &str = "uz.anncorp.smeta";
#[cfg(feature = "desktop-e2e")]
const SERVICE: &str = "uz.anncorp.smeta.e2e";
const ACCOUNT: &str = "desktop-session-v1";
// Upper bound matches the BFF's DESKTOP_SESSION_MS; actual expiry is the shorter
// of device issuance and freshly validated /api/sessiya authority.
pub(crate) const MAX_TTL: u64 = 90 * 24 * 60 * 60 * 1000;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Credential {
    pub version: u8,
    pub token: String,
    pub actor: u64,
    pub device: String,
    pub expires: u64,
    pub key: String,
    pub cache_id: String,
}
impl Drop for Credential {
    fn drop(&mut self) {
        self.token.zeroize();
        self.key.zeroize();
    }
}
pub(crate) trait Vault {
    fn read(&self) -> NativeResult<Option<String>>;
    fn write(&self, value: &str) -> NativeResult<()>;
    fn delete(&self) -> NativeResult<()>;
}
pub(crate) struct OsVault;
fn entry() -> NativeResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "DESKTOP_CREDENTIAL_UNAVAILABLE")
}
impl Vault for OsVault {
    fn read(&self) -> NativeResult<Option<String>> {
        match entry()?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("DESKTOP_CREDENTIAL_READ_FAILED"),
        }
    }
    fn write(&self, value: &str) -> NativeResult<()> {
        entry()?
            .set_password(value)
            .map_err(|_| "DESKTOP_CREDENTIAL_WRITE_FAILED")
    }
    fn delete(&self) -> NativeResult<()> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("DESKTOP_CREDENTIAL_DELETE_FAILED"),
        }
    }
}
pub(crate) struct SessiyaBusena {
    pub generation: u64,
    pub closed: bool,
    deadline: Option<Instant>,
}
impl SessiyaBusena {
    pub const fn new() -> Self {
        Self {
            generation: 0,
            closed: false,
            deadline: None,
        }
    }
    pub fn ticket(&self, generation: u64) -> NativeResult<()> {
        if generation != self.generation {
            return Err("DESKTOP_SESSION_STALE");
        }
        Ok(())
    }
    pub fn revoke(&mut self, vault: &impl Vault) -> NativeResult<()> {
        self.closed = true;
        self.deadline = None;
        self.generation = self
            .generation
            .checked_add(1)
            .ok_or("DESKTOP_SESSION_EXHAUSTED")?;
        vault.delete()
    }
    pub fn load(
        &mut self,
        vault: &impl Vault,
        now: u64,
        mono: Instant,
    ) -> NativeResult<Option<Credential>> {
        if self.closed {
            return Ok(None);
        }
        let Some(raw) = vault.read()? else {
            return Ok(None);
        };
        let raw = zeroize::Zeroizing::new(raw);
        let value = serde_json::from_str::<Credential>(&raw)
            .ok()
            .filter(|c| valid(c, now));
        if value.is_none() || self.deadline.is_some_and(|d| mono >= d) {
            self.revoke(vault)?;
            return Ok(None);
        }
        let value = value.expect("checked above");
        self.deadline
            .get_or_insert(mono + Duration::from_millis(value.expires - now));
        Ok(Some(value))
    }
    pub fn persist(
        &mut self,
        vault: &impl Vault,
        credential: &Credential,
        generation: u64,
        now: u64,
    ) -> NativeResult<()> {
        self.ticket(generation)?;
        if !valid(credential, now) {
            return Err("DESKTOP_CREDENTIAL_INVALID");
        }
        self.revoke(vault)?;
        let raw = zeroize::Zeroizing::new(
            serde_json::to_string(credential).map_err(|_| "DESKTOP_CREDENTIAL_INVALID")?,
        );
        vault.write(&raw)?;
        self.deadline = Some(Instant::now() + Duration::from_millis(credential.expires - now));
        self.closed = false;
        Ok(())
    }
}
static STATE: Mutex<SessiyaBusena> = Mutex::new(SessiyaBusena::new());
pub(crate) fn state() -> NativeResult<MutexGuard<'static, SessiyaBusena>> {
    STATE.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")
}
pub(crate) fn now() -> NativeResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| u64::try_from(d.as_millis()).ok())
        .ok_or("DESKTOP_CLOCK_INVALID")
}
pub(crate) fn token_tekshir(token: &str) -> NativeResult<()> {
    if token.is_empty()
        || token.len() > 2400
        || !token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
    {
        return Err("DESKTOP_TOKEN_INVALID");
    }
    Ok(())
}
pub(crate) fn positive(id: &str) -> bool {
    !id.starts_with('0')
        && !id.is_empty()
        && id.bytes().all(|b| b.is_ascii_digit())
        && id.parse::<u64>().is_ok_and(|v| v <= 9_007_199_254_740_991)
}
pub(crate) fn device_valid(device: &str) -> bool {
    device.len() == 36
        && device.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
fn valid(c: &Credential, now: u64) -> bool {
    c.version == 3
        && c.actor > 0
        && c.actor <= 9_007_199_254_740_991
        && device_valid(&c.device)
        && token_tekshir(&c.token).is_ok()
        && c.expires > now
        && c.expires - now <= MAX_TTL
        && STANDARD.decode(&c.key).is_ok_and(|v| v.len() == 32)
        && c.cache_id.len() == 32
        && c.cache_id.bytes().all(|b| b.is_ascii_hexdigit())
}
pub(crate) fn fresh_key() -> NativeResult<(String, String)> {
    let mut key = zeroize::Zeroizing::new([0u8; 32]);
    let mut id = [0u8; 16];
    OsRng
        .try_fill_bytes(key.as_mut())
        .map_err(|_| "DESKTOP_RANDOM_FAILED")?;
    OsRng
        .try_fill_bytes(&mut id)
        .map_err(|_| "DESKTOP_RANDOM_FAILED")?;
    Ok((
        STANDARD.encode(key.as_ref()),
        id.iter().map(|v| format!("{v:02x}")).collect(),
    ))
}
fn caller_tekshir(window: &str, webview: &str, url: &tauri::Url) -> NativeResult<()> {
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
pub(crate) fn runtime_tekshir(webview: &tauri::Webview) -> NativeResult<()> {
    let url = webview.url().map_err(|_| "DESKTOP_CALLER_DENIED")?;
    caller_tekshir(webview.window().label(), webview.label(), &url)
}
#[derive(Serialize)]
pub struct SessionInfo {
    pub device_id: Option<String>,
    pub foydalanuvchi_id: Option<u64>,
    pub generation: u64,
}
#[tauri::command]
pub fn desktop_session_info(webview: tauri::Webview) -> NativeResult<SessionInfo> {
    runtime_tekshir(&webview)?;
    let mut guard = state()?;
    let record = guard.load(&OsVault, now()?, Instant::now())?;
    Ok(SessionInfo {
        device_id: record.as_ref().map(|r| r.device.clone()),
        foydalanuvchi_id: record.as_ref().map(|r| r.actor),
        generation: guard.generation,
    })
}
#[tauri::command]
pub fn desktop_session_clear(webview: tauri::Webview) -> NativeResult<()> {
    runtime_tekshir(&webview)?;
    // Crypto-erasure: the AES key and token share one keychain entry.
    state()?.revoke(&OsVault)
}
#[cfg(test)]
#[path = "native_tests.rs"]
pub(crate) mod tests;
