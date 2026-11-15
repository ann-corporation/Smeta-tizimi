package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** Why creating or joining a workplace failed. The UI maps each kind to a localized message. */
enum class OnboardError { NAME_SHORT, INN_INVALID, INN_TAKEN, ALREADY_OWN, CODE_INVALID, CODE_EXPIRED, CODE_FULL, DAILY_LIMIT, NO_RIGHT, NETWORK, SERVER }

sealed interface OnboardResult {
    data class Done(val companyId: Long?) : OnboardResult
    data class Failed(val error: OnboardError) : OnboardResult
}

/**
 * Same invite code the website accepts (/qoshil/<code> link or the bare code): upper-case, A-Z 0-9 and dash only
 * (mirror of `kodniAjrat` in frontend/src/umumiy/kontekst/IshJoyiAmallari.tsx).
 */
fun parseInviteCode(input: String): String {
    val s = input.trim()
    val m = Regex("/qoshil/([^/?#\\s]+)").find(s)
    val raw = m?.groupValues?.get(1)?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrDefault(it) } ?: s
    return raw.uppercase().replace(Regex("[^A-Z0-9-]"), "")
}

/** Extracts the one-time token from a /taklif/<token> link (phone + code invites use the 8-digit code instead). */
fun parseInviteToken(input: String): String? = Regex("/taklif/([A-Za-z0-9_-]{24,64})").find(input.trim())?.groupValues?.get(1)

/** Company creation and joining go through the same shared endpoints the website uses (/api/company ozi_och, /api/ish-joyi qoshil). */
class CompanyRepository(private val api: BffApi, private val newId: () -> String = { UUID.randomUUID().toString() }) {
    suspend fun create(name: String, inn: String?): OnboardResult {
        val nom = name.trim()
        if (nom.length < 2) return OnboardResult.Failed(OnboardError.NAME_SHORT)
        val r = api.bff("/api/company", "POST", buildJsonObject {
            put("action", "ozi_och"); put("nom", nom)
            if (!inn.isNullOrBlank()) put("inn", inn.trim())
            put("operation_id", newId())
        })
        return if (r.ok) OnboardResult.Done(companyIdOf(r.body)) else OnboardResult.Failed(createError(r))
    }

    suspend fun join(codeOrLink: String): OnboardResult {
        val code = parseInviteCode(codeOrLink)
        if (code.length < 4) return OnboardResult.Failed(OnboardError.CODE_INVALID)
        val r = api.bff("/api/ish-joyi", "POST", buildJsonObject { put("amal", "qoshil"); put("kod", code); put("operation_id", newId()) })
        return if (r.ok && (r.body as? JsonObject)?.get("ok")?.jsonPrimitive?.content != "false") OnboardResult.Done(companyIdOf(r.body)) else OnboardResult.Failed(joinError(r))
    }

    private fun companyIdOf(b: kotlinx.serialization.json.JsonElement?): Long? = ((b as? JsonObject)?.get("kompaniya_id"))?.jsonPrimitive?.longOrNull

    private fun createError(r: ApiResult): OnboardError = when {
        r.networkError -> OnboardError.NETWORK
        r.code == "COMPANY_NAME_REQUIRED" -> OnboardError.NAME_SHORT
        r.code == "INN_INVALID" -> OnboardError.INN_INVALID
        r.code == "INN_BAND" -> OnboardError.INN_TAKEN
        r.code == "OZI_OCHILGAN" -> OnboardError.ALREADY_OWN
        r.status in 500..599 -> OnboardError.SERVER
        else -> OnboardError.SERVER
    }

    private fun joinError(r: ApiResult): OnboardError = when {
        r.networkError -> OnboardError.NETWORK
        r.code == "TAKLIF_YAROQSIZ" -> OnboardError.CODE_INVALID
        r.code == "TAKLIF_MUDDATI_OTGAN" -> OnboardError.CODE_EXPIRED
        r.code == "TAKLIF_TOLDI" -> OnboardError.CODE_FULL
        r.code == "LIMIT_KUN" || r.code == "LIMIT_JAMI" -> OnboardError.DAILY_LIMIT
        r.code == "RUXSAT_YOQ" || r.code == "ROL_NOTOGRI" -> OnboardError.NO_RIGHT
        r.status in 400..499 -> OnboardError.CODE_INVALID
        else -> OnboardError.SERVER
    }
}
