package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import uz.anncorp.smeta.core.security.StepUpHandler
import uz.anncorp.smeta.core.security.TasdiqStore
import java.io.IOException
import java.util.UUID

const val ANDROID_ORIGIN = "app://qurai-android"
const val VERSION_HEADER = "X-Smeta-Desktop-Version"
const val STEP_UP_CODE = "STEP_UP_KERAK"
private const val AVATAR_PATH = "/api/mobil/avatar"
private const val AVATAR_READ_MAX = 3L * 1024 * 1024

/** Emits when the server rejects the device credential or the user signs out; the UI returns to Login. */
class AuthEvents {
    private val _logout = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val logout: SharedFlow<Unit> = _logout.asSharedFlow()
    fun emitLogout() { _logout.tryEmit(Unit) }
}

/**
 * Adds the native-app identity headers. The Bearer token is attached when present; a 401 on an authenticated
 * request means the device was revoked or expired, so the token is dropped and [onUnauthorized] fires.
 */
class NativeHeadersInterceptor(
    private val tokenProvider: () -> String?,
    private val versionName: String,
    private val onUnauthorized: () -> Unit,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val b = chain.request().newBuilder()
            .header("Origin", ANDROID_ORIGIN)
            .header(VERSION_HEADER, versionName)
        if (token != null) b.header("Authorization", "Bearer $token")
        val response = chain.proceed(b.build())
        if (token != null && response.code == 401) onUnauthorized()
        return response
    }
}

/** Result of a call through the BFF. [status]==0 means the network failed before any HTTP answer. */
data class ApiResult(val status: Int, val body: JsonElement?, val code: String? = null, val etag: String? = null) {
    val ok get() = status in 200..299
    val networkError get() = status == 0
    val unauthorized get() = status == 401
}

/** Binary answer of a BFF GET (documents). [status]==0 = network failure; [code] is the server error code of a JSON error body. */
class BytesResult(val status: Int, val bytes: ByteArray?, val mime: String? = null, val filename: String? = null, val code: String? = null) {
    val ok get() = status in 200..299
}

/** The only thing feature repositories need from the network layer; a debug-only demo implementation exists. */
interface BffApi {
    suspend fun bff(path: String, method: String = "GET", body: JsonElement? = null, etag: String? = null): ApiResult

    /** Binary GET through the BFF (document download). Answers larger than [maxBytes] are refused with status 413. */
    suspend fun bffBytes(path: String, maxBytes: Long): BytesResult = BytesResult(404, null)

    /** Binary POST through the BFF (server-side document generation: the server returns the final XLSX/PDF). Same limits/errors as [bffBytes]. */
    suspend fun bffPostBytes(path: String, body: JsonElement, maxBytes: Long): BytesResult = BytesResult(404, null)

    /** Multipart upload through POST /api/mobil/yukla (the canonical document upload; tenant scope travels in the query). */
    suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult

    /** One-time (30 s) link that signs the in-app WebView into the website page [path] (POST /api/mobil/web-bilet; body "url"). */
    suspend fun webTicket(path: String): ApiResult = ApiResult(404, null)

    /** The user's own profile photo (GET /api/mobil/avatar): bytes, or status 404 when none. */
    suspend fun avatarGet(): BytesResult = BytesResult(404, null)

    /** Replaces the photo with already cropped/downsized image bytes ([mime] image/jpeg | png | webp; server cap 2 MiB, magic bytes verified). */
    suspend fun avatarPut(bytes: ByteArray, mime: String): ApiResult = ApiResult(404, null)

    suspend fun avatarDelete(): ApiResult = ApiResult(404, null)
}

class ApiClient(
    private val baseUrl: HttpUrl,
    private val tokens: TokenStore,
    private val events: AuthEvents,
    private val json: Json,
    versionName: String,
    base: OkHttpClient = OkHttpClient(),
    /** In-memory step-up marker sent as envelope field 	asdiq (QULF). */
    private val tasdiq: TasdiqStore? = null,
) : BffApi {
    /** Set by the app-lock controller; asked to confirm (PIN/biometrics) when the server answers 403 STEP_UP_KERAK. Null = no step-up UI (tests, demo). */
    @Volatile var stepUp: StepUpHandler? = null

    val http: OkHttpClient = base.newBuilder()
        .addInterceptor(NativeHeadersInterceptor({ tokens.token() }, versionName) { tokens.clear(); events.emitLogout() })
        .build()

    /** Photo / avatar uploads on a slow mobile link: the default 10 s write and 45 s call limits cut a 1 MB body off half way. Same interceptors, longer limits. */
    private val uploadHttp: OkHttpClient = http.newBuilder()
        .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS).readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
        .callTimeout(150, java.util.concurrent.TimeUnit.SECONDS).build()

    /** Calls an allow-listed API path through POST /api/mobil/bff (the server derives all authority from the device). */
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val first = bffOnce(path, method, body, etag)
        val handler = stepUp
        if (first.status != 403 || first.code != STEP_UP_CODE || handler == null) return first
        val methods = ((first.body as? JsonObject)?.get("usullar") as? JsonArray).orEmpty().mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        // Money/signature action needs a fresh PIN/biometric confirmation: ask once, then replay the same request with the new token.
        return if (handler.request(methods)) bffOnce(path, method, body, etag) else first
    }

    private suspend fun bffOnce(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val envelope = buildJsonObject {
            put("path", path)
            put("method", method)
            if (body != null && body !is JsonNull) put("body", body)
            if (etag != null) put("etag", etag)
            tasdiq?.current()?.let { put("tasdiq", it) }
        }
        return post("/api/mobil/bff", envelope)
    }

    override suspend fun bffBytes(path: String, maxBytes: Long): BytesResult = bytesCall(path, "GET", null, maxBytes)

    override suspend fun bffPostBytes(path: String, body: JsonElement, maxBytes: Long): BytesResult = bytesCall(path, "POST", body, maxBytes)

    private suspend fun bytesCall(path: String, method: String, body: JsonElement?, maxBytes: Long): BytesResult {
        val envelope = buildJsonObject {
            put("path", path)
            put("method", method)
            if (body != null) put("body", body)
            tasdiq?.current()?.let { put("tasdiq", it) }
        }
        val request = Request.Builder().url(baseUrl.resolve("/api/mobil/bff")!!).post(envelope.toRequestBody()).build()
        return withContext(Dispatchers.IO) {
            try {
                http.newCall(request).execute().use { r ->
                    val body = r.body
                    val type = r.header("Content-Type").orEmpty()
                    val declared = body?.contentLength() ?: -1L
                    when {
                        body == null -> BytesResult(r.code, null)
                        declared > maxBytes -> BytesResult(413, null, code = "TOO_LARGE")
                        !r.isSuccessful || type.startsWith("application/json") && declared in 0..65536 -> {
                            // Error (or JSON error body): read the small text and keep only the code.
                            val parsed = runCatching { json.parseToJsonElement(body.string()) }.getOrNull()
                            val code = (parsed as? JsonObject)?.get("code")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                            BytesResult(if (r.isSuccessful) 502 else r.code, null, code = code)
                        }
                        else -> {
                            val out = java.io.ByteArrayOutputStream()
                            val src = body.source()
                            val buf = okio.Buffer()
                            var total = 0L
                            while (true) {
                                val n = src.read(buf, 8192)
                                if (n < 0) break
                                total += n
                                if (total > maxBytes) return@use BytesResult(413, null, code = "TOO_LARGE")
                                out.write(buf.readByteArray())
                            }
                            BytesResult(r.code, out.toByteArray(), type.substringBefore(';').trim(), parseDispositionName(r.header("Content-Disposition")))
                        }
                    }
                }
            } catch (e: IOException) {
                BytesResult(0, null)
            }
        }
    }

    override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult {
        val url = baseUrl.resolve("/api/mobil/yukla")!!.newBuilder()
            .addQueryParameter("kompaniya_id", companyId.toString()).addQueryParameter("obyekt_id", obyektId.toString()).build()
        return send(Request.Builder().url(url).post(body).build(), uploadHttp)
    }

    override suspend fun webTicket(path: String): ApiResult = post("/api/mobil/web-bilet", buildJsonObject { put("yol", path) })

    override suspend fun avatarGet(): BytesResult = withContext(Dispatchers.IO) {
        try {
            http.newCall(Request.Builder().url(baseUrl.resolve(AVATAR_PATH)!!).get().build()).execute().use { r ->
                val type = r.header("Content-Type").orEmpty()
                if (!r.isSuccessful || !type.startsWith("image/")) BytesResult(if (r.isSuccessful) 502 else r.code, null)
                else {
                    val src = r.body?.source()
                    val bytes = src?.let { s -> s.request(AVATAR_READ_MAX + 1); if (s.buffer.size > AVATAR_READ_MAX) null else s.buffer.readByteArray() }
                    if (bytes == null) BytesResult(413, null) else BytesResult(r.code, bytes, type.substringBefore(';').trim())
                }
            }
        } catch (e: IOException) { BytesResult(0, null) }
    }

    override suspend fun avatarPut(bytes: ByteArray, mime: String): ApiResult =
        send(Request.Builder().url(baseUrl.resolve(AVATAR_PATH)!!).post(bytes.toRequestBody(mime.toMediaType())).build(), uploadHttp)

    override suspend fun avatarDelete(): ApiResult = send(Request.Builder().url(baseUrl.resolve(AVATAR_PATH)!!).delete().build())

    /** Revokes this device on the server (best effort) and forgets the credential locally. */
    suspend fun signOut() {
        val cred = tokens.load()
        if (cred != null) {
            val body = buildJsonObject { put("operation_id", UUID.randomUUID().toString()); put("device_id", cred.deviceId) }
            runCatching { send(Request.Builder().url(baseUrl.resolve("/api/desktop/qurilma")!!).method("DELETE", body.toRequestBody()).build()) }
        }
        tokens.clear()
        events.emitLogout()
    }

    private suspend fun post(path: String, body: JsonObject): ApiResult =
        send(Request.Builder().url(baseUrl.resolve(path)!!).post(body.toRequestBody()).build())

    private suspend fun send(request: Request, client: OkHttpClient = http): ApiResult = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { r ->
                val text = r.body?.string().orEmpty()
                val parsed = runCatching { json.parseToJsonElement(text) }.getOrNull()
                val code = (parsed as? JsonObject)?.get("code")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                ApiResult(r.code, parsed, code, r.header("ETag"))
            }
        } catch (e: IOException) {
            ApiResult(0, null)
        }
    }

    private fun JsonObject.toRequestBody() = toString().toRequestBody("application/json; charset=utf-8".toMediaType())
}

