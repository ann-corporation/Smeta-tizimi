package uz.anncorp.smeta.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Company-wide F-2 registry (web: F2Reestr page). Same server read as the web registry: /api/sb `akt_reestr_kompaniya_v1` with tur=f2
 * (frontend/src/api/supabase.ts `sbT2AktReestrKompaniyaOl`): every F-2 act of every object of the company. The per-object counts are plain
 * counts of those acts by lifecycle status; the percentage and the accepted-F-2 sum package are the server's own numbers from the boss panel
 * package (`rahbar_panel_v1`, already cached by [MoneyRepository]), never derived on the device. A document total of an act has no
 * QQS / markup split, so it is not shown here (same rule as the per-object F-2 list).
 */

@Serializable
data class RegistryAct(
    val id: Long, val objectId: Long, val objectName: String?, val number: String?, val month: String?, val status: String?,
    val rows: Int?, val unpriced: Int?, val negativeRows: Int?, val hasDiff: Boolean,
) {
    val state: F2Status get() = F2Status.of(status)
}

fun registryRequest(companyId: Long): JsonObject = buildJsonObject { put("soro", "akt_reestr_kompaniya_v1"); put("kompaniya_id", companyId); put("tur", "f2") }

/** `{ok:true, natija:{ok:true, qatorlar:[...]}}` -> acts of every object. Null for any other shape. */
fun parseRegistry(body: JsonElement?): List<RegistryAct>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val natija = root["natija"].obj() ?: return null
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list: JsonArray = natija["qatorlar"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val id = o["id"].num()?.toLong() ?: return@mapNotNull null
        val oid = o["obyekt_id"].num()?.toLong() ?: return@mapNotNull null
        RegistryAct(
            id, oid, o["obyekt"].str()?.takeIf { it.isNotBlank() }, o["raqam"].str(), o["oy"].str(), o["lifecycle_status"].str(),
            o["qator_soni"].num()?.toInt(), o["narxsiz_qator"].num()?.toInt(), o["manfiy_qator"].num()?.toInt(),
            (o["farq"].num() ?: 0.0).let { kotlin.math.abs(it) > 1.0 },
        )
    }
}

/** One object's line in the registry: counts of acts by stage. Superseded and cancelled acts are history and are not counted. */
data class RegistryRow(
    val objectId: Long, val name: String,
    val approved: Int, val draft: Int, val inFlow: Int, val rejected: Int,
    val unpriced: Int, val lastApprovedMonth: String?, val hasDiff: Boolean,
) {
    val total: Int get() = approved + draft + inFlow + rejected
}

/** Groups the acts per object. [names] (cached object list) fills in the name when the act row carries none; objects without acts are not listed. */
fun buildRegistry(acts: List<RegistryAct>, names: Map<Long, String> = emptyMap()): List<RegistryRow> =
    acts.groupBy { it.objectId }.map { (oid, list) ->
        val live = list.filter { it.state != F2Status.CANCELLED && it.state != F2Status.SUPERSEDED }
        RegistryRow(
            objectId = oid,
            name = list.firstNotNullOfOrNull { it.objectName } ?: names[oid] ?: "#$oid",
            approved = live.count { it.state == F2Status.APPROVED },
            draft = live.count { it.state == F2Status.DRAFT },
            inFlow = live.count { it.state == F2Status.SUBMITTED || it.state == F2Status.CHECKED },
            rejected = live.count { it.state == F2Status.REJECTED },
            unpriced = live.sumOf { it.unpriced ?: 0 },
            lastApprovedMonth = live.filter { it.state == F2Status.APPROVED }.mapNotNull { it.month?.take(7) }.maxOrNull(),
            hasDiff = live.any { it.hasDiff },
        )
    }.sortedWith(compareByDescending<RegistryRow> { it.draft + it.inFlow }.thenBy { it.name.lowercase() })

enum class RegistryFilter { ALL, WITH_DRAFT, IN_FLOW, NO_APPROVED, PROBLEMS }

/** Case-insensitive name search plus one stage filter. Empty query = everything. */
fun filterRegistry(rows: List<RegistryRow>, filter: RegistryFilter, query: String): List<RegistryRow> {
    val q = normalizeSearch(query.trim())
    return rows.filter { r ->
        (q.isEmpty() || normalizeSearch(r.name).contains(q)) && when (filter) {
            RegistryFilter.ALL -> true
            RegistryFilter.WITH_DRAFT -> r.draft > 0
            RegistryFilter.IN_FLOW -> r.inFlow > 0
            RegistryFilter.NO_APPROVED -> r.approved == 0
            RegistryFilter.PROBLEMS -> r.unpriced > 0 || r.hasDiff || r.rejected > 0
        }
    }
}

data class RegistryTotals(val objects: Int, val approved: Int, val draft: Int, val inFlow: Int, val rejected: Int)

fun registryTotals(rows: List<RegistryRow>) = RegistryTotals(rows.size, rows.sumOf { it.approved }, rows.sumOf { it.draft }, rows.sumOf { it.inFlow }, rows.sumOf { it.rejected })

