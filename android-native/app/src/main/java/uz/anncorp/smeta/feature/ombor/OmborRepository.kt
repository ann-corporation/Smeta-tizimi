package uz.anncorp.smeta.feature.ombor

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Placeholder hook for the nakladnaya (delivery note) photo. The photo feature plugs in here later; nothing is attached today. */
fun interface NakladnayaPhotoHook { fun attach(operationId: String) }

private val NoPhoto = NakladnayaPhotoHook { }

/**
 * Warehouse reads (cached in the existing key/value `meta` table, so there is no schema change and the list works offline)
 * and writes (queued in the shared outbox as kind `skladga_yozish` / `sklad_berdim_v1`; the outbox id IS the operation_id).
 */
@Singleton
class OmborRepository @Inject constructor(
    private val api: BffApi, private val db: AppDb, private val outbox: OutboxRepository, private val json: Json,
) {
    private val rowsSer = ListSerializer(StockRow.serializer())
    private val whSer = ListSerializer(Warehouse.serializer())
    var photoHook: NakladnayaPhotoHook = NoPhoto

    private fun <T> decode(s: String?, ser: kotlinx.serialization.KSerializer<List<T>>): List<T> =
        s?.let { runCatching { json.decodeFromString(ser, it) }.getOrNull() }.orEmpty()

    fun objectStock(companyId: Long): Flow<List<StockRow>> = db.meta().observe("ombor_obj:$companyId").map { decode(it, rowsSer) }
    fun warehouses(companyId: Long): Flow<List<Warehouse>> = db.meta().observe("ombor_wh:$companyId").map { decode(it, whSer) }
    fun centralStock(companyId: Long, skladId: Long): Flow<List<StockRow>> = db.meta().observe("ombor_c:$companyId:$skladId").map { decode(it, rowsSer) }
    fun updated(companyId: Long): Flow<Long?> = db.meta().observe("ombor_ts:$companyId").map { it?.toLongOrNull() }

    private fun failure(r: uz.anncorp.smeta.core.data.ApiResult): SyncResult = when {
        r.networkError -> SyncResult.Offline
        r.status == 403 -> SyncResult.Forbidden
        else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}")
    }

    private suspend fun rows(body: JsonObject): Pair<List<JsonObject>?, SyncResult> {
        val r = api.bff("/api/sb", "POST", body)
        if (!r.ok) return null to failure(r)
        val p = parseSb(r.body) ?: return null to SyncResult.Failed("BAD_SHAPE")
        return p.rows to SyncResult.Ok
    }

    /** Object stock and the warehouse list. A failed half keeps the previous cache of that half. */
    suspend fun refresh(companyId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val (stock, r1) = rows(objectStockRequest(companyId))
        if (stock != null) db.meta().put(MetaEntity("ombor_obj:$companyId", json.encodeToString(rowsSer, parseObjectStock(stock))))
        val (wh, r2) = rows(warehousesRequest(companyId))
        if (wh != null) db.meta().put(MetaEntity("ombor_wh:$companyId", json.encodeToString(whSer, parseWarehouses(wh))))
        if (stock != null || wh != null) db.meta().put(MetaEntity("ombor_ts:$companyId", now.toString()))
        return if (r1 != SyncResult.Ok) r1 else r2
    }

    suspend fun refreshCentral(companyId: Long, skladId: Long): SyncResult {
        val r = api.bff("/api/sb", "POST", centralStockRequest(companyId, skladId))
        if (!r.ok) return failure(r)
        val parsed = parseCentralStock(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("ombor_c:$companyId:$skladId", json.encodeToString(rowsSer, parsed)))
        return SyncResult.Ok
    }

    /**
     * Queues one write. Returns false when this operation id is already queued (a double tap): nothing new is created.
     * [obyektId]/[obyektNom] are what the outbox list shows (the object the stock goes to or comes from).
     */
    suspend fun queue(
        payload: JsonObject, kind: String, operationId: String, obyektId: Long, obyektNom: String,
        now: Long = System.currentTimeMillis(),
    ): Boolean {
        require(isOmborKind(kind))
        val fresh = outbox.enqueue(OutboxEntity(operationId, kind, payload.toString(), obyektId, obyektNom, 1, OutboxState.PENDING, 0, null, null, now))
        if (fresh) photoHook.attach(operationId)
        return fresh
    }

    suspend fun hasEntry(operationId: String): Boolean = outbox.get(operationId) != null

    /** The storekeeper's last QQS choice for a receipt price ("bilan" = with QQS, the default; "siz" = without), remembered per warehouse. */
    suspend fun priceMode(companyId: Long, skladId: Long): String = if (db.meta().get("ombor_qqs:$companyId:$skladId") == "siz") "siz" else "bilan"
    suspend fun setPriceMode(companyId: Long, skladId: Long, mode: String) { db.meta().put(MetaEntity("ombor_qqs:$companyId:$skladId", if (mode == "siz") "siz" else "bilan")) }

    fun newOperationId(): String = UUID.randomUUID().toString()
}
