package uz.anncorp.smeta.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

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
