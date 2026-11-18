package uz.anncorp.qurai.desktop

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import uz.anncorp.smeta.core.data.ApiClient
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.AuthEvents
import uz.anncorp.smeta.core.data.AuthRepository
import uz.anncorp.smeta.core.data.EncryptedCache
import uz.anncorp.smeta.core.data.Loaded
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.SessionRepository
import uz.anncorp.smeta.core.data.TokenStore
import java.util.concurrent.TimeUnit


/** Wires the shared (Android-free) core to Windows: DPAPI token store, encrypted cache, the same BFF client and auth as the Android app. */
class Services(apiBase: String = System.getenv("QURAI_API_BASE") ?: BuildInfo.API_BASE) {
    val json = Json { ignoreUnknownKeys = true }
    private val base = apiBase.toHttpUrl()
    private val cipher = DpapiCipher()
    val tokens = TokenStore(AppPaths.token, cipher, json)
    val events = AuthEvents()
    val cache = EncryptedCache(AppPaths.cache, cipher)

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build()

    private val realApi = ApiClient(base, tokens, events, json, BuildInfo.VERSION, http)
    /** The API in use: the real one, or [DesktopDemoApi] while the demo is on (the saved real session is never touched by the demo). */
    var api: uz.anncorp.smeta.core.data.BffApi = realApi; private set
    var demo = false; private set
    val auth = AuthRepository(
        base, tokens, json, BuildInfo.VERSION,
        deviceName = { System.getenv("COMPUTERNAME") ?: "Windows" },
        osName = { System.getProperty("os.name") ?: "Windows" },
        base = http,
    )
    var session = SessionRepository(realApi, json); private set
    var jarvis = JarvisRepository(realApi); private set

    fun enterDemo() {
        demo = true
        val d = DesktopDemoApi(json)
        api = d; session = SessionRepository(d, json); jarvis = JarvisRepository(d)
        cache.scope(-1L); Log.i("demo on")
    }
    private fun leaveDemo() {
        demo = false; api = realApi; session = SessionRepository(realApi, json); jarvis = JarvisRepository(realApi); Log.i("demo off")
    }

    /** Server read with an encrypted offline copy: fresh answer is stored, a network failure falls back to the stored copy (72 h). */
    suspend fun <T> read(key: String, call: suspend () -> ApiResult, parse: (JsonElement?) -> T?): Loaded<T> {
        val r = call()
        if (r.ok) {
            val parsed = parse(r.body)
            if (parsed == null) { Log.i("read $key bad-shape"); return Loaded.Failed("BAD_SHAPE") }
            r.body?.let { cache.put(key, it.toString()) }
            Log.i("read $key ok")
            return Loaded.Fresh(parsed)
        }
        if (r.status == 403) { Log.i("read $key forbidden"); return Loaded.Forbidden }
        if (r.networkError) {
            val c = cache.get(key)
            Log.i("read $key offline cache=${c != null}")
            val parsed = c?.let { parse(runCatching { json.parseToJsonElement(it.second) }.getOrNull()) }
            return if (c != null && parsed != null) Loaded.Offline(parsed, c.first) else Loaded.NoData
        }
        Log.i("read $key http=${r.status}")
        return Loaded.Failed(r.code ?: "HTTP ${r.status}")
    }

    private val lastUserFile = java.io.File(AppPaths.root, "me.bin")
    fun saveLastUser(s: String) { runCatching { lastUserFile.writeBytes(cipher.encrypt(s.toByteArray())) } }
    fun loadLastUser(): String? = runCatching { String(cipher.decrypt(lastUserFile.readBytes())) }.getOrNull()

    fun signOut() {
        if (demo) { leaveDemo(); events.emitLogout(); return }
        tokens.clear(); cache.wipe(); lastUserFile.delete(); events.emitLogout(); Log.i("signed out")
    }
}