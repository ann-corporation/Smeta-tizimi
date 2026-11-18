package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
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
import javax.inject.Inject
import javax.inject.Singleton


@Singleton
class F2RegistryRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val json: Json) {
    /** Cached acts for offline reading. */
    fun observe(companyId: Long): Flow<List<RegistryAct>?> = db.meta().observe("f2reg:$companyId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<RegistryAct>>(it) }.getOrNull() }
    }

    fun lastUpdated(companyId: Long): Flow<Long?> = db.meta().observe("f2reg_ts:$companyId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff("/api/sb", "POST", registryRequest(companyId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val acts = parseRegistry(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("f2reg:$companyId", json.encodeToString(acts)))
        db.meta().put(MetaEntity("f2reg_ts:$companyId", now.toString()))
        return SyncResult.Ok
    }
}
