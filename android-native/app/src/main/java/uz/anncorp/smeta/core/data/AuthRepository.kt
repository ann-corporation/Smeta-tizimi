package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Instant
import java.util.UUID

/** Why a sign-in attempt failed. The UI maps each kind to a localized message. */
enum class AuthError {
    BAD_CREDENTIALS, NETWORK, RATE_LIMITED, DISABLED, UPDATE_REQUIRED, DEVICE_LIMIT,
    GOOGLE_UNAVAILABLE, GOOGLE_CANCELLED, TELEGRAM_OFF, TELEGRAM_EXPIRED, TELEGRAM_DENIED, SERVER,
    // sign-up and invite acceptance
    EMAIL_BAD, EMAIL_OFF, ACCOUNT_EXISTS, CODE_WRONG, WEAK_PASSWORD, INVITE_OFF, INVITE_BAD, INVITE_ACCOUNT_EXISTS,
}

/** Maps a shared-server sign-up/invite failure code (royxat-*, kirish-taklif) to the app error. Same codes the website shows. */
internal fun signUpError(status: Int, code: String?): AuthError = when {
    status == 0 -> AuthError.NETWORK
    code == "EMAIL_NOTOGRI" -> AuthError.EMAIL_BAD
    code == "EMAIL_BAND" -> AuthError.ACCOUNT_EXISTS
    code == "HISOB_BOR" -> AuthError.INVITE_ACCOUNT_EXISTS
    code == "TAKLIF_RAD" -> AuthError.INVITE_BAD
    code == "YOQILMAGAN" -> AuthError.INVITE_OFF
    code == "EMAIL_XIZMATI_SOZLANMAGAN" || code == "EMAIL_YUBORILMADI" || code == "SOZLANMAGAN" -> AuthError.EMAIL_OFF
    code == "LIMIT" || code == "KOD_URINISH_LIMITI" || code == "KOD_KUTILMOQDA" || status == 429 -> AuthError.RATE_LIMITED
    code != null && code.startsWith("KOD_") -> AuthError.CODE_WRONG
    code != null && (code.startsWith("PAROL_") || code == "PASSWORD_WEAK") -> AuthError.WEAK_PASSWORD
    status in 500..599 -> AuthError.SERVER
    else -> AuthError.BAD_CREDENTIALS
}

class EmailCodeSent(val verificationId: String)

sealed interface AuthOutcome {
    data object Success : AuthOutcome
    data class Failure(val error: AuthError) : AuthOutcome
}

/** Cookies live only for the duration of one sign-in; the device credential replaces them. */
class MemoryCookieJar : CookieJar {
    private val store = mutableListOf<Cookie>()
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { c -> store.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }; store.add(c) }
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = store.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() }
    @Synchronized fun clear() = store.clear()
}

/** One sign-in attempt: a private client with a temporary cookie jar and the web Origin the sign-in endpoints expect. */
class LoginSession internal constructor(internal val client: OkHttpClient, internal val jar: MemoryCookieJar)

class TelegramStart(val nonce: String, val secret: String, val link: String, val code: String?, val expiresAtMs: Long)

class AuthRepository(
    private val baseUrl: HttpUrl,
    private val tokens: TokenStore,
    private val json: Json,
    private val versionName: String,
    private val deviceName: () -> String,
    private val osName: () -> String,
    private val base: OkHttpClient = OkHttpClient(),
    private val clock: () -> Long = System::currentTimeMillis,
) {

    fun newSession(): LoginSession {
        val jar = MemoryCookieJar()
        val client = base.newBuilder().cookieJar(jar)
            .addInterceptor { chain ->
                // Origin of the host actually called (HostFallbackInterceptor may have switched hosts): the server accepts only a same-origin Origin.
                val u = chain.request().url
                val o = "${u.scheme}://${u.host}" + if (u.port != HttpUrl.defaultPort(u.scheme)) ":${u.port}" else ""
                chain.proceed(chain.request().newBuilder().header("Origin", o).header(VERSION_HEADER, versionName).build())
            }.build()
        return LoginSession(client, jar)
    }

    // ---- Password ----------------------------------------------------------------------------------------------

    suspend fun loginPassword(session: LoginSession, login: String, parol: String): AuthOutcome {
        val res = call(session, "POST", "/api/kirish", buildJsonObject { put("login", login); put("parol", parol) })
        if (res.status == 0) return AuthOutcome.Failure(AuthError.NETWORK)
        if (res.status == 429) return AuthOutcome.Failure(AuthError.RATE_LIMITED)
        if (res.status in 500..599) return AuthOutcome.Failure(AuthError.SERVER)
        if (!res.ok || res.flag("ok") == false) return AuthOutcome.Failure(AuthError.BAD_CREDENTIALS)
        return enroll(session)
    }

    // ---- Google ------------------------------------------------------------------------------------------------

    /** The web OAuth client id the server validates ID tokens against (public value). */
    suspend fun googleClientId(session: LoginSession): String? {
        val res = call(session, "GET", "/api/kirish-google", null)
        return if (res.ok) res.body?.string("clientId")?.takeIf { it.isNotBlank() } else null
    }

    suspend fun loginGoogle(session: LoginSession, idToken: String): AuthOutcome {
        val res = call(session, "POST", "/api/kirish-google", buildJsonObject { put("credential", idToken) })
        if (res.status == 0) return AuthOutcome.Failure(AuthError.NETWORK)
        if (res.status == 429) return AuthOutcome.Failure(AuthError.RATE_LIMITED)
        if (res.status == 503) return AuthOutcome.Failure(AuthError.GOOGLE_UNAVAILABLE)
        if (res.status in 500..599) return AuthOutcome.Failure(AuthError.SERVER)
        if (!res.ok || res.flag("ok") == false) return AuthOutcome.Failure(AuthError.BAD_CREDENTIALS)
        return enroll(session)
    }

    // ---- Telegram ----------------------------------------------------------------------------------------------

    /** Returns the deep link and the in-memory secret, or the failure to show. The secret must never be persisted or logged. */
    suspend fun telegramStart(session: LoginSession): Pair<TelegramStart?, AuthError?> {
        val res = call(session, "POST", "/api/kirish-telegram", buildJsonObject { put("amal", "boshla") })
        if (res.status == 0) return null to AuthError.NETWORK
        if (res.code == "YOQILMAGAN" || res.code == "SOZLANMAGAN") return null to AuthError.TELEGRAM_OFF
        if (res.status == 429) return null to AuthError.RATE_LIMITED
        if (!res.ok) return null to if (res.status in 500..599) AuthError.SERVER else AuthError.TELEGRAM_OFF
        val b = res.body
        val nonce = b?.string("nonce"); val sir = b?.string("sir"); val link = b?.string("havola")
        if (nonce == null || sir == null || link == null) return null to AuthError.SERVER
        return TelegramStart(nonce, sir, link, b.string("belgi"), parseExpiry(b, clock())) to null
    }

    suspend fun telegramPoll(session: LoginSession, nonce: String, secret: String): PollResult {
        val res = call(session, "POST", "/api/kirish-telegram", buildJsonObject { put("amal", "holat"); put("nonce", nonce); put("sir", secret) })
        return when {
            res.status == 0 || res.status in 500..599 -> PollResult.Transient
            res.ok && res.body?.string("holat") == "tayyor" -> PollResult.Ready
            res.ok -> PollResult.Waiting
            res.code == "MUDDATI_OTGAN" || res.status == 410 -> PollResult.Expired
            res.code == "KIRISH_RAD" || res.status == 403 -> PollResult.Denied
            res.status == 429 -> PollResult.Transient
            else -> PollResult.Expired
        }
    }

    /** After the poll reports Ready the session cookie is in the jar: trade it for a device credential. */
    suspend fun finishTelegram(session: LoginSession): AuthOutcome = enroll(session)

    // ---- Sign-up (same shared endpoints as the website: royxat-email-kod -> royxat-ozi -> kirish) ---------------

    /** Step 1: the server e-mails a 6-digit code. Returns the verification id to send back with the code. */
    suspend fun requestEmailCode(session: LoginSession, email: String): Pair<EmailCodeSent?, AuthError?> {
        val res = call(session, "POST", "/api/royxat-email-kod", buildJsonObject { put("email", email.trim().lowercase()) })
        val id = res.body.string("tasdiqlash_id")
        if (res.ok && res.flag("ok") != false && id != null) return EmailCodeSent(id) to null
        return null to signUpError(res.status, res.code)
    }

    /** Step 2: create the (company-less) account and sign in. The name and password are chosen here; the company comes next (onboarding). */
    suspend fun signUpEmail(session: LoginSession, email: String, verificationId: String, code: String, name: String, password: String, operationId: String = UUID.randomUUID().toString()): AuthOutcome {
        val login = email.trim().lowercase()
        val res = call(session, "POST", "/api/royxat-ozi", buildJsonObject {
            put("login", login); put("parol", password); put("ism", name.trim())
            put("tasdiqlash_id", verificationId); put("kod", code.trim()); put("operation_id", operationId)
        })
        if (!res.ok || res.flag("ok") == false) return AuthOutcome.Failure(signUpError(res.status, res.code))
        return loginPassword(session, login, password)
    }

    // ---- Invitation (phone + 8-digit code, or /taklif/<token> link): new account with the invited role, no e-mail needed ----

    suspend fun acceptInvite(session: LoginSession, token: String?, phone: String?, code: String?, password: String, operationId: String = UUID.randomUUID().toString()): AuthOutcome {
        val res = call(session, "POST", "/api/kirish-taklif", buildJsonObject {
            put("amal", "qabul"); put("parol", password); put("operation_id", operationId)
            if (token != null) put("token", token) else { put("telefon", phone.orEmpty()); put("kod", code.orEmpty()) }
        })
        if (!res.ok || res.flag("ok") == false) return AuthOutcome.Failure(signUpError(res.status, res.code))
        return enroll(session)
    }

    // ---- Device enrolment --------------------------------------------------------------------------------------

    internal suspend fun enroll(session: LoginSession): AuthOutcome {
        val body = buildJsonObject {
            put("operation_id", UUID.randomUUID().toString())
            put("qurilma_nomi", deviceName().take(100))
            put("os", osName().take(50))
            put("ilova_versiya", versionName)
        }
        val res = call(session, "POST", "/api/desktop/qurilma", body)
        try {
            if (res.status == 0) return AuthOutcome.Failure(AuthError.NETWORK)
            if (!res.ok) return AuthOutcome.Failure(
                when {
                    res.status == 429 || res.code == "DEVICE_LIMIT" -> AuthError.DEVICE_LIMIT
                    res.status == 426 || res.code == "DESKTOP_UPDATE_REQUIRED" -> AuthError.UPDATE_REQUIRED
                    res.code == "DESKTOP_DISABLED" -> AuthError.DISABLED
                    res.status in 500..599 -> AuthError.SERVER
                    else -> AuthError.BAD_CREDENTIALS
                },
            )
            val b = res.body
            val id = b?.string("device_id"); val token = b?.string("token"); val exp = (b as? JsonObject)?.get("tugaydi")?.jsonPrimitive?.longOrNull
            if (id == null || token == null || exp == null) return AuthOutcome.Failure(AuthError.SERVER)
            tokens.save(DeviceCredential(id, token, exp))
            return AuthOutcome.Success
        } finally {
            session.jar.clear() // the web cookie must not outlive enrolment
        }
    }

    // ---- plumbing ----------------------------------------------------------------------------------------------

    private suspend fun call(session: LoginSession, method: String, path: String, body: JsonObject?): ApiResult = withContext(Dispatchers.IO) {
        val rb = body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
        val req = Request.Builder().url(baseUrl.resolve(path)!!).method(method, rb).build()
        try {
            session.client.newCall(req).execute().use { r ->
                val text = r.body?.string().orEmpty()
                val parsed = runCatching { json.parseToJsonElement(text) }.getOrNull()
                ApiResult(r.code, parsed, parsed.string("code"))
            }
        } catch (e: IOException) {
            ApiResult(0, null)
        }
    }

    private fun ApiResult.flag(key: String) = (body as? JsonObject)?.get(key)?.jsonPrimitive?.booleanOrNull

    private fun parseExpiry(b: kotlinx.serialization.json.JsonElement?, now: Long): Long {
        val p = (b as? JsonObject)?.get("tugaydi") as? JsonPrimitive ?: return now + 5 * 60_000
        p.longOrNull?.let { return if (it < 10_000_000_000L) it * 1000 else it }
        return runCatching { Instant.parse(p.content).toEpochMilli() }.getOrDefault(now + 5 * 60_000)
    }
}

internal fun kotlinx.serialization.json.JsonElement?.string(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

sealed interface PollResult {
    data object Waiting : PollResult
    data object Ready : PollResult
    data object Denied : PollResult
    data object Expired : PollResult
    /** Network blip or 5xx: keep polling. */
    data object Transient : PollResult
}
