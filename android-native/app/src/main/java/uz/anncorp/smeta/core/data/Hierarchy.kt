package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity

/**
 * Source of the Loyiha > Shartnoma > Obyekt grouping (4 tenant-scoped /api/sb reads, see ObjectTree.kt) cached per company so the tree also
 * opens offline. A refused / failed read keeps the previous copy; null = never read (the screens show the plain list).
 */
class HierarchyRepository(private val api: BffApi, private val db: AppDb, private val json: Json) {
    fun observe(companyId: Long): Flow<HierarchySource?> = db.meta().observe("hier:$companyId").map { raw ->
        raw?.let { runCatching { parseHierarchyBody(json.parseToJsonElement(it)) }.getOrNull() }
    }

    suspend fun refresh(companyId: Long): SyncResult {
        val r = fetchHierarchy(api, companyId)
        if (!r.ok) return r.syncFailure()
        val body = r.body ?: return SyncResult.Failed("BAD_SHAPE")
        if (parseHierarchyBody(body) == null) return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("hier:$companyId", body.toString()))
        return SyncResult.Ok
    }
}