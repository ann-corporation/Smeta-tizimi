use super::*;
use crate::maxfiy::tests::MemoryVault;
use std::sync::atomic::{AtomicU32, Ordering};

static N: AtomicU32 = AtomicU32::new(0);
struct Tmp(PathBuf);
impl Tmp {
    fn new() -> Tmp {
        let p = std::env::temp_dir().join(format!(
            "smeta-oflayn-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&p).unwrap();
        Tmp(p)
    }
}
impl Drop for Tmp {
    fn drop(&mut self) {
        // The test created this unique synthetic directory only.
        let _ = fs::remove_dir_all(&self.0);
    }
}
const NOW: u64 = 1_800_000_000_000;
fn name(c: char) -> String {
    format!("r_{}", c.to_string().repeat(64))
}
fn qid(ms: u64, tail: char) -> String {
    format!("{ms:013}-{}", tail.to_string().repeat(16))
}
fn bound(v: &MemoryVault, t: &Tmp, actor: u64, companies: Vec<u64>) -> Record {
    let e = Engine { vault: v, root: &t.0 };
    e.holat(actor, Verify::Confirmed(companies), NOW).unwrap();
    e.open(Some(actor), NOW).unwrap()
}
fn cookie(actor: u64, exp: u64) -> String {
    let body = STANDARD.encode(format!(
        "{{\"rol\":\"pto\",\"exp\":{exp},\"foydalanuvchi_id\":{actor},\"jti\":\"x\"}}"
    ));
    format!("{}.{}", body.trim_end_matches('='), "ab12cd34")
}

#[test]
fn names_are_a_closed_grammar_not_paths() {
    assert!(cache_name_ok(&name('a')));
    for bad in [
        "".to_string(),
        "r_".into(),
        format!("R_{}", "a".repeat(64)),
        format!("r_{}", "A".repeat(64)),
        format!("r_{}", "a".repeat(63)),
        format!("r_{}/..", "a".repeat(61)),
        format!("q_{}", "a".repeat(64)),
        "../r_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
        format!("r_{}\\x", "a".repeat(62)),
    ] {
        assert!(!cache_name_ok(&bad), "{bad}");
    }
    assert!(queue_id_ok(&qid(1_800_000_000_000, 'b')));
    for bad in ["", "1-2", "abc", "180000000000-aaaaaaaaaaaaaaaa", "1800000000000-aaaa", "1800000000000-AAAAAAAAAAAAAAAA", "1800000000000-../aaaaaaaaaaaa", "1800000000000/aaaaaaaaaaaaaaaa"] {
        assert!(!queue_id_ok(bad), "{bad}");
    }
}

#[test]
fn cookie_identity_is_parsed_and_malformed_or_expired_rejected() {
    let ok = parse_session_cookie(&cookie(7, NOW + 1000), NOW).unwrap();
    assert_eq!(ok.actor, 7);
    assert!(parse_session_cookie(&cookie(7, NOW - 1), NOW).is_none());
    assert!(parse_session_cookie(&cookie(0, NOW + 1000), NOW).is_none());
    for bad in ["", "abc", "a.b.c", ".x", "x.", "a b.c", "ey\r\nSet-Cookie: x.y", "e30.sig"] {
        assert!(parse_session_cookie(bad, NOW).is_none(), "{bad}");
    }
}

#[test]
fn sessiya_confirmation_requires_same_actor_and_is_sorted() {
    let body = br#"{"ok":true,"foydalanuvchi_id":7,"kompaniyalar":[{"kompaniya_id":9,"rol":"pto"},{"kompaniya_id":3,"rol":"x"},{"kompaniya_id":9,"rol":"y"}]}"#;
    assert_eq!(confirm_sessiya(body, 7), Some(vec![3, 9]));
    assert_eq!(confirm_sessiya(body, 8), None);
    assert_eq!(confirm_sessiya(br#"{"ok":false,"foydalanuvchi_id":7}"#, 7), None);
    assert_eq!(confirm_sessiya(b"not json", 7), None);
    assert_eq!(confirm_sessiya(&vec![b' '; SESSION_BODY_LIMIT + 1], 7), None);
}

#[test]
fn gate_matrix() {
    let v = MemoryVault::default();
    let t = Tmp::new();
    let rec = bound(&v, &t, 5, vec![1]);
    assert_eq!(gate(Some(&rec), Some(5), NOW + 1), Gate::Open);
    assert_eq!(gate(Some(&rec), Some(6), NOW + 1), Gate::Wipe("OFLAYN_ACTOR_CHANGED"));
    assert_eq!(gate(Some(&rec), None, NOW + 1), Gate::Wipe("OFLAYN_SESSION_REQUIRED"));
    assert_eq!(gate(None, None, NOW), Gate::Deny("OFLAYN_SESSION_REQUIRED"));
    assert_eq!(gate(None, Some(5), NOW), Gate::Deny("OFLAYN_NOT_BOUND"));
    assert_eq!(gate(Some(&rec), Some(5), NOW + TTL_MS), Gate::Open);
    assert_eq!(gate(Some(&rec), Some(5), NOW + TTL_MS + 1), Gate::Deny("OFLAYN_LEASE_EXPIRED"));
}

#[test]
fn cache_roundtrip_is_encrypted_at_rest() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    let secret = "SYNTHETIC-AMOUNT-123456789";
    e.cache_put(&rec, &name('a'), secret, NOW).unwrap();
    let got = e.cache_get(&rec, &name('a'), NOW + 10).unwrap().unwrap();
    assert_eq!(got.qiymat, secret);
    assert_eq!(got.vaqt_ms, NOW);
    assert!(e.cache_get(&rec, &name('b'), NOW).unwrap().is_none());
    let dir = t.0.join(BASE).join(&rec.cache_id);
    for f in fs::read_dir(dir).unwrap() {
        let bytes = fs::read(f.unwrap().path()).unwrap();
        assert!(!bytes.windows(secret.len()).any(|w| w == secret.as_bytes()));
    }
}

#[test]
fn cache_entries_expire_after_72_hours_and_are_deleted() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    e.cache_put(&rec, &name('a'), "x", NOW).unwrap();
    assert!(e.cache_get(&rec, &name('a'), NOW + TTL_MS).unwrap().is_some());
    assert!(e.cache_get(&rec, &name('a'), NOW + TTL_MS + 1).unwrap().is_none());
    assert!(!t.0.join(BASE).join(&rec.cache_id).join(format!("{}.bin", name('a'))).exists());
}

#[test]
fn size_limits_and_bad_names_are_refused() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    assert_eq!(e.cache_put(&rec, &name('a'), &"x".repeat(MAX_ENTRY + 1), NOW), Err("OFLAYN_TOO_LARGE"));
    assert_eq!(e.cache_put(&rec, "r_short", "x", NOW), Err("OFLAYN_KEY_DENIED"));
    assert_eq!(e.cache_put(&rec, &format!("q_{}", "a".repeat(64)), "x", NOW), Err("OFLAYN_KEY_DENIED"));
    assert_eq!(e.queue_put(&rec, &qid(1, 'a'), &"x".repeat(MAX_QUEUE_ITEM + 1), NOW), Err("OFLAYN_TOO_LARGE"));
    assert_eq!(e.queue_put(&rec, "../x", "x", NOW), Err("OFLAYN_KEY_DENIED"));
}

#[test]
fn cross_actor_reads_fail_and_old_scope_is_erased() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec_a = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    e.cache_put(&rec_a, &name('a'), "ACTOR-A-DATA", NOW).unwrap();
    e.queue_put(&rec_a, &qid(1, 'a'), "ACTOR-A-QUEUE", NOW).unwrap();
    let old_dir = t.0.join(BASE).join(&rec_a.cache_id);
    // Another person signs in on the same device: the cookie says actor 6 -> the gate wipes before any read.
    assert_eq!(e.open(Some(6), NOW), Err("OFLAYN_ACTOR_CHANGED"));
    assert!(!old_dir.exists());
    assert!(v.read().unwrap().is_none());
    // Even if the ciphertext file survived, actor B's record (new key, new cache id, new AAD) cannot read it.
    let rec_b = bound(&v, &t, 6, vec![1]);
    assert_ne!(rec_a.cache_id, rec_b.cache_id);
    assert!(e.cache_get(&rec_b, &name('a'), NOW).unwrap().is_none());
    assert!(e.queue_list(&rec_b).unwrap().is_empty());
    // Forced cross read: copy A's ciphertext into B's directory under the same name -> authentication fails.
    fs::create_dir_all(&old_dir).unwrap();
    let sealed = seal_raw(&rec_a.key, &aad(&rec_a, &name('a')), b"{\"t\":1,\"v\":\"ACTOR-A-DATA\"}", 1000).unwrap();
    let new_dir = t.0.join(BASE).join(&rec_b.cache_id);
    fs::write(new_dir.join(format!("{}.bin", name('a'))), sealed).unwrap();
    assert!(e.cache_get(&rec_b, &name('a'), NOW).is_err());
    // Same actor but different key generation is also unreadable.
    let mut forged = rec_b.clone();
    forged.actor = 5;
    assert!(e.cache_get(&forged, &name('a'), NOW).is_err());
}

#[test]
fn membership_change_logout_and_invalid_session_erase_the_scope() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    e.cache_put(&rec, &name('a'), "x", NOW).unwrap();
    // Same actor, same companies: kept, lease refreshed.
    let h = e.holat(5, Verify::Confirmed(vec![1]), NOW + 1000).unwrap();
    assert_eq!(h.tekshirilgan_ms, Some(NOW + 1000));
    let rec2 = e.open(Some(5), NOW + 1000).unwrap();
    assert_eq!(rec2.cache_id, rec.cache_id);
    assert!(e.cache_get(&rec2, &name('a'), NOW + 1000).unwrap().is_some());
    // Membership changed: wiped, new generation.
    e.holat(5, Verify::Confirmed(vec![1, 2]), NOW + 2000).unwrap();
    let rec3 = e.open(Some(5), NOW + 2000).unwrap();
    assert_ne!(rec3.cache_id, rec.cache_id);
    assert!(e.cache_get(&rec3, &name('a'), NOW + 2000).unwrap().is_none());
    // Server says the session is invalid: everything is gone.
    e.cache_put(&rec3, &name('a'), "x", NOW).unwrap();
    assert!(!e.holat(5, Verify::Invalid, NOW + 3000).unwrap().tayyor);
    assert!(v.read().unwrap().is_none());
    assert!(!t.0.join(BASE).join(&rec3.cache_id).exists());
    // Explicit logout wipe.
    let rec4 = bound(&v, &t, 5, vec![1]);
    e.queue_put(&rec4, &qid(1, 'a'), "q", NOW).unwrap();
    e.wipe_all().unwrap();
    assert_eq!(e.open(Some(5), NOW), Err("OFLAYN_NOT_BOUND"));
}

#[test]
fn offline_holat_uses_last_confirmation_only_within_72_hours() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let _ = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    let h = e.holat(5, Verify::Unreachable, NOW + 1000).unwrap();
    assert!(h.tayyor && !h.onlayn);
    assert_eq!(h.foydalanuvchi_id, Some(5));
    let late = e.holat(5, Verify::Unreachable, NOW + TTL_MS + 1).unwrap();
    assert!(!late.tayyor);
    assert_eq!(late.sabab, Some("OFLAYN_LEASE_EXPIRED"));
    // A different actor offline never inherits the stored scope.
    let other = e.holat(6, Verify::Unreachable, NOW + 1000).unwrap();
    assert!(!other.tayyor);
    assert!(v.read().unwrap().is_none());
}

#[test]
fn queue_orders_chronologically_upserts_and_has_a_cap() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    let rec = bound(&v, &t, 5, vec![1]);
    let e = Engine { vault: &v, root: &t.0 };
    e.queue_put(&rec, &qid(1_800_000_000_300, 'c'), "third", NOW).unwrap();
    e.queue_put(&rec, &qid(1_800_000_000_100, 'a'), "first", NOW).unwrap();
    e.queue_put(&rec, &qid(1_800_000_000_200, 'b'), "second", NOW).unwrap();
    let l = e.queue_list(&rec).unwrap();
    assert_eq!(l.iter().map(|q| q.qiymat.as_str()).collect::<Vec<_>>(), ["first", "second", "third"]);
    e.queue_put(&rec, &qid(1_800_000_000_200, 'b'), "second-v2", NOW).unwrap();
    assert_eq!(e.queue_list(&rec).unwrap().len(), 3);
    e.queue_del(&rec, &qid(1_800_000_000_100, 'a')).unwrap();
    assert_eq!(e.queue_list(&rec).unwrap()[0].qiymat, "second-v2");
    for i in 0..MAX_QUEUE as u64 - 2 {
        e.queue_put(&rec, &qid(1_800_000_001_000 + i, 'd'), "x", NOW).unwrap();
    }
    assert_eq!(e.queue_put(&rec, &qid(1_800_000_009_000, 'e'), "x", NOW), Err("OFLAYN_QUEUE_FULL"));
    // Queue items never expire by the 72 h cache rule.
    assert!(!e.queue_list(&rec).unwrap().is_empty());
}

#[test]
fn corrupt_or_foreign_record_is_erased_not_trusted() {
    let (v, t) = (MemoryVault::default(), Tmp::new());
    v.write("{\"version\":3,\"token\":\"legacy\"}").unwrap();
    let e = Engine { vault: &v, root: &t.0 };
    assert_eq!(e.open(Some(5), NOW), Err("OFLAYN_NOT_BOUND"));
    assert!(v.read().unwrap().is_none());
}

#[test]
fn only_main_webview_on_the_live_site_may_call() {
    let ok = Url::parse("https://smeta-tizimi.pages.dev/obyekt/1?x=2").unwrap();
    assert!(caller_ok("main", "main", &ok).is_ok());
    assert!(caller_ok("other", "main", &ok).is_err());
    assert!(caller_ok("main", "child", &ok).is_err());
    for u in [
        "http://smeta-tizimi.pages.dev/",
        "https://smeta-tizimi.pages.dev.evil.example/",
        "https://evil.smeta-tizimi.pages.dev/",
        "https://user@smeta-tizimi.pages.dev/",
        "https://smeta-tizimi.pages.dev:8443/",
        "http://tauri.localhost/",
        "tauri://localhost/",
        "https://accounts.google.com/",
    ] {
        assert!(caller_ok("main", "main", &Url::parse(u).unwrap()).is_err(), "{u}");
    }
}

#[test]
fn shell_marker_roundtrip_and_version_validation() {
    let t = Tmp::new();
    assert!(!marker_exists(&t.0));
    assert!(marker_write(&t.0, "../evil", NOW).is_err());
    marker_write(&t.0, "abc123-v1", NOW).unwrap();
    assert!(marker_exists(&t.0));
}

// ---- ACL: what the remote origin can and cannot call ---------------------------------------------------------------
const REMOTE_COMMANDS: [&str; 8] = [
    "oflayn_holat",
    "oflayn_kesh_yoz",
    "oflayn_kesh_oqi",
    "oflayn_kesh_tozala",
    "oflayn_navbat_qosh",
    "oflayn_navbat_royxat",
    "oflayn_navbat_ochir",
    "oflayn_qobiq_tayyor",
];
#[test]
fn capability_files_scope_remote_to_the_site_and_the_narrow_permission() {
    let remote: serde_json::Value = serde_json::from_str(include_str!("../capabilities/remote.json")).unwrap();
    assert_eq!(remote["local"], false);
    assert_eq!(remote["remote"]["urls"], serde_json::json!(["https://smeta-tizimi.pages.dev"]));
    assert_eq!(remote["permissions"], serde_json::json!(["oflayn-remote"]));
    assert_eq!(remote["windows"], serde_json::json!(["main"]));
    assert_eq!(remote["webviews"], serde_json::json!(["main"]));
    let local = include_str!("../capabilities/default.json");
    assert!(local.contains("\"local\": true") && !local.contains("remote") && !local.contains('*'));
    // The permission lists exactly the narrow command set.
    let toml = include_str!("../permissions/session.toml");
    let section = toml.split("identifier = \"oflayn-remote\"").nth(1).unwrap().split("[[permission]]").next().unwrap();
    let line = section.lines().find(|l| l.starts_with("commands.allow")).unwrap();
    let listed: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
    assert_eq!(listed, REMOTE_COMMANDS);
    // Nothing else is wired to the remote capability: no plugin / core / opener / fs / shell permission ids anywhere in it.
    let raw = include_str!("../capabilities/remote.json");
    for banned in ["core:", "opener", "fs:", "shell", "http:", "dialog", "process", "updater", "session-local", "desktop_"] {
        assert!(!raw.contains(banned), "{banned}");
    }
}
