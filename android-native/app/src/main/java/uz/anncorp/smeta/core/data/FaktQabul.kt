package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.inject.Singleton

/*
 * Acceptance (qabul) of fact entered by a foreman / master from the phone. The master's volumes wait as drafts (`t2_usta_fakt_qoralama`);
 * the person with the fact-write right accepts them (the server writes the real fact through `fakt_yoz_v2`) or rejects them with a remark
 * that the master sees. Same read and same write as the web "Tasdiqlash kutilmoqda" block of the Fact page
 * (frontend/src/api/t2-usta.ts: `sbUstaQoralamalarOl`, `sbUstaQaror` -> /api/sb-yoz `usta_fakt_qaror_v1`). The server re-checks the right and
 * the PIN / biometric step-up (the API client confirms it and retries). The app never writes fact itself and never calculates a sum here.
 * An outside technical supervisor has no fact-write right: for that party the server answers "forbidden" and the screen says so.
 */

/** One pending draft row. */
@Serializable
data class PendingFakt(
    val id: Long, val objectId: Long, val rowId: Long, val date: String, val qty: Double, val note: String?, val photoId: Long?, val created: String?,
)

fun pendingRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_usta_fakt_qoralama"); put("filtr", "kompaniya_id=eq.$companyId&holat=eq.qoralama"); put("tartib", "created_at.desc"); put("limit", 500)
}

fun parsePending(rows: List<JsonObject>): List<PendingFakt> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    if (r["holat"].str().let { it != null && it != "qoralama" }) return@mapNotNull null
    PendingFakt(
        id, r["obyekt_id"].num()?.toLong() ?: return@mapNotNull null, r["qator_id"].num()?.toLong() ?: return@mapNotNull null,
        r["sana"].str().orEmpty(), r["hajm"].num() ?: return@mapNotNull null, r["izoh"].str()?.takeIf { it.isNotBlank() },
        r["foto_hujjat_id"].num()?.toLong(), r["created_at"].str(),
    )
}

/** Drafts of one object and one working day: accepted or rejected together (the server groups them into one fact document the same way). */
data class QabulBatch(val objectId: Long, val date: String, val items: List<PendingFakt>) {
    val ids: List<Long> get() = items.map { it.id }
    val oldest: String? get() = items.mapNotNull { it.created }.minOrNull()
}

fun batchPending(list: List<PendingFakt>): List<QabulBatch> =
    list.groupBy { it.objectId to it.date }.map { (k, v) -> QabulBatch(k.first, k.second, v) }
        .sortedWith(compareBy<QabulBatch>({ it.objectId }, { it.date }))

/** Whole days a draft has been waiting; null when the time is unknown. A draft waiting three days or more is flagged (same threshold as the web). */
fun waitingDays(created: String?, now: Instant = Instant.now()): Int? =
    created?.let { runCatching { ChronoUnit.DAYS.between(Instant.parse(it.replace("+00:00", "Z")), now).toInt().coerceAtLeast(0) }.getOrNull() }

const val STALE_DAYS = 3

enum class QabulDecision(val wire: String) { ACCEPT("tasdiqlangan"), REJECT("rad") }

/** A rejection must tell the master why; the server shows the remark to him. */
fun remarkValid(decision: QabulDecision, remark: String): Boolean = decision == QabulDecision.ACCEPT || remark.trim().length >= 3

fun decisionBody(companyId: Long, ids: List<Long>, d: QabulDecision, remark: String?, operationId: String): JsonObject = buildJsonObject {
    put("amal", "usta_fakt_qaror_v1"); put("kompaniya_id", companyId); put("operation_id", operationId)
    put("idlar", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } })
    put("qaror", d.wire)
    remark?.trim()?.takeIf { it.isNotEmpty() }?.let { put("izoh", it.take(500)) }
}

sealed interface QabulResult {
    data class Done(val count: Int) : QabulResult
    data object Offline : QabulResult
    data object Forbidden : QabulResult
    /** Somebody decided first, or the day is closed: refresh the list. */
    data object Changed : QabulResult
    data class Failed(val code: String?) : QabulResult
}

private fun codeOf(r: ApiResult): String? = r.code ?: r.body.obj()?.get("code").str() ?: r.body.obj()?.get("natija").obj()?.get("code").str()

fun qabulResult(r: ApiResult): QabulResult {
    val code = codeOf(r)
    val text = listOfNotNull(code, r.body.obj()?.get("error").str()).joinToString(" ")
    return when {
        r.networkError -> QabulResult.Offline
        r.status == 403 || Regex("PERMISSION_DENIED|42501|FORBIDDEN|AZO_EMAS").containsMatchIn(text) -> QabulResult.Forbidden
        code == "IDLAR_1_500" || code == "QAROR_NOTOGRI" -> QabulResult.Failed(code)
        r.ok && (r.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull != false && (r.body.obj()?.get("natija").obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull != false -> {
            val n = r.body.obj()?.get("natija").obj()?.get("qator_soni").num() ?: r.body.obj()?.get("qator_soni").num()
            // Zero rows decided = the drafts were already decided by somebody else.
            if (n != null && n.toInt() == 0) QabulResult.Changed else QabulResult.Done(n?.toInt() ?: 0)
        }
        else -> QabulResult.Failed(code ?: "HTTP ${r.status}")
    }
}

@Singleton
class QabulRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val json: Json) {
    fun observe(companyId: Long): Flow<List<PendingFakt>?> = db.meta().observe("qabul:$companyId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<PendingFakt>>(it) }.getOrNull() }
    }

    fun lastUpdated(companyId: Long): Flow<Long?> = db.meta().observe("qabul_ts:$companyId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff("/api/sb", "POST", pendingRequest(companyId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val rows = parseSb(r.body)?.takeIf { it.complete } ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("qabul:$companyId", json.encodeToString(parsePending(rows.rows))))
        db.meta().put(MetaEntity("qabul_ts:$companyId", now.toString()))
        return SyncResult.Ok
    }

    /** Online only (like the approvals): the PIN step-up and the server's decision cannot be queued. */
    suspend fun decide(companyId: Long, ids: List<Long>, d: QabulDecision, remark: String?, operationId: String): QabulResult =
        qabulResult(api.bff("/api/sb-yoz", "POST", decisionBody(companyId, ids, d, remark, operationId)))

    /** Drops decided drafts from the cached list at once (the next refresh confirms it). */
    suspend fun forget(companyId: Long, ids: Set<Long>) {
        val cur = db.meta().get("qabul:$companyId")?.let { runCatching { json.decodeFromString<List<PendingFakt>>(it) }.getOrNull() } ?: return
        db.meta().put(MetaEntity("qabul:$companyId", json.encodeToString(cur.filter { it.id !in ids })))
    }

    /** "CODE name" of a smeta row for the cards; the cached tree is the source (null when the object's rows are not on the device). */
    suspend fun rowLabel(objectId: Long, rowId: Long): Pair<String, String?>? =
        db.qator().get(objectId, rowId)?.let { q -> (listOfNotNull(q.kod, q.nom).joinToString(" ")) to q.birlik }
}
