package uz.anncorp.smeta.feature.m29

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/*
 * M-29 (material consumption, "ombordan chiqim") wire contract. The same server logic as the web page
 * (frontend/src/api/t2-m29.ts, admin/sahifalar/M29Chiqim.tsx): write = /api/sb-yoz { amal: m29_bajar_v1 | m29_bekor_v1 },
 * read = /api/sb table t2_m29_hujjat (company scope is applied by the server). The outbox id IS the operation_id, so a replay never
 * executes a period twice. The app carries no money here: quantities only, and whatever the server answers is shown as it is.
 * Pure (no Android): unit-tested.
 */

const val AMAL_M29_BAJAR = "m29_bajar_v1"
const val AMAL_M29_BEKOR = "m29_bekor_v1"

fun isM29Kind(kind: String) = kind == AMAL_M29_BAJAR

/** fakt.write (server write-command-policy): the full-access roles plus pto and prorab (object.write grants fakt.write). Warehouse keeper only reads. */
fun canExecuteM29(role: String?): Boolean = role.orEmpty().trim().lowercase() in setOf("superadmin", "admin", "boss", "prorab", "pto")

/** One material line: name (+ unit) and the consumed quantity. [hint] is the estimate's own volume for that material (server value), shown only as a reminder. */
data class M29Line(val nomi: String, val birligi: String?, val miqdor: BigDecimal, val hint: Double? = null)

private val PERIOD = Regex("^\\d{4}-(0[1-9]|1[0-2])$")
fun isValidPeriod(p: String) = PERIOD.matches(p)
fun currentPeriod(today: LocalDate = LocalDate.now()): String = YearMonth.from(today).toString()

/** Moves a "YYYY-MM" period by [delta] months; a malformed period is returned unchanged. */
fun shiftPeriod(p: String, delta: Int): String = if (!isValidPeriod(p)) p else YearMonth.parse(p).plusMonths(delta.toLong()).toString()

/** null = ok, otherwise the field that is wrong (the screen maps it to a message): obyekt | davr | qator | nom | miqdor. */
fun validateM29(obyektId: Long?, davr: String, lines: List<M29Line>): String? = when {
    obyektId == null || obyektId <= 0 -> "obyekt"
    !isValidPeriod(davr) -> "davr"
    lines.isEmpty() -> "qator"
    lines.any { it.nomi.trim().isEmpty() } -> "nom"
    lines.any { it.miqdor.signum() <= 0 } -> "miqdor"
    lines.size > 3000 -> "qator"
    else -> null
}

fun m29Payload(
    companyId: Long, obyektId: Long, davr: String, lines: List<M29Line>, operationId: String, allowNegative: Boolean = false, cancelTrigger: Boolean = false,
): JsonObject = buildJsonObject {
    put("amal", AMAL_M29_BAJAR)
    put("kompaniya_id", companyId)
    put("obyekt_id", obyektId)
    put("davr", davr)
    put("qatorlar", buildJsonArray {
        lines.forEach { l ->
            add(buildJsonObject {
                put("nomi", l.nomi.trim().take(500))
                if (l.birligi.isNullOrBlank()) put("birligi", JsonNull) else put("birligi", l.birligi.trim().take(50))
                put("miqdor", l.miqdor.stripTrailingZeros().toPlainString().toDouble())
            })
        }
    })
    put("operation_id", operationId)
    put("manfiyga_ruxsat", allowNegative)
    put("trigger_bekor", cancelTrigger)
}

fun m29CancelPayload(companyId: Long, hujjatId: Long, reason: String): JsonObject = buildJsonObject {
    put("amal", AMAL_M29_BEKOR); put("kompaniya_id", companyId); put("hujjat_id", hujjatId); put("sabab", reason.trim().take(1000))
}

fun m29ListBody(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_m29_hujjat")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("ustunlar", "id,obyekt_id,davr,holat,qator_soni,trigger_bekor_soni,manfiy_qoldiq,bajarildi")
    put("tartib", "bajarildi.desc")
    put("limit", 200)
}

@Serializable
data class M29Doc(
    val id: Long, val obyektId: Long, val davr: String, val holat: String, val qatorSoni: Int?, val triggerBekor: Int?, val manfiyQoldiq: Boolean, val bajarildi: String?,
) { val active get() = holat == "bajarildi" }

fun parseM29Docs(rows: List<JsonObject>): List<M29Doc> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    M29Doc(
        id, r["obyekt_id"].num()?.toLong() ?: 0L, r["davr"].str().orEmpty(), if (r["holat"].str() == "bekor") "bekor" else "bajarildi",
        r["qator_soni"].num()?.toInt(), r["trigger_bekor_soni"].num()?.toInt(), (r["manfiy_qoldiq"] as? JsonPrimitive)?.booleanOrNull ?: false, r["bajarildi"].str(),
    )
}

/** Filter for the executed-documents list: all / only active / only cancelled. */
fun filterDocs(all: List<M29Doc>, mode: String, obyektId: Long?): List<M29Doc> = all.filter { d ->
    (obyektId == null || d.obyektId == obyektId) && when (mode) { "active" -> d.active; "cancelled" -> !d.active; else -> true }
}

// ---------- server problems (as the web shows them) ----------

enum class M29Problem { PERIOD_DONE, STOCK_SHORT, TRIGGER, FORBIDDEN, OBJECT, LINES, OTHER }

fun problemOf(code: String?): M29Problem = when (code) {
    "DAVR_BAJARILGAN" -> M29Problem.PERIOD_DONE
    "QOLDIQ_YETMAYDI" -> M29Problem.STOCK_SHORT
    "TRIGGER_CHIQIM_BOR" -> M29Problem.TRIGGER
    "PERMISSION_DENIED" -> M29Problem.FORBIDDEN
    "OBYEKT_BEGONA" -> M29Problem.OBJECT
    "QATORLAR_NOTOGRI" -> M29Problem.LINES
    else -> M29Problem.OTHER
}

/** A line the warehouse cannot cover: [onHand] may be negative and keeps its sign. */
data class Shortage(val nomi: String, val birligi: String?, val kerak: Double?, val bor: Double?)

/** What the rejected outbox entry remembers about the server answer (written by the outbox, see rejectionInfo). */
data class FailInfo(val code: String?, val shortages: List<Shortage>)

fun parseFailInfo(info: String?): FailInfo? {
    if (info.isNullOrBlank()) return null
    val o = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(info) }.getOrNull().obj() ?: return null
    val short = (o["yetmaydi"].arr() ?: JsonArray(emptyList())).mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        Shortage(x["nomi"].str().orEmpty(), x["birligi"].str(), x["kerak"].num(), x["bor"].num())
    }
    return FailInfo(o["kod"].str(), short)
}

/** Rebuilds a rejected M-29 payload as a NEW operation with the server-requested consent (negative stock / replace old automatic issues). Null = not an M-29 payload. */
fun flaggedPayload(oldPayload: String, newOperationId: String, allowNegative: Boolean, cancelTrigger: Boolean): JsonObject? {
    val o = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(oldPayload) }.getOrNull().obj() ?: return null
    if (o["amal"].str() != AMAL_M29_BAJAR) return null
    return JsonObject(o + mapOf(
        "operation_id" to JsonPrimitive(newOperationId),
        "manfiyga_ruxsat" to JsonPrimitive(allowNegative || (o["manfiyga_ruxsat"] as? JsonPrimitive)?.booleanOrNull == true),
        "trigger_bekor" to JsonPrimitive(cancelTrigger || (o["trigger_bekor"] as? JsonPrimitive)?.booleanOrNull == true),
    ))
}

data class M29Summary(val davr: String, val lineCount: Int, val first: String)

/** Short description of a queued M-29 for its card (period, how many materials, the first one). */
fun summarizeM29(payload: String): M29Summary? {
    val o = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(payload) }.getOrNull().obj() ?: return null
    if (o["amal"].str() != AMAL_M29_BAJAR) return null
    val lines = o["qatorlar"].arr().orEmpty().mapNotNull { it.obj() }
    return M29Summary(o["davr"].str().orEmpty(), lines.size, lines.firstOrNull()?.get("nomi").str().orEmpty())
}
