package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity

class F2Repository(private val api: BffApi, private val db: AppDb, private val json: Json) {
    fun observe(obyektId: Long): Flow<List<F2Act>?> = db.meta().observe("f2list:$obyektId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<F2Act>>(it) }.getOrNull() }
    }

    fun lastUpdated(obyektId: Long): Flow<Long?> = db.meta().observe("f2list_ts:$obyektId").map { it?.toLongOrNull() }

    suspend fun refresh(obyektId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff("/api/sb", "POST", f2ListRequest(obyektId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val acts = parseF2List(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("f2list:$obyektId", json.encodeToString(acts)))
        db.meta().put(MetaEntity("f2list_ts:$obyektId", now.toString()))
        return SyncResult.Ok
    }
}
