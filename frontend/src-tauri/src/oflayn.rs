//! "Oflayn" bridge for the live site (https://smeta-tizimi.pages.dev) in the Onlayn qobiq apps.
//!
//! The remote origin gets a deliberately narrow set of commands (see permissions/oflayn.toml and
//! capabilities/remote.json): an encrypted, actor-bound read cache, a Fakt write queue and a status call.
//! No filesystem, shell, opener or other plugin access exists for the remote origin.
//!
//! Security model:
//!  * The scope (foydalanuvchi_id + set of kompaniya ids) is NEVER taken from page input. It comes from the HttpOnly
//!    session cookie held by the webview and is confirmed by the server (`GET /api/sessiya`, performed here in Rust).
//!    Offline, the cookie identity must equal the last server-confirmed scope and the confirmation must be < 72 h old.
//!  * Data is AES-256-GCM encrypted with a per-scope random key stored in the OS secret store (Windows Credential
//!    Manager / Apple Keychain / Android Keystore). AAD binds actor + cache id + entry name, so a copied file cannot
//!    be read under another actor, and a different actor can never decrypt it.
//!  * Actor change, logout, cookie loss or membership change wipe the files and rotate the key (crypto-erasure).
//!  * Entries expire after 72 h (cache) and are size-limited; the page cannot choose any disk path.
use crate::cache::{seal_raw, unseal_raw};
use crate::maxfiy::{self, NativeResult, Vault};
use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD},
    Engine as _,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, Runtime, Url, Webview};
use zeroize::Zeroize;

const BASE: &str = "oflayn-v1";
const MARKER: &str = "oflayn-qobiq-v1.json";
/// Lease-like window: the last server confirmation of the scope must be younger than this to use the disk offline.
pub(crate) const TTL_MS: u64 = 72 * 60 * 60 * 1000;
pub(crate) const MAX_ENTRY: usize = 24 * 1024 * 1024;
pub(crate) const MAX_QUEUE_ITEM: usize = 8 * 1024 * 1024;
pub(crate) const MAX_QUEUE: usize = 200;
pub(crate) const MAX_TOTAL: u64 = 512 * 1024 * 1024;
const SESSION_BODY_LIMIT: usize = 256 * 1024;
static LOCK: Mutex<()> = Mutex::new(());

// ---------------------------------------------------------------------------------------------------------------
// Secret store record (one per device; holds the key of the CURRENT scope only).
// ---------------------------------------------------------------------------------------------------------------
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Record {
    pub version: u8,
    pub key: String,
    pub cache_id: String,
    pub actor: u64,
    pub companies: Vec<u64>,
    /// Last server confirmation of the scope (ms since epoch).
    pub verified: u64,
}
impl std::fmt::Debug for Record {
    // Never prints the key.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Record(actor={}, cache_id={})", self.actor, self.cache_id)
    }
}
impl Drop for Record {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

pub(crate) struct OflaynVault;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "ios"))]
fn entry() -> NativeResult<keyring::Entry> {
    keyring::Entry::new(maxfiy::SERVICE, "oflayn-v1").map_err(|_| "OFLAYN_CREDENTIAL_UNAVAILABLE")
}
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "ios"))]
impl Vault for OflaynVault {
    fn read(&self) -> NativeResult<Option<String>> {
        match entry()?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("OFLAYN_CREDENTIAL_READ_FAILED"),
        }
    }
    fn write(&self, value: &str) -> NativeResult<()> {
        entry()?
            .set_password(value)
            .map_err(|_| "OFLAYN_CREDENTIAL_WRITE_FAILED")
    }
    fn delete(&self) -> NativeResult<()> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("OFLAYN_CREDENTIAL_DELETE_FAILED"),
        }
    }
}
// Android: the in-repo keystore plugin has a single slot. In the default (Onlayn qobiq) build the legacy BFF credential is
// never written, so the slot belongs to this module; `local-bff` builds do not register these commands.
#[cfg(target_os = "android")]
impl Vault for OflaynVault {
    fn read(&self) -> NativeResult<Option<String>> {
        smeta_keystore::get()
    }
    fn write(&self, value: &str) -> NativeResult<()> {
        smeta_keystore::set(value)
    }
    fn delete(&self) -> NativeResult<()> {
        smeta_keystore::delete()
    }
}
#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "ios",
    target_os = "android"
)))]
impl Vault for OflaynVault {
    fn read(&self) -> NativeResult<Option<String>> {
        Err("OFLAYN_CREDENTIAL_UNAVAILABLE")
    }
    fn write(&self, _: &str) -> NativeResult<()> {
        Err("OFLAYN_CREDENTIAL_UNAVAILABLE")
    }
    fn delete(&self) -> NativeResult<()> {
        Err("OFLAYN_CREDENTIAL_UNAVAILABLE")
    }
}

fn cache_id_valid(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
fn fresh_record(actor: u64, companies: Vec<u64>, now: u64) -> NativeResult<Record> {
    let (key, cache_id) = maxfiy::fresh_key()?;
    Ok(Record {
        version: 1,
        key,
        cache_id,
        actor,
        companies,
        verified: now,
    })
}
fn record_valid(r: &Record) -> bool {
    r.version == 1
        && r.actor > 0
        && r.actor <= 9_007_199_254_740_991
        && cache_id_valid(&r.cache_id)
        && STANDARD.decode(&r.key).is_ok_and(|v| v.len() == 32)
        && r.companies.iter().all(|c| *c > 0 && *c <= 9_007_199_254_740_991)
}

// ---------------------------------------------------------------------------------------------------------------
// Names: the page can only choose from a fixed grammar; it never supplies a path.
// ---------------------------------------------------------------------------------------------------------------
/// Read-cache key: "r_" + 64 lowercase hex (SHA-256 of the request, computed by the page).
pub(crate) fn cache_name_ok(k: &str) -> bool {
    k.len() == 66
        && k.starts_with("r_")
        && k[2..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
/// Queue id: 13 digits (ms) '-' 16..32 lowercase hex. Sorting ids sorts the queue chronologically.
pub(crate) fn queue_id_ok(id: &str) -> bool {
    match id.split_once('-') {
        Some((a, b)) => {
            a.len() == 13
                && a.bytes().all(|c| c.is_ascii_digit())
                && (16..=32).contains(&b.len())
                && b.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        }
        None => false,
    }
}
fn aad(rec: &Record, name: &str) -> Vec<u8> {
    format!("oflayn1|{}|{}|{name}", rec.actor, rec.cache_id).into_bytes()
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    t: u64,
    v: String,
}

// ---------------------------------------------------------------------------------------------------------------
// Session identity (from the cookie) and the offline gate.
// ---------------------------------------------------------------------------------------------------------------
pub(crate) struct CookieSession {
    pub actor: u64,
    pub value: String,
}
/// The site cookie is `sess=<base64(json)>.<hmac>`. Rust only READS the identity here; trust comes from the server
/// confirmation in `holat` (online) or from the previous confirmation (offline). The cookie is HttpOnly: the page
/// cannot read or forge it.
pub(crate) fn parse_session_cookie(value: &str, now: u64) -> Option<CookieSession> {
    if value.is_empty()
        || value.len() > 4096
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"+/=._-".contains(&b))
    {
        return None;
    }
    let (body, sig) = value.split_once('.')?;
    if body.is_empty() || sig.is_empty() || sig.contains('.') {
        return None;
    }
    let raw = STANDARD_NO_PAD
        .decode(body.trim_end_matches('='))
        .or_else(|_| STANDARD.decode(body))
        .ok()?;
    let j: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    let actor = j.get("foydalanuvchi_id")?.as_u64()?;
    let exp = j.get("exp")?.as_u64()?;
    if actor == 0 || actor > 9_007_199_254_740_991 || exp <= now {
        return None;
    }
    Some(CookieSession {
        actor,
        value: value.to_string(),
    })
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Gate {
    Open,
    /// Identity is gone or different: erase the scope.
    Wipe(&'static str),
    Deny(&'static str),
}
pub(crate) fn gate(rec: Option<&Record>, cookie_actor: Option<u64>, now: u64) -> Gate {
    let Some(actor) = cookie_actor else {
        return if rec.is_some() {
            Gate::Wipe("OFLAYN_SESSION_REQUIRED")
        } else {
            Gate::Deny("OFLAYN_SESSION_REQUIRED")
        };
    };
    let Some(rec) = rec else {
        return Gate::Deny("OFLAYN_NOT_BOUND");
    };
    if rec.actor != actor {
        return Gate::Wipe("OFLAYN_ACTOR_CHANGED");
    }
    if now.saturating_sub(rec.verified) > TTL_MS {
        return Gate::Deny("OFLAYN_LEASE_EXPIRED");
    }
    Gate::Open
}

/// `/api/sessiya` answer -> sorted unique company ids, only if it confirms the cookie's actor.
pub(crate) fn confirm_sessiya(body: &[u8], actor: u64) -> Option<Vec<u64>> {
    if body.len() > SESSION_BODY_LIMIT {
        return None;
    }
    let j: serde_json::Value = serde_json::from_slice(body).ok()?;
    if j.get("ok")?.as_bool()? != true || j.get("foydalanuvchi_id")?.as_u64()? != actor {
        return None;
    }
    let mut ids: Vec<u64> = j
        .get("kompaniyalar")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|c| c.get("kompaniya_id").and_then(|v| v.as_u64()))
                .filter(|c| *c > 0 && *c <= 9_007_199_254_740_991)
                .collect()
        })
        .unwrap_or_default();
    ids.sort_unstable();
    ids.dedup();
    Some(ids)
}

pub(crate) enum Verify {
    Confirmed(Vec<u64>),
    /// The server answered 401/403 or a different identity: the session is not valid.
    Invalid,
    /// No answer (offline, DNS, 5xx, timeout).
    Unreachable,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Holat {
    pub tayyor: bool,
    pub onlayn: bool,
    pub foydalanuvchi_id: Option<u64>,
    pub kompaniyalar: Vec<u64>,
    pub tekshirilgan_ms: Option<u64>,
    pub muddat_ms: Option<u64>,
    pub sabab: Option<&'static str>,
}
impl Holat {
    fn off(sabab: &'static str) -> Self {
        Holat {
            tayyor: false,
            onlayn: false,
            foydalanuvchi_id: None,
            kompaniyalar: vec![],
            tekshirilgan_ms: None,
            muddat_ms: None,
            sabab: Some(sabab),
        }
    }
    fn from(rec: &Record, onlayn: bool) -> Self {
        Holat {
            tayyor: true,
            onlayn,
            foydalanuvchi_id: Some(rec.actor),
            kompaniyalar: rec.companies.clone(),
            tekshirilgan_ms: Some(rec.verified),
            muddat_ms: Some(rec.verified + TTL_MS),
            sabab: None,
        }
    }
}

#[derive(Serialize)]
pub struct KeshYozuv {
    pub vaqt_ms: u64,
    pub qiymat: String,
}
#[derive(Serialize)]
pub struct NavbatYozuv {
    pub id: String,
    pub vaqt_ms: u64,
    pub qiymat: String,
}

// ---------------------------------------------------------------------------------------------------------------
// Engine: all disk/secret logic, independent of Tauri so it can be tested with a memory vault and a temp dir.
// ---------------------------------------------------------------------------------------------------------------
pub(crate) struct Engine<'a, V: Vault> {
    pub vault: &'a V,
    pub root: &'a Path,
}
fn reparse(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
impl<V: Vault> Engine<'_, V> {
    fn load(&self) -> NativeResult<Option<Record>> {
        let Some(raw) = self.vault.read()? else {
            return Ok(None);
        };
        let raw = zeroize::Zeroizing::new(raw);
        match serde_json::from_str::<Record>(&raw) {
            Ok(r) if record_valid(&r) => Ok(Some(r)),
            _ => {
                // Unknown/corrupt record: it can never decrypt anything we trust. Erase it and its files.
                let _ = self.wipe_files();
                self.vault.delete()?;
                Ok(None)
            }
        }
    }
    fn persist(&self, rec: &Record) -> NativeResult<()> {
        let raw = zeroize::Zeroizing::new(
            serde_json::to_string(rec).map_err(|_| "OFLAYN_CREDENTIAL_INVALID")?,
        );
        self.vault.write(&raw)
    }
    fn base(&self) -> PathBuf {
        self.root.join(BASE)
    }
    fn dir(&self, rec: &Record) -> NativeResult<PathBuf> {
        if !cache_id_valid(&rec.cache_id) {
            return Err("OFLAYN_PATH_DENIED");
        }
        let mut path = self.root.to_path_buf();
        for part in [BASE, rec.cache_id.as_str()] {
            path.push(part);
            match fs::symlink_metadata(&path) {
                Ok(m) if reparse(&m) || !m.is_dir() => return Err("OFLAYN_PATH_DENIED"),
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    fs::create_dir(&path).map_err(|_| "OFLAYN_IO")?
                }
                Err(_) => return Err("OFLAYN_IO"),
            }
        }
        Ok(path)
    }
    /// Removes every ciphertext file of every scope generation (names are validated; nothing else is touched).
    pub(crate) fn wipe_files(&self) -> NativeResult<()> {
        let base = self.base();
        let meta = match fs::symlink_metadata(&base) {
            Ok(m) => m,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err("OFLAYN_IO"),
        };
        if reparse(&meta) || !meta.is_dir() {
            return Err("OFLAYN_PATH_DENIED");
        }
        for d in fs::read_dir(&base).map_err(|_| "OFLAYN_IO")? {
            let d = d.map_err(|_| "OFLAYN_IO")?;
            let name = d.file_name();
            let Some(id) = name.to_str().filter(|n| cache_id_valid(n)) else {
                continue;
            };
            let dir = base.join(id);
            let m = fs::symlink_metadata(&dir).map_err(|_| "OFLAYN_IO")?;
            if reparse(&m) || !m.is_dir() {
                return Err("OFLAYN_PATH_DENIED");
            }
            for f in fs::read_dir(&dir).map_err(|_| "OFLAYN_IO")? {
                let f = f.map_err(|_| "OFLAYN_IO")?;
                let fname = f.file_name();
                let fname = fname.to_str().ok_or("OFLAYN_PATH_DENIED")?;
                let fm = fs::symlink_metadata(f.path()).map_err(|_| "OFLAYN_IO")?;
                let known = fname.ends_with(".bin") || fname.ends_with(".tmp");
                if reparse(&fm) || !fm.is_file() || !known {
                    return Err("OFLAYN_PATH_DENIED");
                }
                fs::remove_file(f.path()).map_err(|_| "OFLAYN_IO")?;
            }
            fs::remove_dir(&dir).map_err(|_| "OFLAYN_IO")?;
        }
        Ok(())
    }
    /// Crypto-erasure: files first, then the key.
    pub(crate) fn wipe_all(&self) -> NativeResult<()> {
        let files = self.wipe_files();
        self.vault.delete()?;
        files
    }
    /// Server-confirmed identity (or its absence) -> state + status. Same actor and same company set keep the cache.
    pub(crate) fn holat(
        &self,
        cookie_actor: u64,
        verify: Verify,
        now: u64,
    ) -> NativeResult<Holat> {
        let rec = self.load()?;
        match verify {
            Verify::Confirmed(companies) => {
                let keep = rec
                    .as_ref()
                    .is_some_and(|r| r.actor == cookie_actor && r.companies == companies);
                let next = if keep {
                    let mut r = rec.clone().expect("kept record");
                    r.verified = now;
                    r
                } else {
                    // Different actor or changed membership: nothing stored for the old scope may survive.
                    self.wipe_files()?;
                    fresh_record(cookie_actor, companies, now)?
                };
                self.persist(&next)?;
                Ok(Holat::from(&next, true))
            }
            Verify::Invalid => {
                self.wipe_all()?;
                Ok(Holat::off("OFLAYN_SESSION_INVALID"))
            }
            Verify::Unreachable => match gate(rec.as_ref(), Some(cookie_actor), now) {
                Gate::Open => Ok(Holat::from(rec.as_ref().expect("open gate has record"), false)),
                Gate::Wipe(why) => {
                    self.wipe_all()?;
                    Ok(Holat::off(why))
                }
                Gate::Deny(why) => Ok(Holat::off(why)),
            },
        }
    }
    /// Cheap check used by every data command (no network).
    pub(crate) fn open(&self, cookie_actor: Option<u64>, now: u64) -> NativeResult<Record> {
        let rec = self.load()?;
        match gate(rec.as_ref(), cookie_actor, now) {
            Gate::Open => Ok(rec.expect("open gate has record")),
            Gate::Wipe(why) => {
                self.wipe_all()?;
                Err(why)
            }
            Gate::Deny(why) => Err(why),
        }
    }
    fn file(&self, rec: &Record, name: &str) -> NativeResult<PathBuf> {
        Ok(self.dir(rec)?.join(format!("{name}.bin")))
    }
    fn used_bytes(&self, rec: &Record, except: &str) -> NativeResult<(u64, Vec<(std::time::SystemTime, PathBuf, u64)>)> {
        let dir = self.dir(rec)?;
        let skip = format!("{except}.bin");
        let (mut total, mut evict) = (0u64, vec![]);
        for f in fs::read_dir(&dir).map_err(|_| "OFLAYN_IO")? {
            let f = f.map_err(|_| "OFLAYN_IO")?;
            let m = f.metadata().map_err(|_| "OFLAYN_IO")?;
            let name = f.file_name();
            let name = name.to_string_lossy();
            if name == skip.as_str() || !m.is_file() {
                continue;
            }
            total += m.len();
            if name.starts_with("r_") {
                evict.push((m.modified().unwrap_or(std::time::UNIX_EPOCH), f.path(), m.len()));
            }
        }
        evict.sort();
        Ok((total, evict))
    }
    fn put(&self, rec: &Record, name: &str, value: &str, now: u64, max: usize) -> NativeResult<()> {
        if value.len() > max {
            return Err("OFLAYN_TOO_LARGE");
        }
        let env = serde_json::to_vec(&Envelope { t: now, v: value.to_string() })
            .map_err(|_| "OFLAYN_ENCODE")?;
        let sealed = seal_raw(&rec.key, &aad(rec, name), &env, max + 128)?;
        let (mut total, evict) = self.used_bytes(rec, name)?;
        for (_, path, len) in evict {
            if total + sealed.len() as u64 <= MAX_TOTAL {
                break;
            }
            // Oldest read-cache entries go first; the Fakt queue (q_*) is never evicted.
            if fs::remove_file(&path).is_ok() {
                total -= len;
            }
        }
        if total + sealed.len() as u64 > MAX_TOTAL {
            return Err("OFLAYN_QUOTA");
        }
        let dir = self.dir(rec)?;
        let file = dir.join(format!("{name}.bin"));
        match fs::symlink_metadata(&file) {
            Ok(m) if reparse(&m) || !m.is_file() => return Err("OFLAYN_PATH_DENIED"),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("OFLAYN_IO"),
        }
        let (_, id) = maxfiy::fresh_key()?;
        let temp = dir.join(format!("{id}.tmp"));
        let result = (|| {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|_| "OFLAYN_IO")?;
            f.write_all(&sealed)
                .and_then(|_| f.sync_all())
                .map_err(|_| "OFLAYN_IO")?;
            drop(f);
            match fs::remove_file(&file) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("OFLAYN_IO"),
            }
            fs::rename(&temp, &file).map_err(|_| "OFLAYN_IO")
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result
    }
    fn get(&self, rec: &Record, name: &str, max: usize) -> NativeResult<Option<Envelope>> {
        let file = self.file(rec, name)?;
        match fs::symlink_metadata(&file) {
            Ok(m) if reparse(&m) || !m.is_file() => return Err("OFLAYN_PATH_DENIED"),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("OFLAYN_IO"),
        }
        let mut bytes = Vec::new();
        fs::File::open(&file)
            .map_err(|_| "OFLAYN_IO")?
            .take((max + 256) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "OFLAYN_IO")?;
        let plain = zeroize::Zeroizing::new(unseal_raw(&rec.key, &aad(rec, name), &bytes, max + 128)?);
        serde_json::from_slice::<Envelope>(&plain)
            .map(Some)
            .map_err(|_| "OFLAYN_INVALID")
    }
    fn remove(&self, rec: &Record, name: &str) -> NativeResult<()> {
        let file = self.file(rec, name)?;
        match fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("OFLAYN_IO"),
        }
    }

    // ---- read cache -------------------------------------------------------------------------------------------
    pub(crate) fn cache_put(&self, rec: &Record, name: &str, value: &str, now: u64) -> NativeResult<()> {
        if !cache_name_ok(name) {
            return Err("OFLAYN_KEY_DENIED");
        }
        self.put(rec, name, value, now, MAX_ENTRY)
    }
    pub(crate) fn cache_get(&self, rec: &Record, name: &str, now: u64) -> NativeResult<Option<KeshYozuv>> {
        if !cache_name_ok(name) {
            return Err("OFLAYN_KEY_DENIED");
        }
        let Some(e) = self.get(rec, name, MAX_ENTRY)? else {
            return Ok(None);
        };
        if now.saturating_sub(e.t) > TTL_MS || e.t > now + 5 * 60 * 1000 {
            self.remove(rec, name)?;
            return Ok(None);
        }
        Ok(Some(KeshYozuv { vaqt_ms: e.t, qiymat: e.v }))
    }
    pub(crate) fn cache_del(&self, rec: &Record, name: &str) -> NativeResult<()> {
        if !cache_name_ok(name) {
            return Err("OFLAYN_KEY_DENIED");
        }
        self.remove(rec, name)
    }

    // ---- Fakt write queue -------------------------------------------------------------------------------------
    fn queue_names(&self, rec: &Record) -> NativeResult<Vec<String>> {
        let mut out = vec![];
        for f in fs::read_dir(self.dir(rec)?).map_err(|_| "OFLAYN_IO")? {
            let f = f.map_err(|_| "OFLAYN_IO")?;
            let name = f.file_name();
            let Some(id) = name
                .to_str()
                .and_then(|n| n.strip_prefix("q_"))
                .and_then(|n| n.strip_suffix(".bin"))
            else {
                continue;
            };
            if queue_id_ok(id) {
                out.push(id.to_string());
            }
        }
        out.sort();
        Ok(out)
    }
    pub(crate) fn queue_put(&self, rec: &Record, id: &str, value: &str, now: u64) -> NativeResult<()> {
        if !queue_id_ok(id) {
            return Err("OFLAYN_KEY_DENIED");
        }
        if !self.queue_names(rec)?.iter().any(|n| n == id) && self.queue_names(rec)?.len() >= MAX_QUEUE {
            return Err("OFLAYN_QUEUE_FULL");
        }
        self.put(rec, &format!("q_{id}"), value, now, MAX_QUEUE_ITEM)
    }
    pub(crate) fn queue_list(&self, rec: &Record) -> NativeResult<Vec<NavbatYozuv>> {
        let mut out = vec![];
        for id in self.queue_names(rec)? {
            // A corrupt/foreign item must not hide the others; it is skipped (and stays on disk until wipe).
            if let Ok(Some(e)) = self.get(rec, &format!("q_{id}"), MAX_QUEUE_ITEM) {
                out.push(NavbatYozuv { id, vaqt_ms: e.t, qiymat: e.v });
            }
        }
        Ok(out)
    }
    pub(crate) fn queue_del(&self, rec: &Record, id: &str) -> NativeResult<()> {
        if !queue_id_ok(id) {
            return Err("OFLAYN_KEY_DENIED");
        }
        self.remove(rec, &format!("q_{id}"))
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Tauri glue.
// ---------------------------------------------------------------------------------------------------------------
fn site_url() -> Url {
    Url::parse(&format!("https://{}/", crate::shell::SITE_HOST)).expect("site url")
}
/// Only the main webview showing the live site may call these commands (defense in depth on top of the ACL).
pub(crate) fn caller_ok(window: &str, webview: &str, url: &Url) -> NativeResult<()> {
    if window != "main"
        || webview != "main"
        || url.scheme() != "https"
        || url.host_str() != Some(crate::shell::SITE_HOST)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("OFLAYN_CALLER_DENIED");
    }
    Ok(())
}
fn caller<R: Runtime>(wv: &Webview<R>) -> NativeResult<()> {
    let url = wv.url().map_err(|_| "OFLAYN_CALLER_DENIED")?;
    caller_ok(wv.window().label(), wv.label(), &url)
}
fn cookie_session<R: Runtime>(wv: &Webview<R>, now: u64) -> NativeResult<Option<CookieSession>> {
    let cookies = wv
        .cookies_for_url(site_url())
        .map_err(|_| "OFLAYN_COOKIES_UNAVAILABLE")?;
    Ok(cookies
        .iter()
        .find(|c| c.name() == "sess")
        .and_then(|c| parse_session_cookie(c.value(), now)))
}
fn root<R: Runtime>(app: &AppHandle<R>) -> NativeResult<PathBuf> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "OFLAYN_IO")?;
    fs::create_dir_all(&root).map_err(|_| "OFLAYN_IO")?;
    Ok(root)
}
fn lock() -> NativeResult<std::sync::MutexGuard<'static, ()>> {
    LOCK.lock().map_err(|_| "OFLAYN_BUSY")
}
async fn server_sessiya(cookie: &str, actor: u64) -> Verify {
    let client = match reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(6))
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Verify::Unreachable,
    };
    let url = format!("https://{}/api/sessiya", crate::shell::SITE_HOST);
    let resp = client
        .get(url)
        .header(reqwest::header::COOKIE, format!("sess={cookie}"))
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send()
        .await;
    let Ok(resp) = resp else {
        return Verify::Unreachable;
    };
    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Verify::Invalid;
    }
    if status != 200 {
        return Verify::Unreachable;
    }
    let Ok(body) = resp.bytes().await else {
        return Verify::Unreachable;
    };
    match confirm_sessiya(&body, actor) {
        Some(c) => Verify::Confirmed(c),
        // 200 but another identity / malformed: never trust it for this cookie.
        None => Verify::Invalid,
    }
}
fn scoped<R: Runtime, T>(
    app: &AppHandle<R>,
    wv: &Webview<R>,
    f: impl FnOnce(&Engine<OflaynVault>, &Record, u64) -> NativeResult<T>,
) -> NativeResult<T> {
    caller(wv)?;
    let root = root(app)?;
    let now = maxfiy::now()?;
    let actor = cookie_session(wv, now)?.map(|c| c.actor);
    let _g = lock()?;
    let eng = Engine { vault: &OflaynVault, root: &root };
    let rec = eng.open(actor, now)?;
    f(&eng, &rec, now)
}

#[tauri::command]
pub async fn oflayn_holat<R: Runtime>(webview: Webview<R>, app: AppHandle<R>) -> NativeResult<Holat> {
    caller(&webview)?;
    let root = root(&app)?;
    let now = maxfiy::now()?;
    let Some(cookie) = cookie_session(&webview, now)? else {
        let _g = lock()?;
        let eng = Engine { vault: &OflaynVault, root: &root };
        // Logged out (or cookie gone): nothing of the previous scope may remain.
        if eng.load()?.is_some() {
            eng.wipe_all()?;
        }
        return Ok(Holat::off("OFLAYN_SESSION_REQUIRED"));
    };
    let verify = server_sessiya(&cookie.value, cookie.actor).await;
    let _g = lock()?;
    Engine { vault: &OflaynVault, root: &root }.holat(cookie.actor, verify, maxfiy::now()?)
}
#[tauri::command]
pub async fn oflayn_kesh_yoz<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    kalit: String,
    qiymat: String,
) -> NativeResult<()> {
    scoped(&app, &webview, |e, r, now| e.cache_put(r, &kalit, &qiymat, now))
}
#[tauri::command]
pub async fn oflayn_kesh_oqi<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    kalit: String,
) -> NativeResult<Option<KeshYozuv>> {
    scoped(&app, &webview, |e, r, now| e.cache_get(r, &kalit, now))
}
/// `kalit` given: delete that one entry. Omitted: full wipe (cache + queue + key) — used on logout.
#[tauri::command]
pub async fn oflayn_kesh_tozala<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    kalit: Option<String>,
) -> NativeResult<()> {
    match kalit {
        Some(k) => scoped(&app, &webview, |e, r, _| e.cache_del(r, &k)),
        None => {
            caller(&webview)?;
            let root = root(&app)?;
            let _g = lock()?;
            Engine { vault: &OflaynVault, root: &root }.wipe_all()
        }
    }
}
#[tauri::command]
pub async fn oflayn_navbat_qosh<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    id: String,
    qiymat: String,
) -> NativeResult<()> {
    scoped(&app, &webview, |e, r, now| e.queue_put(r, &id, &qiymat, now))
}
#[tauri::command]
pub async fn oflayn_navbat_royxat<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
) -> NativeResult<Vec<NavbatYozuv>> {
    scoped(&app, &webview, |e, r, _| e.queue_list(r))
}
#[tauri::command]
pub async fn oflayn_navbat_ochir<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    id: String,
) -> NativeResult<()> {
    scoped(&app, &webview, |e, r, _| e.queue_del(r, &id))
}

// ---- static shell marker (no user data; lets the startup loader open the site offline) -----------------------------
#[derive(Serialize, Deserialize)]
struct Marker {
    versiya: String,
    vaqt_ms: u64,
}
pub(crate) fn marker_write(root: &Path, versiya: &str, now: u64) -> NativeResult<()> {
    if versiya.is_empty() || versiya.len() > 64 || !versiya.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b)) {
        return Err("OFLAYN_VERSION_INVALID");
    }
    let raw = serde_json::to_vec(&Marker { versiya: versiya.into(), vaqt_ms: now }).map_err(|_| "OFLAYN_ENCODE")?;
    fs::write(root.join(MARKER), raw).map_err(|_| "OFLAYN_IO")
}
pub(crate) fn marker_exists(root: &Path) -> bool {
    fs::read(root.join(MARKER))
        .ok()
        .and_then(|b| serde_json::from_slice::<Marker>(&b).ok())
        .is_some()
}
/// Remote site: «the service worker has precached the app shell» (called once per build).
#[tauri::command]
pub async fn oflayn_qobiq_tayyor<R: Runtime>(
    webview: Webview<R>,
    app: AppHandle<R>,
    versiya: String,
) -> NativeResult<()> {
    caller(&webview)?;
    marker_write(&root(&app)?, &versiya, maxfiy::now()?)
}
/// Local startup loader: is there an offline shell to open? (No user data is exposed: a boolean.)
#[tauri::command]
pub async fn oflayn_qobiq_bor<R: Runtime>(webview: Webview<R>, app: AppHandle<R>) -> NativeResult<bool> {
    let url = webview.url().map_err(|_| "OFLAYN_CALLER_DENIED")?;
    maxfiy::caller_tekshir(webview.window().label(), webview.label(), &url)?;
    Ok(marker_exists(&root(&app)?))
}

#[cfg(test)]
#[path = "oflayn_tests.rs"]
mod tests;
