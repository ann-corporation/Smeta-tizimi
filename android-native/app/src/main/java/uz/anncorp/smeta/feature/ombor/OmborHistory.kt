package uz.anncorp.smeta.feature.ombor

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import javax.inject.Inject
import javax.inject.Singleton

/*
 * Warehouse movement history: the incoming (kirim, `prixod`) and outgoing (chiqim, `rasxod`) lists and the history of one material.
 * Read: /api/sb jadval `t2_sklad_harakat` (the table both the web warehouse page and `t2_skladga_yozish` write to). The contract part is pure
 * Kotlin; the repository below keeps the cached copy in the key/value store (Room today) so the lists open offline.
 */

@Serializable
data class OmborMove(
    val id: Long, val objectId: Long?, val op: String, val nomi: String, val birligi: String, val qty: Double?, val date: String?, val note: String?, val by: String?,
) {
    val isIncoming: Boolean get() = op == "prixod"
}

fun historyRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_sklad_harakat"); put("filtr", "kompaniya_id=eq.$companyId"); put("tartib", "sana.desc,id.desc"); put("limit", 1000)
}

/** Only receive / issue rows are shown; anything else (cancellations, transfers written by other tools) is skipped, never guessed. */
fun parseHistory(rows: List<JsonObject>): List<OmborMove> = rows.mapNotNull { r ->
    val op = r["operatsiya"].str()?.lowercase()?.takeIf { it == "prixod" || it == "rasxod" } ?: return@mapNotNull null
    OmborMove(
        r["id"].num()?.toLong() ?: return@mapNotNull null, r["obyekt_id"].num()?.toLong(), op, r["nomi"].str().orEmpty(), r["birligi"].str().orEmpty(),
        r["obyomi"].num(), r["sana"].str()?.take(10), r["izoh"].str()?.takeIf { it.isNotBlank() }, r["kim"].str()?.takeIf { it.isNotBlank() },
    )
}

/** Incoming or outgoing list, optionally limited to one object, filtered by the (fuzzy) query, newest first (the server order is kept). */
fun filterMoves(all: List<OmborMove>, incoming: Boolean, scope: OmborScope, query: String): List<OmborMove> {
    val scoped = all.filter { it.isIncoming == incoming && (scope !is OmborScope.Obyekt || it.objectId == scope.id) }
    return scoped.filter { matchesQuery(it.nomi, query) }
}

/** History of one material (same name and unit), both directions, newest first. */
fun materialHistory(all: List<OmborMove>, nomi: String, birligi: String, objectId: Long?): List<OmborMove> {
    val key = searchKey(nomi)
    return all.filter { searchKey(it.nomi) == key && it.birligi.equals(birligi, ignoreCase = true) && (objectId == null || it.objectId == objectId) }
}

@Singleton
class OmborHistoryRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val json: Json) {
    private val ser = ListSerializer(OmborMove.serializer())

    fun observe(companyId: Long): Flow<List<OmborMove>> = db.meta().observe("ombor_mv:$companyId").map { s ->
        s?.let { runCatching { json.decodeFromString(ser, it) }.getOrNull() }.orEmpty()
    }

    suspend fun refresh(companyId: Long): SyncResult {
        val r = api.bff("/api/sb", "POST", historyRequest(companyId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val rows = parseSb(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("ombor_mv:$companyId", json.encodeToString(ser, parseHistory(rows.rows))))
        return SyncResult.Ok
    }
}
