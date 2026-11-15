package uz.anncorp.smeta.core.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.DraftEntity
import uz.anncorp.smeta.core.db.MetaEntity
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.db.QatorEntity
import uz.anncorp.smeta.core.db.ftsMatch
import java.time.LocalDate
import java.util.UUID

/** The workplace (company + role) currently selected in the shell; feature screens read it. */
class WorkContext {
    private val _current = MutableStateFlow<Workplace?>(null)
    val current: StateFlow<Workplace?> = _current.asStateFlow()
    fun set(w: Workplace?) { _current.value = w }
}

/** Online/offline as the OS sees it (a debug build can force offline for screenshots). */
class ConnectivityMonitor(private val context: Context, private val forced: () -> Boolean? = { null }) {
    val online: Flow<Boolean> = callbackFlow {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        fun now() = forced()?.let { !it } ?: cm?.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED).let { it == true }
        trySend(now())
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(now()) }
            override fun onLost(network: Network) { trySend(now()) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { trySend(now()) }
        }
        cm?.registerDefaultNetworkCallback(cb)
        awaitClose { cm?.unregisterNetworkCallback(cb) }
    }.distinctUntilChanged()
}

sealed interface SyncResult {
    data object Ok : SyncResult
    data object Offline : SyncResult
    /** The server said this user may not read it (403): the UI shows what is allowed instead. */
    data object Forbidden : SyncResult
    data class Failed(val code: String?) : SyncResult
}

private fun ApiResult.failure(): SyncResult = when {
    networkError -> SyncResult.Offline
    status == 403 -> SyncResult.Forbidden
    else -> SyncResult.Failed(code ?: "HTTP $status")
}

class ObjectsRepository(private val api: BffApi, private val db: AppDb, private val now: () -> Long = System::currentTimeMillis) {
    fun observe(companyId: Long): Flow<List<ObyektEntity>> = db.obyekt().observe(companyId)
    fun observeOne(id: Long): Flow<ObyektEntity?> = db.obyekt().observeOne(id)
    fun lastUpdated(companyId: Long): Flow<Long?> = db.meta().observe("objects_ts:$companyId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long): SyncResult {
        val r = api.bff("/api/sb", "POST", objectsRequest(companyId))
        if (!r.ok) return r.failure()
        val rows = parseSb(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.obyekt().replaceForCompany(companyId, parseObjects(rows.rows, companyId))
        db.meta().put(MetaEntity("objects_ts:$companyId", now().toString()))
        return SyncResult.Ok
    }
}

/**
 * Server-computed sum packages (estimate / fact / F-2, each QQS-inclusive + with markup + without markup) cached per object.
 * Source: `rahbar_panel_v1` through /api/sb (company-wide for the list, single object for the card). Needs the financial read
 * right; without it the call is refused (403) and the UI shows only what is known (see [displayMoney]).
 */
class MoneyRepository(private val api: BffApi, private val db: AppDb, private val json: Json) {
    fun observe(obyektId: Long): Flow<ObjectMoney?> = db.meta().observe("money:$obyektId").map { s -> s?.let { runCatching { json.decodeFromString<ObjectMoney>(it) }.getOrNull() } }

    fun observeAll(): Flow<Map<Long, ObjectMoney>> = db.meta().observePrefix("money:").map { list ->
        list.mapNotNull { m -> m.key.removePrefix("money:").toLongOrNull()?.let { id -> runCatching { json.decodeFromString<ObjectMoney>(m.value) }.getOrNull()?.let { id to it } } }.toMap()
    }

    suspend fun refreshCompany(companyId: Long): SyncResult = fetch(rahbarPanelRequest(companyId))
    suspend fun refreshObject(companyId: Long, obyektId: Long): SyncResult = fetch(rahbarPanelRequest(companyId, obyektId))

    private suspend fun fetch(req: kotlinx.serialization.json.JsonObject): SyncResult {
        val r = api.bff("/api/sb", "POST", req)
        if (!r.ok) return r.failure()
        val map = parseRahbarPanel(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        map.forEach { (id, m) -> db.meta().put(MetaEntity("money:$id", json.encodeToString(m))) }
        return SyncResult.Ok
    }
}

/** Which source filled the cached rows of an object. */
object RowSource { const val PACKET = "paket"; const val TABLE = "sb" }

class RowsRepository(private val api: BffApi, private val db: AppDb, private val json: Json, private val now: () -> Long = System::currentTimeMillis) {
    fun totals(obyektId: Long): Flow<Totals?> = db.meta().observe("totals:$obyektId").map { s -> s?.let { runCatching { json.decodeFromString<Totals>(it) }.getOrNull() } }
    fun lastUpdated(obyektId: Long): Flow<Long?> = db.meta().observe("rows_ts:$obyektId").map { it?.toLongOrNull() }
    fun source(obyektId: Long): Flow<String?> = db.meta().observe("rows_src:$obyektId")
    fun rowCount(obyektId: Long): Flow<Int> = db.qator().observeCount(obyektId)

    /** [bolim] = section filter (null = all sections). */
    fun search(obyektId: Long, query: String, bolim: String? = null, limit: Int = 100): Flow<List<QatorEntity>> {
        val m = ftsMatch(query) ?: return db.qator().first(obyektId, bolim, limit)
        return db.qator().search(obyektId, m, bolim, limit)
    }

    fun sections(obyektId: Long): Flow<List<String>> = db.qator().sections(obyektId)

    /** Global search over rows already cached on this device (objects opened before). Empty when the query has no searchable word. */
    suspend fun searchCompany(companyId: Long, query: String, limit: Int = 20): List<QatorEntity> {
        val m = ftsMatch(query) ?: return emptyList()
        return db.qator().searchCompany(companyId, m, limit)
    }

    /**
     * Fills the local row cache. Preferred source is the object packet (one call, ETag 304 when unchanged); a 403 there
     * (no smeta/F-2/price read) falls back to the per-row status table, which a field role may still be allowed to read.
     */
    suspend fun sync(obyektId: Long): SyncResult {
        val meta = db.meta()
        val haveRows = db.qator().count(obyektId) > 0
        val etag = if (haveRows && meta.get("rows_src:$obyektId") == RowSource.PACKET) meta.get("paket_etag:$obyektId") else null
        val p = api.bff("/api/obyekt-paket?obyekt_id=$obyektId", etag = etag)
        if (p.status == 304) { touch(obyektId); return SyncResult.Ok }
        if (p.ok) {
            val data = parsePaket(p.body)?.takeIf { it.obyektId == obyektId } ?: return SyncResult.Failed("BAD_SHAPE")
            store(obyektId, data.rows, RowSource.PACKET, p.etag)
            return SyncResult.Ok
        }
        if (p.status != 403) return p.failure()
        val t = api.bff("/api/sb", "POST", holatRequest(obyektId))
        if (!t.ok) return t.failure()
        val rows = parseSb(t.body) ?: return SyncResult.Failed("BAD_SHAPE")
        if (!rows.complete) return SyncResult.Failed("INCOMPLETE")
        store(obyektId, parseHolatRows(obyektId, rows.rows), RowSource.TABLE, null)
        return SyncResult.Ok
    }

    private suspend fun store(obyektId: Long, rows: List<QatorEntity>, src: String, etag: String?) {
        db.qator().replaceForObyekt(obyektId, rows)
        val m = db.meta()
        m.put(MetaEntity("rows_src:$obyektId", src))
        if (etag != null) m.put(MetaEntity("paket_etag:$obyektId", etag))
        m.put(MetaEntity("totals:$obyektId", json.encodeToString(computeTotals(rows))))
        touch(obyektId)
    }

    private suspend fun touch(obyektId: Long) = db.meta().put(MetaEntity("rows_ts:$obyektId", now().toString()))
}

/** Draft batch + queueing. В«SaveВ» only ever puts the batch in the outbox; sending is the worker's job. */
class FaktRepository(
    private val db: AppDb, private val outbox: OutboxRepository, private val json: Json,
    private val now: () -> Long = System::currentTimeMillis, private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    fun drafts(obyektId: Long): Flow<List<DraftEntity>> = db.draft().observe(obyektId)

    suspend fun addToDraft(row: QatorEntity, hajm: Double) {
        db.draft().upsert(DraftEntity(row.obyektId, row.qatorId, hajm, row.kod, row.nom, row.birlik, row.smetaHajm, row.faktHajm, row.almashtirilgan, now()))
    }
    suspend fun addToDraftFromEntity(d: DraftEntity, hajm: Double) = db.draft().upsert(d.copy(hajm = hajm))
    suspend fun removeFromDraft(obyektId: Long, qatorId: Long) = db.draft().delete(obyektId, qatorId)
    suspend fun clearDraft(obyektId: Long) = db.draft().clear(obyektId)

    /** A field role (usta) may only create approval drafts; every other role writes the fact itself. */
    fun amalFor(role: String): String = if (role.equals("usta", ignoreCase = true)) AMAL_USTA_DRAFT else AMAL_FAKT

    /** Moves the draft into the outbox in one step. Returns the operation id, or null if the draft is empty. */
    suspend fun save(companyId: Long, role: String, obyektId: Long, obyektNom: String, sana: LocalDate): String? {
        val lines = db.draft().list(obyektId)
        if (lines.isEmpty()) return null
        val opId = newId()
        val amal = amalFor(role)
        val payload = faktPayload(amal, companyId, obyektId, sana.toString(), lines.map { FaktLine(it.qatorId, it.hajm) }, opId)
        outbox.enqueue(OutboxEntity(opId, amal, payload.toString(), obyektId, obyektNom, lines.size, OutboxState.PENDING, 0, null, null, now()))
        db.draft().clear(obyektId)
        return opId
    }

    /** В«EditВ» of a rejected write: its lines go back to the draft (current row data) and the failed entry is removed. */
    suspend fun reopenAsDraft(id: String): Long? {
        val e = outbox.get(id) ?: return null
        val lines = parseFaktPayload(e.payloadJson) ?: return null
        lines.forEach { l ->
            val row = db.qator().get(e.obyektId, l.qatorId)
            db.draft().upsert(
                DraftEntity(e.obyektId, l.qatorId, l.hajm, row?.kod, row?.nom ?: "#${l.qatorId}", row?.birlik, row?.smetaHajm, row?.faktHajm ?: 0.0, row?.almashtirilgan ?: 0.0, now()),
            )
        }
        outbox.delete(id)
        return e.obyektId
    }
}

fun parseFaktPayload(payload: String): List<FaktLine>? = runCatching {
    val o = Json.parseToJsonElement(payload).obj() ?: return null
    o["qatorlar"].arr()?.mapNotNull { e -> e.obj()?.let { FaktLine(it["qator_id"].num()?.toLong() ?: return@mapNotNull null, it["hajm"].num() ?: return@mapNotNull null) } }
}.getOrNull()


