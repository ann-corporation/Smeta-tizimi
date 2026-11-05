//! Ciphertext files only. Object/lease authorization is the parent's verified lease guard.
//! Native actor/device scope always comes from the server-validated keychain record.
use crate::maxfiy::{self, Credential, NativeResult, OsVault};
use aes_gcm::{
    aead::{rand_core::RngCore, Aead, OsRng, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Instant,
};
use tauri::Manager;
use zeroize::Zeroizing;
const LIMIT: usize = 32 * 1024 * 1024;
fn cache_key(key: &str) -> NativeResult<String> {
    let p: Vec<_> = key.split('/').collect();
    if !matches!(p.as_slice(),["packet",c,o] if maxfiy::positive(c) && maxfiy::positive(o))
        && !matches!(p.as_slice(),["pages",c,o] if maxfiy::positive(c) && maxfiy::positive(o))
        && !matches!(p.as_slice(),["denied",c,o] if maxfiy::positive(c) && maxfiy::positive(o))
        && !matches!(p.as_slice(),["bootstrap",a] if maxfiy::positive(a))
        && !matches!(p.as_slice(),["lease",c] if maxfiy::positive(c))
    {
        return Err("DESKTOP_CACHE_KEY_DENIED");
    }
    Ok(format!("{}.bin", p.join("_")))
}
fn aad(c: &Credential, key: &str) -> Vec<u8> {
    format!("v1|{}|{}|{}|{key}", c.actor, c.device, c.cache_id).into_bytes()
}
fn cipher(c: &Credential) -> NativeResult<Aes256Gcm> {
    let key = Zeroizing::new(
        STANDARD
            .decode(&c.key)
            .map_err(|_| "DESKTOP_CACHE_KEY_INVALID")?,
    );
    Aes256Gcm::new_from_slice(&key).map_err(|_| "DESKTOP_CACHE_KEY_INVALID")
}
fn seal(c: &Credential, key: &str, value: &[u8]) -> NativeResult<Vec<u8>> {
    cache_key(key)?;
    if value.len() > LIMIT {
        return Err("DESKTOP_CACHE_TOO_LARGE");
    }
    let mut nonce = [0u8; 12];
    OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|_| "DESKTOP_RANDOM_FAILED")?;
    let encrypted = cipher(c)?
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: value,
                aad: &aad(c, key),
            },
        )
        .map_err(|_| "DESKTOP_CACHE_ENCRYPT_FAILED")?;
    let mut out = b"SC01".to_vec();
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&encrypted);
    Ok(out)
}
fn unseal(c: &Credential, key: &str, bytes: &[u8]) -> NativeResult<Vec<u8>> {
    cache_key(key)?;
    if bytes.len() < 32 || bytes.len() > LIMIT + 32 || &bytes[..4] != b"SC01" {
        return Err("DESKTOP_CACHE_INVALID");
    }
    cipher(c)?
        .decrypt(
            Nonce::from_slice(&bytes[4..16]),
            Payload {
                msg: &bytes[16..],
                aad: &aad(c, key),
            },
        )
        .map_err(|_| "DESKTOP_CACHE_AUTH_FAILED")
}
fn directory(root: &Path, c: &Credential) -> NativeResult<PathBuf> {
    // Check each owned directory component. Caller cannot choose any disk path.
    let mut path = root.to_path_buf();
    for part in ["native-cache-v1", &c.cache_id] {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(m) if m.file_type().is_symlink() || !m.is_dir() => {
                return Err("DESKTOP_CACHE_PATH_DENIED")
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&path).map_err(|_| "DESKTOP_CACHE_IO")?
            }
            Err(_) => return Err("DESKTOP_CACHE_IO"),
        }
    }
    Ok(path)
}
fn no_link(path: &Path) -> NativeResult<()> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() || !m.is_file() => Err("DESKTOP_CACHE_PATH_DENIED"),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("DESKTOP_CACHE_IO"),
    }
}
fn read(root: &Path, c: &Credential, key: &str) -> NativeResult<Option<Vec<u8>>> {
    let file = directory(root, c)?.join(cache_key(key)?);
    no_link(&file)?;
    let f = match fs::File::open(file) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("DESKTOP_CACHE_IO"),
    };
    let mut bytes = Vec::new();
    f.take((LIMIT + 33) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "DESKTOP_CACHE_IO")?;
    unseal(c, key, &bytes).map(Some)
}
fn write(root: &Path, c: &Credential, key: &str, value: &[u8]) -> NativeResult<()> {
    let bytes = seal(c, key, value)?;
    let dir = directory(root, c)?;
    let file = dir.join(cache_key(key)?);
    no_link(&file)?;
    // Unique temp path, ciphertext only, same directory; never follow a pre-existing temp file.
    let (_, id) = maxfiy::fresh_key()?;
    let temp = dir.join(format!("{id}.tmp"));
    let result = (|| {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "DESKTOP_CACHE_IO")?;
        f.write_all(&bytes)
            .and_then(|_| f.sync_all())
            .map_err(|_| "DESKTOP_CACHE_IO")?;
        drop(f);
        // Windows rename does not replace an existing target. Any crash leaves a miss, not plaintext.
        match fs::remove_file(&file) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("DESKTOP_CACHE_IO"),
        }
        fs::rename(&temp, &file).map_err(|_| "DESKTOP_CACHE_IO")
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
fn root(app: &tauri::AppHandle) -> NativeResult<PathBuf> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "DESKTOP_CACHE_IO")?;
    fs::create_dir_all(&root).map_err(|_| "DESKTOP_CACHE_IO")?;
    Ok(root)
}
fn cache_id_valid(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
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
fn cleanup_retired_cache(app_data: &Path, id: &str) -> NativeResult<()> {
    if !cache_id_valid(id) || !app_data.is_absolute() {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    let app_data = fs::canonicalize(app_data).map_err(|_| "DESKTOP_CACHE_IO")?;
    let base = app_data.join("native-cache-v1");
    let base_meta = match fs::symlink_metadata(&base) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("DESKTOP_CACHE_IO"),
    };
    if reparse(&base_meta) || !base_meta.is_dir() {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    let base = fs::canonicalize(&base).map_err(|_| "DESKTOP_CACHE_IO")?;
    if base.parent() != Some(app_data.as_path()) {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    let dir = base.join(id);
    let meta = match fs::symlink_metadata(&dir) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("DESKTOP_CACHE_IO"),
    };
    if reparse(&meta) || !meta.is_dir() {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    if fs::canonicalize(&dir).map_err(|_| "DESKTOP_CACHE_IO")? != dir {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    for item in fs::read_dir(&dir).map_err(|_| "DESKTOP_CACHE_IO")? {
        let item = item.map_err(|_| "DESKTOP_CACHE_IO")?;
        let name = item.file_name();
        let name = name.to_str().ok_or("DESKTOP_CACHE_PATH_DENIED")?;
        let meta = fs::symlink_metadata(item.path()).map_err(|_| "DESKTOP_CACHE_IO")?;
        if reparse(&meta)
            || !meta.is_file()
            || !(name
                .strip_suffix(".bin")
                .is_some_and(|n| cache_key(&n.replace('_', "/")).is_ok())
                || name.strip_suffix(".tmp").is_some_and(cache_id_valid))
        {
            return Err("DESKTOP_CACHE_PATH_DENIED");
        }
        fs::remove_file(item.path()).map_err(|_| "DESKTOP_CACHE_IO")?;
    }
    fs::remove_dir(dir).map_err(|_| "DESKTOP_CACHE_IO")
}
pub(crate) fn cleanup_retired_cache_for_app(app: &tauri::AppHandle, id: &str) -> NativeResult<()> {
    let app_data = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "DESKTOP_CACHE_IO")?;
    cleanup_retired_cache(&app_data, id)?;
    // Caller holds the generation mutex after key erasure: no live cache generation remains.
    let base = fs::canonicalize(&app_data)
        .map_err(|_| "DESKTOP_CACHE_IO")?
        .join("native-cache-v1");
    let meta = match fs::symlink_metadata(&base) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("DESKTOP_CACHE_IO"),
    };
    if reparse(&meta) || !meta.is_dir() {
        return Err("DESKTOP_CACHE_PATH_DENIED");
    }
    for entry in fs::read_dir(base).map_err(|_| "DESKTOP_CACHE_IO")? {
        let entry = entry.map_err(|_| "DESKTOP_CACHE_IO")?;
        if let Some(id) = entry.file_name().to_str().filter(|id| cache_id_valid(id)) {
            cleanup_retired_cache(&app_data, id)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn desktop_cache_read(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    key: String,
    expected_generation: Option<u64>,
) -> NativeResult<Option<Vec<u8>>> {
    maxfiy::runtime_tekshir(&webview)?;
    cache_key(&key)?;
    let mut s = maxfiy::state()?;
    if let Some(g) = expected_generation {
        s.ticket(g)?;
    }
    let c = s
        .load(&OsVault, maxfiy::now()?, Instant::now())?
        .ok_or("DESKTOP_SESSION_REQUIRED")?;
    let out = read(&root(&app)?, &c, &key)?;
    if s.load(&OsVault, maxfiy::now()?, Instant::now())?.is_none() {
        return Err("DESKTOP_SESSION_REQUIRED");
    }
    Ok(out)
}
#[tauri::command]
pub fn desktop_cache_write(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    key: String,
    value: Vec<u8>,
    expected_generation: Option<u64>,
) -> NativeResult<()> {
    maxfiy::runtime_tekshir(&webview)?;
    cache_key(&key)?;
    let mut s = maxfiy::state()?;
    if let Some(g) = expected_generation {
        s.ticket(g)?;
    }
    let c = s
        .load(&OsVault, maxfiy::now()?, Instant::now())?
        .ok_or("DESKTOP_SESSION_REQUIRED")?;
    write(&root(&app)?, &c, &key, &value)?;
    if s.load(&OsVault, maxfiy::now()?, Instant::now())?.is_none() {
        return Err("DESKTOP_SESSION_REQUIRED");
    }
    Ok(())
}
#[tauri::command]
pub fn desktop_cache_delete(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    key: String,
    expected_generation: Option<u64>,
) -> NativeResult<()> {
    maxfiy::runtime_tekshir(&webview)?;
    let filename = cache_key(&key)?;
    let mut s = maxfiy::state()?;
    if let Some(g) = expected_generation {
        s.ticket(g)?;
    }
    let c = s
        .load(&OsVault, maxfiy::now()?, Instant::now())?
        .ok_or("DESKTOP_SESSION_REQUIRED")?;
    let file = directory(&root(&app)?, &c)?.join(filename);
    no_link(&file)?;
    match fs::remove_file(file) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("DESKTOP_CACHE_IO"),
    }
}
#[tauri::command]
pub fn desktop_cache_keys(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    expected_generation: Option<u64>,
) -> NativeResult<Vec<String>> {
    maxfiy::runtime_tekshir(&webview)?;
    let mut s = maxfiy::state()?;
    if let Some(g) = expected_generation {
        s.ticket(g)?;
    }
    let c = s
        .load(&OsVault, maxfiy::now()?, Instant::now())?
        .ok_or("DESKTOP_SESSION_REQUIRED")?;
    let dir = directory(&root(&app)?, &c)?;
    let mut out = Vec::new();
    for item in fs::read_dir(dir).map_err(|_| "DESKTOP_CACHE_IO")? {
        if out.len() >= 10000 {
            return Err("DESKTOP_CACHE_TOO_MANY_KEYS");
        }
        let item = item.map_err(|_| "DESKTOP_CACHE_IO")?;
        let name = item.file_name();
        let Some(name) = name.to_str().and_then(|n| n.strip_suffix(".bin")) else {
            continue;
        };
        let key = name.replace('_', "/");
        if cache_key(&key).is_ok() {
            no_link(&item.path())?;
            out.push(key);
        }
    }
    out.sort();
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::maxfiy::{
        tests::{credential, MemoryVault},
        SessiyaBusena,
    };
    #[test]
    fn cache_keys_are_not_paths_or_authority() {
        for key in [
            "packet/1/2",
            "lease/1",
            "pages/1/2",
            "denied/1/2",
            "bootstrap/1",
        ] {
            assert!(cache_key(key).is_ok());
        }
        for key in [
            "packet/0/1",
            "packet/-1/1",
            "packet/01/1",
            "packet/1/2/3",
            "lease/1/2",
            "packet/1/../2",
            "packet/1/2\\x",
            "packet/9007199254740992/1",
            "lease/1%2f2",
            "pages/1/../2",
            "bootstrap/0",
            "denied/0/2",
            "denied/1/2/3",
            "bootstrap/1/2",
            "",
        ] {
            assert!(cache_key(key).is_err(), "{key}");
        }
    }
    #[test]
    fn retired_cache_cleanup_is_scoped_and_fails_closed() {
        let id = "0123456789abcdef0123456789abcdef";
        let root =
            std::env::temp_dir().join(format!("smeta-cleanup-test-{}-{id}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let base = root.join("native-cache-v1");
        let dir = base.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("packet_1_2.bin"), b"synthetic ciphertext").unwrap();
        let outside = root.join("outside.bin");
        fs::write(&outside, b"preserve").unwrap();
        cleanup_retired_cache(&root, id).unwrap();
        assert!(!dir.exists());
        assert_eq!(fs::read(&outside).unwrap(), b"preserve");

        fs::create_dir(&dir).unwrap();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&outside, dir.join("linked.bin")).is_ok();
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&outside, dir.join("linked.bin")).is_ok();
        if linked {
            assert_eq!(
                cleanup_retired_cache(&root, id),
                Err("DESKTOP_CACHE_PATH_DENIED")
            );
        }
        assert_eq!(fs::read(&outside).unwrap(), b"preserve");
        assert!(cleanup_retired_cache(&root, "../outside").is_err());
        // This test created the entire tree under its unique synthetic root.
        fs::remove_dir_all(&root).unwrap();
    }
    #[test]
    fn aes_authenticated_scope_nonce_tamper_and_rotation() {
        let c = credential(100);
        let data = b"SYNTHETIC-NON-PII";
        let a = seal(&c, "packet/1/2", data).unwrap();
        let b = seal(&c, "packet/1/2", data).unwrap();
        assert_ne!(a, b);
        assert!(!a.windows(data.len()).any(|w| w == data));
        assert_eq!(unseal(&c, "packet/1/2", &a).unwrap(), data);
        assert!(unseal(&c, "packet/2/2", &a).is_err());
        let mut other = c.clone();
        other.actor = 2;
        assert!(unseal(&other, "packet/1/2", &a).is_err());
        other = c.clone();
        other.device = "22222222-2222-4222-8222-222222222222".into();
        assert!(unseal(&other, "packet/1/2", &a).is_err());
        assert!(unseal(&credential(100), "packet/1/2", &a).is_err());
        let mut tampered = a.clone();
        tampered[20] ^= 1;
        assert!(unseal(&c, "packet/1/2", &tampered).is_err());
    }
    #[test]
    fn ciphertext_survives_restart_with_keychain_record_and_old_key_is_erased() {
        let v = MemoryVault::default();
        let c = credential(100);
        let mut s = SessiyaBusena::new();
        s.persist(&v, &c, 0, 100).unwrap();
        let root = std::env::temp_dir().join(format!("smeta-native-test-{}", c.cache_id));
        fs::create_dir(&root).unwrap();
        write(&root, &c, "packet/1/2", b"SYNTHETIC-NON-PII").unwrap();
        let mut restarted = SessiyaBusena::new();
        let restored = restarted.load(&v, 101, Instant::now()).unwrap().unwrap();
        assert_eq!(
            read(&root, &restored, "packet/1/2").unwrap().unwrap(),
            b"SYNTHETIC-NON-PII"
        );
        restarted.revoke(&v).unwrap();
        assert!(restarted.load(&v, 101, Instant::now()).unwrap().is_none());
        let rotated = credential(101);
        restarted.persist(&v, &rotated, 1, 101).unwrap();
        assert!(read(&root, &rotated, "packet/1/2").unwrap().is_none());
        // Test owns this freshly created synthetic directory only.
        fs::remove_dir_all(root).unwrap();
    }
}
