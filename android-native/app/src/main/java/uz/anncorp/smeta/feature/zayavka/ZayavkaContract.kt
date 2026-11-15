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
    )
}