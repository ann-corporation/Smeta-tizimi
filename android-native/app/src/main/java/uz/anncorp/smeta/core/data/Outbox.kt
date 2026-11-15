package uz.anncorp.smeta.core.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.OutboxDao
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import java.util.concurrent.TimeUnit

/** How one send attempt is judged. */
enum class SendVerdict { SUCCESS, UNAUTHORIZED, REJECTED, RETRY }

/**
 * 2xx with ok != false -> SUCCESS. 401 -> UNAUTHORIZED (pause, login). Other 4xx, or a 2xx carrying ok:false
 * (the write endpoint reports validation problems that way) -> REJECTED (user must fix). 408/429/5xx/network -> RETRY.
 */
fun judge(r: ApiResult): SendVerdict = when {
    r.networkError -> SendVerdict.RETRY
    r.unauthorized -> SendVerdict.UNAUTHORIZED
    r.status == 408 || r.status == 429 || r.status >= 500 -> SendVerdict.RETRY
    r.status in 400..499 -> SendVerdict.REJECTED
    r.ok -> if (parseFaktResult(r.body)?.ok == false) SendVerdict.REJECTED else SendVerdict.SUCCESS
    else -> SendVerdict.RETRY
}

fun rejectionReason(r: ApiResult): String {
    val fr = parseFaktResult(r.body)
    return fr?.error?.takeIf { it.isNotBlank() } ?: r.code ?: "HTTP ${r.status}"
}

enum class DrainResult { IDLE, RETRY_LATER, NEEDS_LOGIN }

/**
 * FIFO outbox state machine, independent of Android so it can be unit-tested. Entries move
 * PENDING -> DONE | FAILED(visible reason) | back to PENDING (retry) | PAUSED (401, until login).
 * A rejected (FAILED) entry does not block the entries behind it.
 */
class OutboxProcessor(
    private val dao: OutboxDao,
    private val send: suspend (OutboxEntity) -> ApiResult,
    private val json: Json,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun drain(): DrainResult {
        while (true) {
            val e = dao.nextPending() ?: return DrainResult.IDLE.also { dao.purgeDoneBefore(now() - KEEP_DONE_MS) }
            val r = send(e)
            // A multi-step entry (photo) may have saved progress while sending: always build on the stored row, not the stale copy.
            val cur = dao.get(e.id) ?: e
            when (judge(r)) {
                SendVerdict.SUCCESS -> dao.upsert(cur.copy(state = OutboxState.DONE, attempts = e.attempts + 1, lastError = null, info = if (e.kind == KIND_PHOTO) null else summarise(r)))
                SendVerdict.UNAUTHORIZED -> { dao.pauseAllPending(); return DrainResult.NEEDS_LOGIN }
                SendVerdict.REJECTED -> dao.upsert(cur.copy(state = OutboxState.FAILED, attempts = e.attempts + 1, lastError = rejectionReason(r)))
                SendVerdict.RETRY -> {
                    dao.upsert(cur.copy(attempts = e.attempts + 1, lastError = if (r.networkError) "network" else "HTTP ${r.status}"))
                    return DrainResult.RETRY_LATER
                }
            }
        }
    }

    private fun summarise(r: ApiResult): String? {
        val fr = parseFaktResult(r.body) ?: return null
        val o: JsonObject = buildJsonObject {
            fr.raqam?.let { put("raqam", it) }
            fr.jami?.let { put("jami", it) }
            put("over", buildJsonArray { fr.over.forEach { add(buildJsonObject { put("nom", it.nom); it.chegara?.let { c -> put("chegara", c) }; it.bor?.let { b -> put("bor", b) }; it.qoshilmoqda?.let { q -> put("qosh", q) } }) } })
            put("narxsiz", fr.unpricedCount)
            put("takror", fr.replay)
        }
        return json.encodeToString(JsonObject.serializer(), o)
    }

    private companion object { const val KEEP_DONE_MS = 7L * 24 * 3600 * 1000 }
}

/** UI-side facade: enqueue (idempotent), resume after login, retry, edit-as-draft, delete. */
class OutboxRepository(private val dao: OutboxDao, private val scheduler: OutboxScheduler, private val cleanup: (OutboxEntity) -> Unit = {}) {
    /** Returns false when this operation id is already queued (a duplicate replay): nothing new is created. */
    suspend fun enqueue(e: OutboxEntity): Boolean {
        val fresh = dao.insertIgnore(e) != -1L
        scheduler.schedule()
        return fresh
    }

    suspend fun retry(id: String) {
        dao.get(id)?.takeIf { it.state == OutboxState.FAILED }?.let { dao.upsert(it.copy(state = OutboxState.PENDING, lastError = null)) }
        scheduler.schedule()
    }

    suspend fun delete(id: String) {
        dao.get(id)?.takeIf { it.state != OutboxState.DONE }?.let(cleanup)
        dao.delete(id)
    }

    /** Everything not yet delivered (queued / paused / rejected). */
    suspend fun unsent(): List<OutboxEntity> = dao.unsent()

    /** Drops every undelivered entry (and its local photo files). */
    suspend fun deleteUnsent() {
        dao.unsent().forEach(cleanup)
        dao.deleteUnsent()
    }

    /** After a successful login/session check: paused entries continue. */
    suspend fun resumeAfterLogin() { dao.resumePaused(); scheduler.schedule() }

    suspend fun get(id: String) = dao.get(id)
    val active = dao.observeActive()
    val recentDone = dao.observeRecentDone()
    val queuedCount = dao.observeQueuedCount()
    val failedCount = dao.observeFailedCount()
}

interface OutboxScheduler { fun schedule() }

class WorkManagerScheduler(private val context: Context) : OutboxScheduler {
    override fun schedule() {
        val req = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }
    companion object { const val UNIQUE = "qurai-outbox" }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface OutboxEntryPoint {
    fun processor(): OutboxProcessor
}

class OutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val processor = EntryPointAccessors.fromApplication(applicationContext, OutboxEntryPoint::class.java).processor()
        return when (processor.drain()) {
            DrainResult.IDLE, DrainResult.NEEDS_LOGIN -> Result.success()
            DrainResult.RETRY_LATER -> Result.retry()
        }
    }
}
