package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/*
 * Texnadzor acceptance for an EXTERNAL party (technical supervision / customer representative): the submissions (taqdim) that arrived at my
 * company, a read-only check of what was submitted (F-2: hidden works without an act, volume above fact) and the decision accept / correct / reject
 * with a remark. Server: /api/tomon (bolim=taqdimlar | f2_tekshiruv, amal=nazorat_qaror). Authorization (membership, power of attorney,
 * quality.decide) and the step-up PIN are enforced by the server; the app only shows what the server returned.
 */

/** A submission waiting for or carrying a technical decision. [resource] is e.g. "f2". */
data class NazoratItem(
    val id: Long, val resource: String, val title: String, val month: String?, val total: Double?, val status: String,
    val objectId: Long?, val objectName: String?, val from: String?, val submitted: String?, val decisionNote: String?,
) {
    val pending: Boolean get() = status == "yuborilgan" || status == "ko_rilmoqda"
}

enum class NazoratDecision(val wire: String, val needsRemark: Boolean) {
    ACCEPT("qabul", false), CORRECT("tuzatish", true), REJECT("rad", true)
}

const val NAZORAT_REMARK_MIN = 3
const val NAZORAT_REMARK_MAX = 2000

/** Null = fine. Matches the server rule (IZOH_KERAK: not "accept" needs at least 3 characters). */
fun remarkIssue(decision: NazoratDecision, remark: String): Boolean = decision.needsRemark && remark.trim().length < NAZORAT_REMARK_MIN

data class NazoratProblem(val code: String?, val name: String?, val unit: String?, val f2Volume: Double?, val factVolume: Double?, val kind: String)
data class NazoratCheck(
    val rows: Int, val hidden: Int, val actMissing: Int, val actWaiting: Int, val factVisible: Boolean, val overVolume: Int?, val noFact: Int?,
    val problems: List<NazoratProblem>,
) {
    val clean: Boolean get() = problems.isEmpty() && actMissing == 0 && (overVolume ?: 0) == 0
}

enum class NazoratError { NETWORK, UNAUTHORIZED, NO_RIGHT, REMARK_REQUIRED, WRONG_STATE, NOT_FOUND, SERVER, STEP_UP }

sealed interface NazoratResult<out T> {
    data class Ok<T>(val value: T) : NazoratResult<T>
    data class Err(val error: NazoratError) : NazoratResult<Nothing>
}

private fun JsonObject.s(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
private fun JsonObject.l(k: String): Long? = (this[k] as? JsonPrimitive)?.longOrNull
private fun JsonObject.d(k: String): Double? = (this[k] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull ?: s(k)?.toDoubleOrNull()
private fun JsonObject.i(k: String): Int? = (this[k] as? JsonPrimitive)?.intOrNull
private fun JsonObject.b(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull == true

class NazoratRepository(private val api: BffApi, private val newId: () -> String = { UUID.randomUUID().toString() }) {
    /** Submissions that came TO my company, newest first. */
    suspend fun inbox(companyId: Long): NazoratResult<List<NazoratItem>> {
        val r = api.bff("/api/tomon?bolim=taqdimlar&kompaniya_id=$companyId&yonalish=kelgan&limit=100")
        return map(r) { parseInbox(it) }
    }

    /** What the F-2 submission contains; only meaningful for resource "f2" (other resources return an empty check). */
    suspend fun check(companyId: Long, item: NazoratItem): NazoratResult<NazoratCheck?> {
        if (item.resource != "f2") return NazoratResult.Ok(null)
        val r = api.bff("/api/tomon?bolim=f2_tekshiruv&kompaniya_id=$companyId&taqdim_id=${item.id}")
        return map(r) { parseCheck(it) }
    }

    /** The decision is audited server-side; a fresh PIN/biometric confirmation is requested by the API client when the server demands it. */
    suspend fun decide(companyId: Long, taqdimId: Long, decision: NazoratDecision, remark: String): NazoratResult<Unit> {
        if (remarkIssue(decision, remark)) return NazoratResult.Err(NazoratError.REMARK_REQUIRED)
        val r = api.bff("/api/tomon", "POST", buildJsonObject {
            put("amal", "nazorat_qaror"); put("kompaniya_id", companyId); put("taqdim_id", taqdimId); put("qaror", decision.wire)
            remark.trim().takeIf { it.isNotEmpty() }?.let { put("izoh", it.take(NAZORAT_REMARK_MAX)) }
            put("operation_id", newId())
        })
        return map(r) { }
    }

    private fun <T> map(r: ApiResult, f: (JsonObject) -> T): NazoratResult<T> {
        val o = r.body as? JsonObject
        if (r.networkError) return NazoratResult.Err(NazoratError.NETWORK)
        if (r.unauthorized) return NazoratResult.Err(NazoratError.UNAUTHORIZED)
        if (r.ok && (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != false) return NazoratResult.Ok(f(o ?: JsonObject(emptyMap())))
        return NazoratResult.Err(errorOf(r.status, r.code ?: o?.s("code")))
    }

    companion object {
        fun errorOf(status: Int, code: String?): NazoratError = when (code) {
            "STEP_UP_KERAK" -> NazoratError.STEP_UP
            "IZOH_KERAK" -> NazoratError.REMARK_REQUIRED
            "HOLAT" -> NazoratError.WRONG_STATE
            "TOPILMADI" -> NazoratError.NOT_FOUND
            "ROL_YETARLI_EMAS", "AZO_EMAS", "PERMISSION_DENIED", "NAZORAT_RUXSAT_YOQ" -> NazoratError.NO_RIGHT
            else -> when (status) { 401 -> NazoratError.UNAUTHORIZED; 403 -> NazoratError.NO_RIGHT; 404 -> NazoratError.NOT_FOUND; 409 -> NazoratError.WRONG_STATE; else -> NazoratError.SERVER }
        }

        /** Array answers arrive as `{ok:true, natija:[...]}` (the gateway wraps non-object RPC results). Unknown rows are skipped. */
        fun parseInbox(o: JsonObject): List<NazoratItem> = (o["natija"] as? JsonArray).orEmpty().mapNotNull { e ->
            val x = e as? JsonObject ?: return@mapNotNull null
            val id = x.l("id") ?: return@mapNotNull null
            NazoratItem(
                id = id, resource = x.s("resurs").orEmpty(), title = x.s("nom") ?: x.s("resurs").orEmpty(), month = x.s("oy"), total = x.d("summa"),
                status = x.s("holat").orEmpty(), objectId = x.l("obyekt_id"), objectName = x.s("obyekt_nom"), from = x.s("qarshi_nom"),
                submitted = x.s("taqdim_vaqti"), decisionNote = x.s("qaror_izoh"),
            )
        }

        fun parseCheck(o: JsonObject): NazoratCheck? {
            val x = o["xulosa"] as? JsonObject ?: return null
            val problems = (o["muammolar"] as? JsonArray).orEmpty().mapNotNull { e ->
                val p = e as? JsonObject ?: return@mapNotNull null
                NazoratProblem(p.s("kod"), p.s("nom"), p.s("birlik"), p.d("f2_hajm"), p.d("fakt_hajm"), p.s("muammo").orEmpty())
            }
            return NazoratCheck(
                rows = x.i("jami_qator") ?: 0, hidden = x.i("yashirin_qator") ?: 0, actMissing = x.i("akt_yoq") ?: 0, actWaiting = x.i("akt_kutmoqda") ?: 0,
                factVisible = x.b("fakt_korinadi"), overVolume = x.i("hajm_oshgan"), noFact = x.i("fakt_yoq"), problems = problems,
            )
        }
    }
}
