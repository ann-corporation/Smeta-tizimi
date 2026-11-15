package uz.anncorp.smeta.core.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The long-lived device credential issued by POST /api/desktop/qurilma. Never logged, never backed up. */
@Serializable
data class DeviceCredential(val deviceId: String, val token: String, val tugaydi: Long) {
    fun isExpired(now: Long) = tugaydi <= now
}

/** Abstraction over the Android Keystore so the store can be unit-tested on the JVM. */
interface SecretCipher {
    fun encrypt(plain: ByteArray): ByteArray
    fun decrypt(data: ByteArray): ByteArray
}

/** AES-256-GCM with a non-exportable Keystore key. Output layout: 12-byte IV followed by ciphertext+tag. */
class KeystoreCipher(private val alias: String = "qurai_device_key") : SecretCipher {
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(alias, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    override fun encrypt(plain: ByteArray): ByteArray {
        val c = Cipher.getInstance(TRANSFORM)
        c.init(Cipher.ENCRYPT_MODE, key())
        return c.iv + c.doFinal(plain)
    }

    override fun decrypt(data: ByteArray): ByteArray {
        require(data.size > IV_BYTES) { "ciphertext too short" }
        val c = Cipher.getInstance(TRANSFORM)
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, IV_BYTES))
        return c.doFinal(data, IV_BYTES, data.size - IV_BYTES)
    }

    private companion object {
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}

/**
 * Persists the device credential encrypted in [file] (use noBackupFilesDir so it is excluded from backups).
 * Any read failure (corrupt file, lost key after restore) is treated as "signed out" and the file is removed.
 */
class TokenStore(private val file: File, private val cipher: SecretCipher, private val json: Json = Json { ignoreUnknownKeys = true }) {
    @Volatile private var cached: DeviceCredential? = null
    @Volatile private var loaded = false

    @Synchronized
    fun load(): DeviceCredential? {
        if (loaded) return cached
        cached = try {
            if (!file.exists()) null
            else json.decodeFromString(DeviceCredential.serializer(), String(cipher.decrypt(file.readBytes()), Charsets.UTF_8))
        } catch (e: Exception) {
            file.delete()
            null
        }
        loaded = true
        return cached
    }

    @Synchronized
    fun save(credential: DeviceCredential) {
        val bytes = cipher.encrypt(json.encodeToString(DeviceCredential.serializer(), credential).toByteArray(Charsets.UTF_8))
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(file)) { file.delete(); check(tmp.renameTo(file)) { "token file rename failed" } }
        cached = credential
        loaded = true
    }

    @Synchronized
    fun clear() {
        file.delete()
        cached = null
        loaded = true
    }

    fun token(): String? = load()?.token
}
