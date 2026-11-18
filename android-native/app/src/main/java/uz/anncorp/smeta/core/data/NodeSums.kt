package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity

/*
 * Per-node sums of the estimate tree (RZ / BL). The SERVER computes them with the single smeta core (GET /api/obyekt-tugun-summa:
 * kesim -> ustamaliHisobla(podval) -> qiymatUchligi); the device only shows them. null = unknown (never 0); a negative value keeps its sign.
 * Wire: tugunlar = [[id, [qqsBilan, ustamali, ustamasiz] (smeta), [..] (fakt), [..] (F-2)]].
 */

/** One amount in the three forms. [qqsBilan] is the main figure; when the object has no markup source only [ustamasiz] is known. */
data class Forms(val qqsBilan: Double?, val ustamali: Double?, val ustamasiz: Double?) {
    val complete get() = qqsBilan != null && ustamali != null && ustamasiz != null

    // Formatted once, where the pack is parsed (off the main thread), not while the list scrolls.
    val qqsText: String = formatMoney(qqsBilan)
    val ustamaliText: String = formatMoney(ustamali)
    val ustamasizText: String = formatMoney(ustamasiz)
}

data class NodeSums(val smeta: Forms, val fakt: Forms, val f2: Forms)

/** [hasMarkup] false = the server found no markup (podval / coefficients) for this object: only the markup-free sums are shown, with a note. */
data class NodeSumsPack(val hasMarkup: Boolean, val nodes: Map<Long, NodeSums>)

private fun forms(e: JsonElement?): Forms {
    val a = e as? JsonArray ?: return Forms(null, null, null)
    fun at(i: Int) = (a.getOrNull(i) as? JsonPrimitive)?.takeIf { it.content != "null" }?.content?.toDoubleOrNull()
    return Forms(at(0), at(1), at(2))
}

/** Pure. Null for any other shape (never a half-filled pack). */
fun parseNodeSums(body: JsonElement?): NodeSumsPack? {
    val root = body as? JsonObject ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list = root["tugunlar"] as? JsonArray ?: return null
    val nodes = HashMap<Long, NodeSums>(list.size * 2)
    for (e in list) {
        val a = e as? JsonArray ?: continue
        val id = (a.getOrNull(0) as? JsonPrimitive)?.content?.toLongOrNull() ?: continue
        nodes[id] = NodeSums(forms(a.getOrNull(1)), forms(a.getOrNull(2)), forms(a.getOrNull(3)))
    }
    return NodeSumsPack((root["ustama"] as? JsonPrimitive)?.content == "bor", nodes)
}

class NodeSumsRepository(private val api: BffApi, private val db: AppDb, private val json: Json) {
    /** Cached raw answer (works offline); parsed off the main thread. */
    fun observe(obyektId: Long): Flow<NodeSumsPack?> = db.meta().observe("tugun:$obyektId").map { s ->
        s?.let { runCatching { parseNodeSums(json.parseToJsonElement(it)) }.getOrNull() }
    }.flowOn(Dispatchers.Default)

    /** A failed call keeps the previous cache (the tree still shows the markup-free server sums). */
    suspend fun refresh(obyektId: Long): SyncResult {
        val r = api.bff("/api/obyekt-tugun-summa?obyekt_id=$obyektId")
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        if (parseNodeSums(r.body) == null) return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("tugun:$obyektId", r.body.toString()))
        return SyncResult.Ok
    }
}