package uz.anncorp.smeta.feature.naryad

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
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
import java.math.MathContext

/*
 * Naryad (crew work order) wire contract. Same server logic as the web (frontend/src/api/t2-naryad.ts, t2-usta.ts, lib/usta/naryad-ish.ts):
 * read = /api/sb { soro: naryad_ol_v1, bolim: royxat | bitta }, write = /api/sb-yoz { amal: naryad_usta_bajarildi_v1 } ("Bajardim": the worker
 * reports done volume, the foreman accepts it later). The outbox id IS the operation_id (replay-safe); the expected version is the CAS
 * guard the web uses. Money rules: the agreed price is QQS-free (direct cost) and only what the server says is shown; unknown = null, never 0.
 * Pure (no Android): unit-tested.
 */

const val AMAL_NARYAD_USTA = "naryad_usta_bajarildi_v1"

fun isNaryadKind(kind: String) = kind == AMAL_NARYAD_USTA

/** self.work.write (usta, brigadir) or smeta.write (object.write roles) - server write-command-policy. */
fun canReportNaryad(role: String?): Boolean = role.orEmpty().trim().lowercase() in setOf("superadmin", "admin", "boss", "prorab", "pto", "usta", "brigadir")

val NARYAD_STATES = listOf("berildi", "bajarildi", "qabul", "hisoblandi", "bekor")

/** Filter chips of the list. */
enum class NaryadGroup { ALL, OPEN, ACCEPTED, PAID, CANCELLED }

fun naryadGroup(holat: String): NaryadGroup = when (holat) {
    "berildi", "bajarildi" -> NaryadGroup.OPEN
    "qabul" -> NaryadGroup.ACCEPTED
    "hisoblandi" -> NaryadGroup.PAID
    "bekor" -> NaryadGroup.CANCELLED
    else -> NaryadGroup.OPEN
}

fun naryadListBody(companyId: Long, limit: Int = 100): JsonObject = buildJsonObject {
    put("soro", "naryad_ol_v1"); put("kompaniya_id", companyId); put("bolim", "royxat")
    put("filtr", buildJsonObject { put("limit", limit) })
}

fun naryadOneBody(companyId: Long, id: Long): JsonObject = buildJsonObject {
    put("soro", "naryad_ol_v1"); put("kompaniya_id", companyId); put("bolim", "bitta")
    put("filtr", buildJsonObject { put("id", id) })
}

@Serializable
data class NaryadBrief(
    val id: Long, val obyektId: Long, val raqam: String, val ustaNom: String, val brigada: String?, val holat: String, val versiya: Int,
    val davrDan: String?, val davrGacha: String?, val qatorSoni: Int, val rejaSumma: Double?, val narxsizSoni: Int, val faktYozildi: Boolean,
    val xarajatSumma: Double?, val yaratildi: String?,
)

/** `{ok:true, natija:{ok:true, naryadlar:[...]}}` (or the inner object) -> brief rows; anything else -> null. */
fun parseNaryadList(body: JsonElement?): List<NaryadBrief>? {
    val p = natija(body) ?: return null
    val list = p["naryadlar"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        NaryadBrief(
            o["id"].num()?.toLong() ?: return@mapNotNull null, o["obyekt_id"].num()?.toLong() ?: 0L, o["raqam"].str().orEmpty(), o["usta_nom"].str().orEmpty(), o["brigada"].str(),
            o["holat"].str() ?: "berildi", o["versiya"].num()?.toInt() ?: 0, o["davr_dan"].str(), o["davr_gacha"].str(), o["qator_soni"].num()?.toInt() ?: 0,
            o["reja_summa"].num(), o["narxsiz_soni"].num()?.toInt() ?: 0, o["fakt_holat"].str() == "yozildi", o["xarajat_summa"].num(), o["yaratildi"].str(),
        )
    }
}

fun filterNaryad(rows: List<NaryadBrief>, group: NaryadGroup, obyektId: Long?, query: String): List<NaryadBrief> {
    val q = query.trim()
    return rows.filter { r ->
        (group == NaryadGroup.ALL || naryadGroup(r.holat) == group) && (obyektId == null || r.obyektId == obyektId) &&
            (q.isEmpty() || r.raqam.contains(q, ignoreCase = true) || r.ustaNom.contains(q, ignoreCase = true) || r.brigada.orEmpty().contains(q, ignoreCase = true))
    }
}

fun naryadCounts(rows: List<NaryadBrief>): Map<NaryadGroup, Int> =
    NaryadGroup.values().associateWith { g -> if (g == NaryadGroup.ALL) rows.size else rows.count { naryadGroup(it.holat) == g } }

/** One work line in the WORKER'S own unit: volumes are the server's smeta-unit volume divided by [koef] (1 worker unit = koef estimate units). */
@Serializable
data class NaryadLine(
    val id: Long, val qatorId: Long?, val nom: String, val birlik: String, val koef: Double,
    val hajm: Double, val bajarilgan: Double?, val qabul: Double?,
    /** Agreed price per worker unit, QQS-free; null = not agreed yet. */
    val narxBirlik: Double?,
) {
    /** Still to report; never below zero. */
    val qolgan: Double get() = maxOf(0.0, r8(hajm - (bajarilgan ?: 0.0)))
    /** The foreman accepted less than the worker reported. */
    val kamQabul: Boolean get() = qabul != null && bajarilgan != null && qabul < bajarilgan - 1e-9
}

@Serializable
data class NaryadDetail(
    val id: Long, val obyektId: Long, val obyektNom: String?, val raqam: String, val holat: String, val versiya: Int, val ustaNom: String, val brigada: String?,
    val izoh: String?, val ustaIzoh: String?, val davrDan: String?, val davrGacha: String?, val xarajatSumma: Double?, val yaratildi: String?, val lines: List<NaryadLine>,
) {
    /** The worker may (re)report while the foreman has not accepted yet. */
    val canReport get() = holat == "berildi" || holat == "bajarildi"
}

fun r8(x: Double): Double = BigDecimal.valueOf(x).round(MathContext(8)).toDouble()

fun parseNaryadDetail(body: JsonElement?): NaryadDetail? {
    val p = natija(body) ?: return null
    val n = p["naryad"].obj() ?: return null
    val lines = n["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val q = e.obj() ?: return@mapNotNull null
        val workerUnit = q["usta_birlik"].str()?.takeIf { it.isNotBlank() }
        val koef = q["koef"].num()?.takeIf { it > 0 }
        val k = if (workerUnit != null && koef != null) koef else 1.0
        fun vol(key: String): Double? = q[key].num()?.let { r8(it / k) }
        NaryadLine(
            q["id"].num()?.toLong() ?: return@mapNotNull null, q["qator_id"].num()?.toLong(), q["nom"].str().orEmpty(),
            if (workerUnit != null && koef != null) workerUnit else q["birlik"].str().orEmpty(), k,
            vol("hajm") ?: 0.0, vol("bajarilgan_hajm"), vol("qabul_hajm"),
            q["usta_narx_birlik"].num() ?: if (workerUnit != null && koef != null) null else q["usta_narx"].num(),
        )
    }
    return NaryadDetail(
        n["id"].num()?.toLong() ?: return null, n["obyekt_id"].num()?.toLong() ?: 0L, n["obyekt_nom"].str(), n["raqam"].str().orEmpty(), n["holat"].str() ?: "berildi",
        n["versiya"].num()?.toInt() ?: 0, n["usta_nom"].str().orEmpty(), n["brigada"].str(), n["izoh"].str(), n["usta_izoh"].str(), n["davr_dan"].str(), n["davr_gacha"].str(),
        n["xarajat_summa"].num(), n["yaratildi"].str(), lines,
    )
}

/** `{ok:true, natija:{ok:true, ...}}` -> the inner object; a flat `{ok:true, ...}` body is accepted too; `ok:false` -> null. */
internal fun natija(body: JsonElement?): JsonObject? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val inner = o["natija"].obj() ?: return o
    if ((inner["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return inner
}

/** null = ok, otherwise the field that is wrong: hajm (volume must be above zero, no minus - a report is never negative). */
fun validateReport(hajm: BigDecimal?): String? = if (hajm == null || hajm.signum() <= 0) "hajm" else null

/** How many OTHER lines of the same work order still have nothing reported (0 = this is the last one: the order goes to the foreman). */
fun othersUnreported(lines: List<NaryadLine>, lineId: Long): Int = lines.count { it.id != lineId && it.bajarilgan == null }

/**
 * The write body. The worker types the volume in HIS unit; the server wants the estimate unit, so volume x koef (rounded to 8 significant
 * digits like the web). Only the edited line is sent: other lines keep what they already carry (the RPC ignores lines that are not listed).
 */
fun reportPayload(companyId: Long, naryadId: Long, versiya: Int, line: NaryadLine, hajmUsta: BigDecimal, note: String?, done: Boolean, operationId: String): JsonObject = buildJsonObject {
    put("amal", AMAL_NARYAD_USTA); put("naryad_amal", "bajarildi"); put("kompaniya_id", companyId)
    put("naryad_id", naryadId); put("kutilgan_versiya", versiya); put("operation_id", operationId)
    put("qatorlar", buildJsonArray {
        add(buildJsonObject {
            put("id", line.id)
            put("bajarilgan_hajm", hajmUsta.multiply(BigDecimal.valueOf(line.koef)).round(MathContext(8)).toDouble())
        })
    })
    put("tugadi", done)
    note?.trim()?.takeIf { it.isNotEmpty() }?.let { put("izoh", it.take(500)) }
}

fun naryadSteps(holat: String): List<Pair<String, Int>> {
    // state: 1 = reached, 0 = current, -1 = ahead; bekor is a side exit.
    if (holat == "bekor") return listOf("berildi" to 1, "bekor" to 0)
    val flow = listOf("berildi", "bajarildi", "qabul", "hisoblandi")
    val at = flow.indexOf(holat).let { if (it < 0) 0 else it }
    return flow.mapIndexed { i, c -> c to (if (i < at) 1 else if (i == at) 0 else -1) }
}

/** Short title of a queued report for the outbox card. */
fun summarizeReport(payload: String): String? {
    val o = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(payload) }.getOrNull().obj() ?: return null
    if (o["amal"].str() != AMAL_NARYAD_USTA) return null
    return "#" + o["naryad_id"].str().orEmpty()
}
