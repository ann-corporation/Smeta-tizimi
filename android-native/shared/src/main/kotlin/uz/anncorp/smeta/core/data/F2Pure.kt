package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * F-2 acts of an object (read-only). Same server read as the web F-2 registry: /api/sb `akt_reestr_obyekt_v1` with tur=f2
 * (frontend/src/api/supabase.ts `sbT2AktReestrOl`). The act sums in this list are plain document totals without the
 * QQS / markup split, so the app does NOT show them (owner rule: a sum is shown QQS-first with both markup variants);
 * the object's accepted-F-2 sum package comes from the panel read instead, and the full registry opens on the website.
 */

/** Lifecycle of an act (`lifecycle_status`), in the order a document travels. */
enum class F2Status(val code: String) {
    DRAFT("draft"), SUBMITTED("submitted"), CHECKED("checked"), APPROVED("approved"), REJECTED("rejected"), CANCELLED("cancelled"), SUPERSEDED("superseded"), UNKNOWN("");
    companion object { fun of(code: String?): F2Status = entries.firstOrNull { it.code == code && it != UNKNOWN } ?: UNKNOWN }
}

@kotlinx.serialization.Serializable
data class F2Act(
    val id: Long, val obyektId: Long, val raqam: String?, val oy: String?, val status: String?, val rows: Int?, val unpriced: Int?, val negativeRows: Int?, val hasDiff: Boolean,
) {
    val state: F2Status get() = F2Status.of(status)
}

fun f2ListRequest(obyektId: Long): JsonObject = buildJsonObject { put("soro", "akt_reestr_obyekt_v1"); put("obyekt_id", obyektId); put("tur", "f2") }

/** `{ok:true, natija:{ok:true, qatorlar:[...]}}` -> acts, newest month first (the server already orders oy.desc,id.desc). Null for any other shape. */
fun parseF2List(body: JsonElement?): List<F2Act>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val natija = root["natija"].obj() ?: return null
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list: JsonArray = natija["qatorlar"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val id = o["id"].num()?.toLong() ?: return@mapNotNull null
        F2Act(
            id, o["obyekt_id"].num()?.toLong() ?: 0L, (o["raqam"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            (o["oy"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            (o["lifecycle_status"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            o["qator_soni"].num()?.toInt(), o["narxsiz_qator"].num()?.toInt(), o["manfiy_qator"].num()?.toInt(),
            (o["farq"].num() ?: 0.0).let { kotlin.math.abs(it) > 1.0 },
        )
    }
}

/** Month label of an act ("2026-11-01" or "2026-11") -> "11.2026"; anything else is shown as is. */
fun f2MonthLabel(oy: String?): String? {
    val m = oy?.let { Regex("^(\\d{4})-(\\d{2})").find(it) } ?: return oy
    return "${m.groupValues[2]}.${m.groupValues[1]}"
}

