package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import javax.inject.Inject
import javax.inject.Singleton

/*
 * Nakopitelniy (cumulative statement) of an object, native view. The statement itself is built ONLY by the server document engine
 * (POST /api/hujjat-yarat, tur `nakopitelniy`, one per approved F-2 month; also `slichitelniy` and `ostatka` per object): the app
 * asks which documents exist for the object, shows them beside the F-2 acts they belong to and downloads the final XLSX/PDF. The progress
 * numbers (fact / F-2 / F-3 percent and the accepted-F-2 sum package) are the object's server package from `rahbar_panel_v1`; no figure is
 * calculated on the device. The row-by-row cumulative table is a very large read that the mobile gateway does not expose, so it stays on the
 * website (a button opens it).
 */

/** One statement month: the server document (when it exists) and the F-2 act of that month (when known). */
data class NakopMonth(val month: String, val doc: GenItem?, val actNumber: String?, val status: F2Status?) {
    /** A statement exists only for an approved F-2 month; this is the document the server announces. */
    val ready: Boolean get() = doc != null
}

data class NakopView(val months: List<NakopMonth>, val others: List<GenItem>)

/** `nakopitelniy:2026-10` -> `2026-10`; anything else -> null. */
internal fun nakopMonthOf(key: String): String? = key.substringAfter("nakopitelniy:", "").takeIf { Regex("^\\d{4}-\\d{2}$").matches(it) }

/**
 * Newest month first. A month appears when the server offers its statement OR when the object has an F-2 act of that month (so the user also
 * sees months whose statement is not available yet). `slichitelniy` / `ostatka` come as the object's other documents.
 */
fun buildNakopView(gen: List<GenItem>, acts: List<F2Act>): NakopView {
    val docs = gen.filter { it.type == "nakopitelniy" }.mapNotNull { g -> nakopMonthOf(g.key)?.let { it to g } }.toMap()
    val actByMonth = acts.filter { it.state != F2Status.CANCELLED && it.state != F2Status.SUPERSEDED }
        .mapNotNull { a -> a.oy?.take(7)?.let { it to a } }.groupBy({ it.first }, { it.second })
    val months = (docs.keys + actByMonth.keys).distinct().sortedDescending().map { m ->
        val act = actByMonth[m]?.let { l -> l.firstOrNull { it.state == F2Status.APPROVED } ?: l.first() }
        NakopMonth(m, docs[m], act?.raqam, act?.state)
    }
    return NakopView(months, gen.filter { it.type == "slichitelniy" || it.type == "ostatka" })
}

/** Month `2026-10` -> `10.2026` (same label as the F-2 list). */
fun nakopMonthLabel(month: String): String = f2MonthLabel(month) ?: month

@Singleton
class NakopRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val json: Json) {
    /** Cached document list of the object (the server decides what exists; the copy only keeps the screen readable offline). */
    fun observe(companyId: Long, objectId: Long): Flow<List<GenItem>?> = db.meta().observe("gen:$companyId:$objectId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<GenItem>>(it) }.getOrNull() }
    }

    fun lastUpdated(companyId: Long, objectId: Long): Flow<Long?> = db.meta().observe("gen_ts:$companyId:$objectId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long, objectId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff(GEN_PATH, "POST", genListRequestBody(companyId, objectId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val items = parseGenList(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("gen:$companyId:$objectId", json.encodeToString(items)))
        db.meta().put(MetaEntity("gen_ts:$companyId:$objectId", now.toString()))
        return SyncResult.Ok
    }
}
