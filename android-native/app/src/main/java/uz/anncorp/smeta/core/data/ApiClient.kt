package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
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
import java.io.IOException
import java.util.UUID

const val ANDROID_ORIGIN = "app://qurai-android"
const val VERSION_HEADER = "X-Smeta-Desktop-Version"

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
data class ApiResult(val status: Int, val body: JsonElement?, val code: String? = null) {
    val ok get() = status in 200..299
    val networkError get() = status == 0
    val unauthorized get() = status == 401
}

class ApiClient(
    private val baseUrl: HttpUrl,
    private val tokens: TokenStore,
    private val events: AuthEvents,
    private val json: Json,
    versionName: String,
    base: OkHttpClient = OkHttpClient(),
) {
    val http: OkHttpClient = base.newBuilder()
        .addInterceptor(NativeHeadersInterceptor({ tokens.token() }, versionName) { tokens.clear(); events.emitLogout() })
        .build()

    /** Calls an allow-listed API path through POST /api/mobil/bff (the server derives all authority from the device). */
    suspend fun bff(path: String, method: String = "GET", body: JsonElement? = null): ApiResult {
        val envelope = buildJsonObject {
            put("path", path)
            put("method", method)
            if (body != null && body !is JsonNull) put("body", body)
        }
        return post("/api/mobil/bff", envelope)
    }

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

    private suspend fun send(request: Request): ApiResult = withContext(Dispatchers.IO) {
        try {
            http.newCall(request).execute().use { r ->
                val text = r.body?.string().orEmpty()
                val parsed = runCatching { json.parseToJsonElement(text) }.getOrNull()
                val code = (parsed as? JsonObject)?.get("code")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                ApiResult(r.code, parsed, code)
            }
        } catch (e: IOException) {
            ApiResult(0, null)
        }
    }

    private fun JsonObject.toRequestBody() = toString().toRequestBody("application/json; charset=utf-8".toMediaType())
}
