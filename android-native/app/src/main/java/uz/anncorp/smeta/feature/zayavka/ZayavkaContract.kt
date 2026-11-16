package uz.anncorp.smeta.feature.zayavka

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str
import java.math.BigDecimal

/*
 * Material request ("Material so'rovi", web: "Zayavka") wire contract. Same server logic as the web module
 * (frontend/src/api/t2-zayavka.ts): write = /api/sb-yoz { amal: erp_amal, operatsiya: zayavka_yarat, payload }, read = /api/sb jadval
 * t2_zayavka_royxat. The outbox id IS the operation_id, so a replay never creates a second request. Pure (no Android): unit-tested.
 */

const val AMAL_ZAYAVKA = "erp_amal"
const val OP_ZAYAVKA_YARAT = "zayavka_yarat"

fun isZayavkaKind(kind: String) = kind == AMAL_ZAYAVKA

/** procurement.write: prorab, pto, taminotchi and the full-access roles (frontend effective-authorization.ts ROLE_PERMISSIONS). */
fun canRequestMaterial(role: String?): Boolean = role.orEmpty().trim().lowercase() in setOf("superadmin", "admin", "boss", "prorab", "pto", "taminotchi")

val PRIORITIES = listOf("past", "orta", "yuqori")

/** Free text typed for the optional "smeta qatori" is kept in the note (the server payload has no row field): "BL 311-01 - note". */
fun composeNote(blCode: String, note: String): String? {
    val bl = blCode.trim().take(40)
    val n = note.trim().take(400)
    return listOf(if (bl.isEmpty()) "" else "BL $bl", n).filter { it.isNotEmpty() }.joinToString(" \u00B7 ").ifEmpty { null }
}

/** null = ok, otherwise the field that is wrong (the screen maps it to a message). */
fun validateRequest(obyektId: Long?, item: String, qty: String, date: String): String? = when {
    obyektId == null || obyektId <= 0 -> "obyekt"
    item.trim().length < 2 -> "nom"
    uz.anncorp.smeta.feature.ombor.parseQuantity(qty) == null -> "miqdor"
    date.isNotBlank() && !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date.trim()) -> "sana"
    else -> null
}

fun requestPayload(
    companyId: Long, obyektId: Long, item: String, qty: BigDecimal, unit: String, date: String, priority: String, note: String?, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", AMAL_ZAYAVKA)
    put("kompaniya_id", companyId)
    put("operatsiya", OP_ZAYAVKA_YARAT)
    put("payload", buildJsonObject {
        put("obyekt_id", obyektId)
        put("material_id", JsonNull)
        put("item_text", item.trim().take(200))
        put("requested_qty", qty.stripTrailingZeros().toPlainString().toDouble())
        if (unit.isBlank()) put("unit", JsonNull) else put("unit", unit.trim().take(20))
        if (date.isBlank()) put("required_date", JsonNull) else put("required_date", date.trim())
        put("priority", priority)
        if (note == null) put("note", JsonNull) else put("note", note)
        put("operation_id", operationId)
    })
}

fun requestsReadBody(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_zayavka_royxat")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("tartib", "created_at.desc")
    put("limit", 300)
}

@Serializable
data class ZayavkaRow(
    val id: Long, val obyektId: Long, val item: String, val qty: Double?, val unit: String?, val status: String,
    val delivered: Double?, val required: String?, val priority: String?, val note: String?, val created: String?,
    /** Server-side remaining quantity (null = the server did not say; never guessed as 0) and the last change stamp. Defaults keep older cached copies readable. */
    val remaining: Double? = null, val updated: String? = null,
)

/** Status words of the web (ProcurementStatus + the old Uzbek ones) folded to the 9 canonical codes. */
fun canonicalStatus(raw: String?): String = when (val s = raw.orEmpty()) {
    "kutilmoqda" -> "submitted"; "tasdiqlandi" -> "approved"; "yopildi" -> "delivered"; "rad" -> "cancelled"
    "draft", "submitted", "approved", "procurement", "ordered", "partially_delivered", "delivered", "closed", "cancelled" -> s
    else -> "draft"
}

fun parseRequests(rows: List<JsonObject>): List<ZayavkaRow> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    ZayavkaRow(
        id, r["obyekt_id"].num()?.toLong() ?: 0L, (r["item_text"].str() ?: r["maxsulot"].str()).orEmpty(),
        r["requested_qty"].num() ?: r["miqdor"].num(), r["unit"].str() ?: r["birlik"].str(), canonicalStatus(r["status"].str() ?: r["holat"].str()),
        r["delivered_qty"].num() ?: r["etkazilgan"].num(), r["required_date"].str() ?: r["sana_kerak"].str(), r["priority"].str() ?: r["prioritet"].str(),
        r["note"].str() ?: r["izoh"].str(), r["created_at"].str() ?: r["yaratilgan_vaqt"].str(),
        r["remaining_qty"].num(), r["updated_at"].str(),
    )
}

// ---------- tracking: filter groups, status timeline, delivery progress ----------

/** Filter chips of the tracking list. */
enum class StatusGroup { ALL, OPEN, DELIVERING, DONE, CANCELLED }

fun statusGroup(code: String): StatusGroup = when (code) {
    "draft", "submitted", "approved", "procurement" -> StatusGroup.OPEN
    "ordered", "partially_delivered" -> StatusGroup.DELIVERING
    "delivered", "closed" -> StatusGroup.DONE
    "cancelled" -> StatusGroup.CANCELLED
    else -> StatusGroup.OPEN
}

/** Rows of a group per object / free text (name, note); text matches case-insensitively. */
fun filterRequests(rows: List<ZayavkaRow>, group: StatusGroup, obyektId: Long?, query: String): List<ZayavkaRow> {
    val q = query.trim()
    return rows.filter { r ->
        (group == StatusGroup.ALL || statusGroup(r.status) == group) && (obyektId == null || r.obyektId == obyektId) &&
            (q.isEmpty() || r.item.contains(q, ignoreCase = true) || r.note.orEmpty().contains(q, ignoreCase = true))
    }
}

fun groupCounts(rows: List<ZayavkaRow>): Map<StatusGroup, Int> =
    StatusGroup.values().associateWith { g -> if (g == StatusGroup.ALL) rows.size else rows.count { statusGroup(it.status) == g } }

/** The canonical route of a request (the server's ProcurementStatus order). `cancelled` is a side exit, not a step. */
val STATUS_FLOW = listOf("draft", "submitted", "approved", "procurement", "ordered", "partially_delivered", "delivered", "closed")

enum class StepState { DONE, CURRENT, TODO, CANCELLED }
data class TimelineStep(val code: String, val state: StepState)

/**
 * Steps reached so far, the current one and what is still ahead. A cancelled request shows what was reached (we only know it was
 * submitted) followed by the cancelled terminal step - the server keeps no per-step history, so nothing else is invented.
 */
fun timeline(status: String): List<TimelineStep> {
    if (status == "cancelled") return listOf(TimelineStep("submitted", StepState.DONE), TimelineStep("cancelled", StepState.CANCELLED))
    val at = STATUS_FLOW.indexOf(status).let { if (it < 0) 0 else it }
    return STATUS_FLOW.mapIndexed { i, c -> TimelineStep(c, if (i < at) StepState.DONE else if (i == at) StepState.CURRENT else StepState.TODO) }
}

/** Delivered share 0..1 for the progress bar; null when the quantity is unknown or zero (no fake 0 %). */
fun deliveredFraction(r: ZayavkaRow): Float? {
    val q = r.qty ?: return null
    if (q <= 0.0) return null
    val d = r.delivered ?: return null
    return (d / q).coerceIn(0.0, 1.0).toFloat()
}

/** Still open and past its required date. */
fun isOverdue(r: ZayavkaRow, today: java.time.LocalDate): Boolean {
    val due = r.required?.take(10)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() } ?: return false
    return statusGroup(r.status).let { it != StatusGroup.DONE && it != StatusGroup.CANCELLED } && due.isBefore(today)
}