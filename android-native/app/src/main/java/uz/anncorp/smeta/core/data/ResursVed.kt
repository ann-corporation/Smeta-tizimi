package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import javax.inject.Inject
import javax.inject.Singleton

/*
 * Resource statement (resurs vedomost) of an object for the storekeeper and the estimator: every RESOURCE leaf of the estimate (labour, machines,
 * materials, equipment, cable, metal constructions) added up by category and resource: estimate quantity, F-2 quantity and what is left.
 * Same source and the same grouping as the web page (ResursVedomostNative -> lib/resurs-vedomost.ts `resursVedomostQur` /
 * `resursVedomostKategoriyalarga`): the rows of `t2_qator_holat` (read through /api/sb, one request per resource kind), only rs / mat / ob rows,
 * key `category|name|unit`. This file is a line-by-line port of that aggregation (no new calculation); the golden test in ResursVedTest pins
 * the same totals. Amounts are the plain, markup-free, QQS-free line sums the web statement adds up; the markup variants of the sums depend on
 * the estimate cellar and stay in the web document.
 */

@Serializable
data class ResursLine(
    val cat: String, val code: String?, val name: String, val unit: String?,
    val estQty: Double, val estSum: Double, val f2Qty: Double, val f2Sum: Double, val leftQty: Double, val leftSum: Double,
    val rowCount: Int, val unpricedRows: Int,
)

@Serializable
data class ResursCategory(val cat: String, val lines: List<ResursLine>, val estSum: Double, val f2Sum: Double, val leftSum: Double)

const val RES_COLUMNS = "qator_id,tur,kat,kod,nom,birlik,smeta_hajm,smeta_summa,f2_hajm,f2_summa,qoldiq_hajm,qoldiq_summa"

/** The three resource kinds; one request each (the gateway filter takes `eq.` only). */
val RESOURCE_KINDS = listOf("rs", "mat", "ob")

fun resourceRequest(objectId: Long, tur: String): JsonObject = buildJsonObject {
    put("jadval", "t2_qator_holat"); put("filtr", "obyekt_id=eq.$objectId&tur=eq.$tur"); put("ustunlar", RES_COLUMNS); put("tartib", "qator_id.asc"); put("limit", 200000)
}

// Cyrillic category codes written as escapes so the source file is encoding-proof.
private const val CAT_LAB = "ЧЕЛ"      // CHEL
private const val CAT_MACH = "МАШ"     // MASH
private const val CAT_MAT = "МАТ"      // MAT
private const val CAT_EQ = "ОБ"             // OB
private const val CAT_CABLE = "КАБ"    // KAB
private const val CAT_METAL = "М/К"         // M/K
private val CAT_ORDER = listOf(CAT_LAB, CAT_MACH, CAT_MAT, CAT_EQ, CAT_CABLE, CAT_METAL)
const val CAT_OTHER = "BOSHQA"

/** Machine operators' labour: its price is inside the machine price, so a missing price is not "unpriced" (web `mashinistMehnati`). */
private val OPERATOR_LABOUR = Regex("ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ", RegexOption.IGNORE_CASE)

private fun catRank(cat: String): Int = CAT_ORDER.indexOf(cat).let { if (it < 0) CAT_ORDER.size else it }
private fun catCompare(a: String, b: String): Int = catRank(a).compareTo(catRank(b)).let { if (it != 0) it else a.compareTo(b) }

private fun JsonObject.n(k: String): Double = this[k].num()?.takeIf { it.isFinite() } ?: 0.0

/** Rows of `t2_qator_holat` -> lines per category (web `resursVedomostKategoriyalarga`). Non-resource rows are skipped. */
fun buildResourceStatement(rows: List<JsonObject>): List<ResursCategory> {
    class Acc(val cat: String, var code: String?, val name: String, val unit: String?) {
        var estQty = 0.0; var estSum = 0.0; var f2Qty = 0.0; var f2Sum = 0.0; var leftQty = 0.0; var leftSum = 0.0; var rows = 0; var unpriced = 0
    }
    val groups = LinkedHashMap<String, Acc>()
    for (q in rows) {
        val tur = q["tur"].str()
        if (tur == null || tur !in RESOURCE_KINDS) continue
        val cat = q["kat"].str()?.takeIf { it.isNotEmpty() } ?: CAT_OTHER
        val name = q["nom"].str()?.takeIf { it.isNotEmpty() } ?: "(nomsiz)"
        val unit = q["birlik"].str()?.takeIf { it.isNotEmpty() }
        val acc = groups.getOrPut(cat + "|" + name + "|" + (unit ?: "")) { Acc(cat, q["kod"].str(), name, unit) }
        acc.estQty += q.n("smeta_hajm"); acc.estSum += q.n("smeta_summa")
        acc.f2Qty += q.n("f2_hajm"); acc.f2Sum += q.n("f2_summa")
        acc.leftQty += q.n("qoldiq_hajm"); acc.leftSum += q.n("qoldiq_summa")
        acc.rows += 1
        if (q["smeta_summa"].num() == null && !OPERATOR_LABOUR.containsMatchIn(q["nom"].str().orEmpty())) acc.unpriced += 1
        if (acc.code.isNullOrEmpty()) q["kod"].str()?.takeIf { it.isNotEmpty() }?.let { acc.code = it }
    }
    val lines = groups.values.map { ResursLine(it.cat, it.code, it.name, it.unit, it.estQty, it.estSum, it.f2Qty, it.f2Sum, it.leftQty, it.leftSum, it.rows, it.unpriced) }
        .sortedWith { a, b -> catCompare(a.cat, b.cat).let { if (it != 0) it else a.name.compareTo(b.name, ignoreCase = true) } }
    val byCat = LinkedHashMap<String, MutableList<ResursLine>>()
    for (l in lines) byCat.getOrPut(l.cat) { mutableListOf() }.add(l)
    return byCat.entries.sortedWith { a, b -> catCompare(a.key, b.key) }.map { (cat, list) ->
        ResursCategory(cat, list, list.fold(0.0) { s, r -> s + r.estSum }, list.fold(0.0) { s, r -> s + r.f2Sum }, list.fold(0.0) { s, r -> s + r.leftSum })
    }
}

/** Every query word must be in the resource name or code (case-insensitive); categories without a match drop out. */
fun filterResources(cats: List<ResursCategory>, query: String): List<ResursCategory> {
    val q = normalizeSearch(query.trim())
    if (q.isEmpty()) return cats
    return cats.mapNotNull { c ->
        val l = c.lines.filter { normalizeSearch(it.name + " " + it.code.orEmpty()).contains(q) }
        if (l.isEmpty()) null else c.copy(lines = l)
    }
}

/** Resources whose estimate quantity is not used up yet (what the warehouse still has to supply / issue). */
fun openResources(cats: List<ResursCategory>): List<ResursCategory> =
    cats.mapNotNull { c -> c.lines.filter { it.leftQty > 0.0 }.takeIf { it.isNotEmpty() }?.let { c.copy(lines = it) } }

@Singleton
class ResursRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val json: Json) {
    fun observe(objectId: Long): Flow<List<ResursCategory>?> = db.meta().observe("resurs:$objectId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<ResursCategory>>(it) }.getOrNull() }
    }

    fun lastUpdated(objectId: Long): Flow<Long?> = db.meta().observe("resurs_ts:$objectId").map { it?.toLongOrNull() }

    suspend fun refresh(objectId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val all = ArrayList<JsonObject>()
        for (kind in RESOURCE_KINDS) {
            val r = api.bff("/api/sb", "POST", resourceRequest(objectId, kind))
            if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
            val rows = parseSb(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
            if (!rows.complete) return SyncResult.Failed("INCOMPLETE")
            all += rows.rows
        }
        db.meta().put(MetaEntity("resurs:$objectId", json.encodeToString(buildResourceStatement(all))))
        db.meta().put(MetaEntity("resurs_ts:$objectId", now.toString()))
        return SyncResult.Ok
    }
}
