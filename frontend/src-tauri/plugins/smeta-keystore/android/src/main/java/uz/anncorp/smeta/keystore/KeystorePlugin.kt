package uz.anncorp.smeta.keystore

import android.app.Activity
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class PutArgs {
    var value: String = ""
}

/**
 * Single-slot secret vault. The credential JSON is sealed with an AndroidKeyStore AES-256-GCM key
 * (non-exportable, StrongBox where available). Ciphertext sits in noBackupFilesDir, so it is excluded
 * from cloud backup/device transfer. delete() destroys both the blob and the key (crypto-erasure).
 */
@TauriPlugin
class KeystorePlugin(private val activity: Activity) : Plugin(activity) {
    private val lock = Any()

    private fun blob() = File(activity.noBackupFilesDir, BLOB)

    private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

    private fun existingKey(): SecretKey? = keyStore().getKey(ALIAS, null) as? SecretKey

    private fun generate(strongBox: Boolean): SecretKey {
        val spec = KeyGenParameterSpec.Builder(
            ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .apply { if (strongBox && Build.VERSION.SDK_INT >= 28) setIsStrongBoxBacked(true) }
            .build()
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(spec)
        return generator.generateKey()
    }

    private fun createKey(): SecretKey =
        if (Build.VERSION.SDK_INT >= 28) {
            try { generate(true) } catch (e: ProviderException) { generate(false) }
        } else generate(false)

    private fun erase() {
        blob().delete()
        val ks = keyStore()
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
    }

    @Command
    fun get(invoke: Invoke) {
        synchronized(lock) {
            try {
                val file = blob()
                val key = existingKey()
                if (!file.isFile || key == null) {
                    invoke.resolve(JSObject())
                    return
                }
                val raw = file.readBytes()
                if (raw.size < IV_LEN + 16) { erase(); invoke.resolve(JSObject()); return }
                val cipher = Cipher.getInstance(TRANSFORM)
                cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, raw.copyOfRange(0, IV_LEN)))
                cipher.updateAAD(AAD)
                val plain = cipher.doFinal(raw, IV_LEN, raw.size - IV_LEN)
                invoke.resolve(JSObject().put("value", String(plain, Charsets.UTF_8)))
            } catch (e: Exception) {
                // Unreadable / invalidated key or tampered blob: fail closed by erasing, forcing a fresh login.
                try { erase() } catch (_: Exception) {}
                invoke.resolve(JSObject())
            }
        }
    }

    @Command
    fun set(invoke: Invoke) {
        val args = invoke.parseArgs(PutArgs::class.java)
        synchronized(lock) {
            try {
                val key = existingKey() ?: createKey()
                val cipher = Cipher.getInstance(TRANSFORM)
                cipher.init(Cipher.ENCRYPT_MODE, key)
                cipher.updateAAD(AAD)
                val sealed = cipher.iv + cipher.doFinal(args.value.toByteArray(Charsets.UTF_8))
                val tmp = File(activity.noBackupFilesDir, "$BLOB.tmp")
                tmp.writeBytes(sealed)
                if (!tmp.renameTo(blob())) { tmp.delete(); throw IllegalStateException("rename") }
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject("DESKTOP_CREDENTIAL_WRITE_FAILED")
            }
        }
    }

    @Command
    fun delete(invoke: Invoke) {
        synchronized(lock) {
            try { erase(); invoke.resolve() } catch (e: Exception) { invoke.reject("DESKTOP_CREDENTIAL_DELETE_FAILED") }
        }
    }

    private companion object {
        const val PROVIDER = "AndroidKeyStore"
        const val ALIAS = "uz.anncorp.smeta.vault.v1"
        const val BLOB = "smeta_vault_v1.bin"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV_LEN = 12
        val AAD = "uz.anncorp.smeta|desktop-session-v1".toByteArray(Charsets.UTF_8)
    }
}
