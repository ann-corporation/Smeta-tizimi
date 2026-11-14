//! Android Keystore secret slot. One AES-256-GCM key lives in the AndroidKeyStore (non-exportable,
//! StrongBox when present); the single credential blob is stored encrypted in app-private no-backup storage.
//! Deliberately NOT registered with invoke_handler and without any permission: JS cannot reach it.
//! On non-Android targets every call fails closed.
use tauri::{plugin::Builder, plugin::TauriPlugin, Wry};

pub type KeystoreResult<T> = Result<T, &'static str>;

#[cfg(target_os = "android")]
static HANDLE: std::sync::OnceLock<tauri::plugin::PluginHandle<Wry>> = std::sync::OnceLock::new();

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("smeta-keystore")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin("uz.anncorp.smeta.keystore", "KeystorePlugin")?;
                let _ = HANDLE.set(handle);
            }
            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
mod imp {
    use super::{KeystoreResult, HANDLE};
    use serde::{Deserialize, Serialize};
    #[derive(Serialize)]
    struct Put<'a> {
        value: &'a str,
    }
    #[derive(Deserialize)]
    struct Got {
        value: Option<String>,
    }
    fn handle() -> KeystoreResult<&'static tauri::plugin::PluginHandle<tauri::Wry>> {
        HANDLE.get().ok_or("DESKTOP_CREDENTIAL_UNAVAILABLE")
    }
    pub fn get() -> KeystoreResult<Option<String>> {
        handle()?
            .run_mobile_plugin::<Got>("get", ())
            .map(|g| g.value)
            .map_err(|_| "DESKTOP_CREDENTIAL_READ_FAILED")
    }
    pub fn set(value: &str) -> KeystoreResult<()> {
        handle()?
            .run_mobile_plugin::<serde_json::Value>("set", Put { value })
            .map(|_| ())
            .map_err(|_| "DESKTOP_CREDENTIAL_WRITE_FAILED")
    }
    pub fn delete() -> KeystoreResult<()> {
        handle()?
            .run_mobile_plugin::<serde_json::Value>("delete", ())
            .map(|_| ())
            .map_err(|_| "DESKTOP_CREDENTIAL_DELETE_FAILED")
    }
}

#[cfg(not(target_os = "android"))]
mod imp {
    use super::KeystoreResult;
    pub fn get() -> KeystoreResult<Option<String>> {
        Err("DESKTOP_CREDENTIAL_UNAVAILABLE")
    }
    pub fn set(_: &str) -> KeystoreResult<()> {
        Err("DESKTOP_CREDENTIAL_UNAVAILABLE")
    }
    pub fn delete() -> KeystoreResult<()> {
        Err("DESKTOP_CREDENTIAL_UNAVAILABLE")
    }
}

pub use imp::{delete, get, set};
