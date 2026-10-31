//! Faqat shu ilovaning sessiya tokeni. Ixtiyoriy Credential Manager kaliti ochilmaydi.
use std::sync::Mutex;

static QULF: Mutex<()> = Mutex::new(());
const SERVICE: &str = "uz.anncorp.smeta";
const ACCOUNT: &str = "desktop-session-v1";

fn entry() -> Result<keyring::Entry, &'static str> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "DESKTOP_CREDENTIAL_UNAVAILABLE")
}

fn token_tekshir(token: &str) -> Result<(), &'static str> {
    if token.is_empty() || token.len() > 2400 || token.bytes().any(|b| b.is_ascii_control()) {
        return Err("DESKTOP_TOKEN_INVALID");
    }
    Ok(())
}

#[tauri::command]
pub fn sessiya_token_saqla(token: String) -> Result<(), &'static str> {
    token_tekshir(&token)?;
    let _guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    entry()?
        .set_password(&token)
        .map_err(|_| "DESKTOP_CREDENTIAL_WRITE_FAILED")
}

#[tauri::command]
pub fn sessiya_token_ol() -> Result<Option<String>, &'static str> {
    let _guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    match entry()?.get_password() {
        Ok(token) => {
            token_tekshir(&token)?;
            Ok(Some(token))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("DESKTOP_CREDENTIAL_READ_FAILED"),
    }
}

#[tauri::command]
pub fn sessiya_token_ochir() -> Result<(), &'static str> {
    let _guard = QULF.lock().map_err(|_| "DESKTOP_CREDENTIAL_BUSY")?;
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("DESKTOP_CREDENTIAL_DELETE_FAILED"),
    }
}

#[cfg(test)]
mod tests {
    use super::token_tekshir;
    #[test]
    fn token_chegarasi() {
        assert!(token_tekshir("SYNTHETIC.test.token").is_ok());
        assert!(token_tekshir("").is_err());
        assert!(token_tekshir("test\r\nforged").is_err());
        assert!(token_tekshir(&"a".repeat(2401)).is_err());
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn windows_credential_roundtrip() {
        // Alohida test service/account: haqiqiy sessiya credentialiga tegmaydi.
        let account = format!(
            "smoke-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        struct Cleanup(keyring::Entry);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = self.0.delete_credential();
            }
        }
        let fixture = Cleanup(keyring::Entry::new("uz.anncorp.smeta.test", &account).unwrap());
        fixture.0.set_password("SYNTHETIC_LOCAL_TEST").unwrap();
        assert_eq!(fixture.0.get_password().unwrap(), "SYNTHETIC_LOCAL_TEST");
        fixture.0.delete_credential().unwrap();
        assert!(matches!(
            fixture.0.get_password(),
            Err(keyring::Error::NoEntry)
        ));
    }
}
