package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.security.MessageDigest

/**
 * Offline read cache shared by Android and Windows. Every entry is encrypted ([SecretCipher]: Android Keystore / Windows DPAPI);
 * a user has their own folder (switching account never shows the previous person's data); entries older than [ttlMs] (72 h, like the
 * web offline mode) are ignored; sign-out wipes everything. Only server READS are cached - writes are never queued here.
 */
class EncryptedCache(private val root: File, private val cipher: SecretCipher, private val ttlMs: Long = 72L * 3600_000) {
    private var dir: File = File(root, "anon")

    fun scope(userKey: String) { dir = File(root, "u" + sha(userKey).take(16)).also { it.mkdirs() } }
    fun scope(userId: Long) { dir = File(root, "u$userId").also { it.mkdirs() } }

    private fun sha(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun f(key: String) = File(dir, sha(key).take(32) + ".bin")

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

/** What a cached read returns: fresh from the server, an offline copy (with its age), or why there is nothing. */
sealed interface Loaded<out T> {
    data class Fresh<T>(val data: T) : Loaded<T>
    data class Offline<T>(val data: T, val savedAt: Long) : Loaded<T>
    data object Forbidden : Loaded<Nothing>
    data object NoData : Loaded<Nothing>
    data class Failed(val code: String) : Loaded<Nothing>
}

/** Read requests that are safe to keep offline: GETs of lists and the read-only query/RPC posts. Account, lock, session and every write are excluded. */
fun isCacheableRead(path: String, method: String, body: JsonElement?): Boolean {
    val p = path.substringBefore('?')
    if (p in NEVER_CACHE) return false
    if (method == "GET") return p in CACHE_GET
    if (method != "POST") return false
    return when (p) {
        "/api/sb" -> body.obj()?.let { it["soro"] != null || it["jadval"] != null } == true
        "/api/ombor-buyruq" -> (body.obj()?.get("amal") as? JsonPrimitive)?.content in OMBOR_READS
        else -> false
    }
}
private val NEVER_CACHE = setOf("/api/sessiya", "/api/qulf", "/api/profil", "/api/telegram", "/api/kirish-taklif", "/api/hujjat-ol", "/api/sb-yoz", "/api/f2-buyruq", "/api/agent-ish", "/api/ai-savol")
private val CACHE_GET = setOf("/api/ish-joyi", "/api/modullarim", "/api/company", "/api/obyekt-paket", "/api/obyekt-tugun-summa", "/api/hujjat-aylanish", "/api/hujjat-royxat", "/api/tomon")
private val OMBOR_READS = setOf("qoldiq", "royxat", "tarix", "hisobot")

/**
 * [BffApi] decorator: every successful cacheable read is stored encrypted; when the network is down the stored copy (max 72 h) answers instead,
 * and [staleSince] says so (the apps show an "offline copy" banner). Writes pass through untouched: offline they fail with status 0 and the
 * caller shows its own "online only" message (never silently queued here).
 */
class CachingBffApi(
    private val delegate: BffApi, private val cache: EncryptedCache, private val scopeKey: () -> String?,
    private val now: () -> Long = System::currentTimeMillis,
) : BffApi by delegate {
    private val _staleSince = MutableStateFlow<Long?>(null)
    /** Time of the oldest copy shown since the last live answer; null = live data. */
    val staleSince: StateFlow<Long?> get() = _staleSince

    private var scoped: String? = null
    private fun ensureScope() { val k = scopeKey(); if (k != null && k != scoped) { scoped = k; cache.scope(k) } }

    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val r = delegate.bff(path, method, body, etag)
        if (etag != null || !isCacheableRead(path, method, body)) return r
        ensureScope()
        if (scoped == null) return r
        val key = "$method $path ${body ?: ""}"
        if (r.ok) { r.body?.let { cache.put(key, it.toString(), now()) }; _staleSince.value = null; return r }
        if (r.networkError) {
            val c = cache.get(key, now()) ?: return r
            val parsed = runCatching { Json.parseToJsonElement(c.second) }.getOrNull() ?: return r
            _staleSince.value = minOf(_staleSince.value ?: c.first, c.first)
            return ApiResult(200, parsed)
        }
        return r
    }

    /** Sign-out: drop every stored copy. */
    fun wipe() { cache.wipe(); scoped = null; _staleSince.value = null }
}

/** Shown when a write is attempted without a connection (same wording on both platforms). */
const val OFFLINE_WRITE_MESSAGE = "Oflayn: yozib bo'lmaydi. Ro'yxatlar oxirgi saqlangan nusxadan ko'rsatilmoqda; o'zgartirish uchun internetga ulaning."