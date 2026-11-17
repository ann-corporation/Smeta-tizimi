package uz.anncorp.qurai.desktop

import uz.anncorp.smeta.core.data.SecretCipher
import java.io.File
import java.security.MessageDigest

/**
 * Offline read cache. Every file is encrypted with the DPAPI cipher; a user has their own folder (switching account never shows
 * the previous person's data); entries older than [ttlMs] (72 h, like the web offline mode) are ignored; sign-out wipes everything.
 */
class EncryptedCache(private val root: File, private val cipher: SecretCipher, private val ttlMs: Long = 72L * 3600_000) {
    private var dir: File = File(root, "anon")

    fun scope(userId: Long) { dir = File(root, "u$userId").also { it.mkdirs() } }

    private fun f(key: String): File {
        val h = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }.take(32)
        return File(dir, "$h.bin")
    }

    @Synchronized
    fun put(key: String, body: String, now: Long = System.currentTimeMillis()) {
        runCatching {
            dir.mkdirs()
            f(key).writeBytes(cipher.encrypt("$now\n$body".toByteArray(Charsets.UTF_8)))
        }
    }

    /** (savedAtMs, body) or null when missing, expired or unreadable (a corrupt file is removed). */
    @Synchronized
    fun get(key: String, now: Long = System.currentTimeMillis()): Pair<Long, String>? {
        val file = f(key)
        if (!file.exists()) return null
        return try {
            val s = String(cipher.decrypt(file.readBytes()), Charsets.UTF_8)
            val nl = s.indexOf('\n')
            val ts = s.substring(0, nl).toLong()
            if (now - ts > ttlMs) { file.delete(); null } else ts to s.substring(nl + 1)
        } catch (e: Exception) { file.delete(); null }
    }

    @Synchronized
    fun wipe() { root.deleteRecursively(); root.mkdirs(); dir = File(root, "anon") }
}