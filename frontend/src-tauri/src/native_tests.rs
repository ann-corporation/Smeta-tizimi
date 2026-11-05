use super::*;
use std::cell::RefCell;
#[derive(Default)]
pub struct MemoryVault(pub RefCell<Option<String>>);
impl Vault for MemoryVault {
    fn read(&self) -> NativeResult<Option<String>> {
        Ok(self.0.borrow().clone())
    }
    fn write(&self, v: &str) -> NativeResult<()> {
        *self.0.borrow_mut() = Some(v.into());
        Ok(())
    }
    fn delete(&self) -> NativeResult<()> {
        *self.0.borrow_mut() = None;
        Ok(())
    }
}
pub fn credential(now: u64) -> Credential {
    let (key, cache_id) = fresh_key().unwrap();
    Credential {
        version: 3,
        token: "SYNTHETIC.test.token".into(),
        actor: 1,
        device: "11111111-1111-4111-8111-111111111111".into(),
        expires: now + 1000,
        key,
        cache_id,
    }
}
#[test]
fn logout_and_refresh_reject_delayed_write_tickets() {
    let v = MemoryVault::default();
    let mut s = SessiyaBusena::new();
    s.revoke(&v).unwrap();
    assert!(s.closed);
    assert!(s.ticket(0).is_err());
    s.persist(&v, &credential(100), 1, 100).unwrap();
    assert!(s.ticket(1).is_err());
    s.revoke(&v).unwrap();
    assert!(s.persist(&v, &credential(100), 2, 100).is_err());
    assert!(v.read().unwrap().is_none());
}
#[test]
fn token_chegarasi() {
    assert!(token_tekshir("SYNTHETIC.test.token").is_ok());
    for token in [
        "".to_string(),
        "test\r\nforged".into(),
        "a".repeat(2401),
        "a b".into(),
    ] {
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
    let v = MemoryVault::default();
    let mut s = SessiyaBusena::new();
    s.persist(&v, &credential(100), 0, 100).unwrap();
    let mono = Instant::now();
    assert!(s.load(&v, 100, mono).unwrap().is_some());
    assert!(s
        .load(&v, 100, mono + Duration::from_secs(2))
        .unwrap()
        .is_none());
    assert!(v.read().unwrap().is_none());
    for raw in ["SYNTHETIC_LEGACY", "v2:999\nSYNTHETIC", "{}"] {
        let mut s = SessiyaBusena::new();
        v.write(raw).unwrap();
        assert!(s.load(&v, 100, Instant::now()).unwrap().is_none());
    }
    let mut s = SessiyaBusena::new();
    v.write(&serde_json::to_string(&credential(100)).unwrap())
        .unwrap();
    assert!(s.load(&v, 1100, Instant::now()).unwrap().is_none());
}
#[test]
fn command_manifest_and_local_capability_are_explicit() {
    let _ = crate::builder;
    let build = include_str!("../build.rs");
    let permission = include_str!("../permissions/session.toml");
    let lib = include_str!("lib.rs");
    let capability = include_str!("../capabilities/default.json");
    assert!(build.contains("AppManifest::new().commands"));
    for command in [
        "desktop_request",
        "desktop_session_info",
        "desktop_session_clear",
        "desktop_cache_read",
        "desktop_cache_write",
        "desktop_cache_delete",
        "desktop_cache_keys",
    ] {
        assert!(build.contains(command));
        assert!(permission.contains(command));
        assert!(lib.contains(command));
    }
    for old in ["sessiya_token_ol", "sessiya_token_saqla"] {
        assert!(!lib.contains(old));
        assert!(!permission.contains(old));
    }
    assert!(capability.contains("\"local\": true"));
    assert!(capability.contains("\"webviews\": [\"main\"]"));
    assert!(capability.contains("session-local"));
    assert!(!capability.contains("remote"));
    assert!(!capability.contains('*'));
}

#[test]
fn credential_write_failure_keeps_state_closed() {
    struct FailingVault;
    impl Vault for FailingVault {
        fn read(&self) -> NativeResult<Option<String>> {
            Ok(None)
        }
        fn write(&self, _: &str) -> NativeResult<()> {
            Err("SYNTHETIC_WRITE_FAILURE")
        }
        fn delete(&self) -> NativeResult<()> {
            Ok(())
        }
    }
    let mut s = SessiyaBusena::new();
    assert!(s.persist(&FailingVault, &credential(100), 0, 100).is_err());
    assert!(s.closed);
    assert_eq!(s.generation, 1);
    assert!(s.ticket(0).is_err());
}
#[test]
fn session_info_projection_has_no_secrets_and_uses_parent_field_names() {
    let info = SessionInfo {
        device_id: Some("SYNTHETIC-DEVICE".into()),
        foydalanuvchi_id: Some(1),
        generation: 4,
    };
    let v = serde_json::to_value(info).unwrap();
    assert_eq!(v.as_object().unwrap().len(), 3);
    assert_eq!(v["device_id"], "SYNTHETIC-DEVICE");
    assert_eq!(v["foydalanuvchi_id"], 1);
    assert_eq!(v["generation"], 4);
}
#[cfg(target_os = "windows")]
#[test]
fn windows_keychain_survives_handle_recreation_with_synthetic_isolated_account() {
    // Different service and random account: never reads or changes the application session.
    let c = credential(100);
    let account = format!("test-{}", c.cache_id);
    let first = keyring::Entry::new("uz.anncorp.smeta.native-tests", &account).unwrap();
    struct Cleanup<'a>(&'a keyring::Entry);
    impl Drop for Cleanup<'_> {
        fn drop(&mut self) {
            let _ = self.0.delete_credential();
        }
    }
    let _cleanup = Cleanup(&first);
    let raw = zeroize::Zeroizing::new(serde_json::to_string(&c).unwrap());
    first.set_password(&raw).unwrap();
    let second = keyring::Entry::new("uz.anncorp.smeta.native-tests", &account).unwrap();
    let restored = zeroize::Zeroizing::new(second.get_password().unwrap());
    let restored: Credential = serde_json::from_str(&restored).unwrap();
    assert_eq!(restored.key, c.key);
    assert_eq!(restored.device, c.device);
    second.delete_credential().unwrap();
    assert!(matches!(first.get_password(), Err(keyring::Error::NoEntry)));
}
