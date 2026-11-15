package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.db.OutboxDao
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState

class FakeOutboxDao : OutboxDao {
    val rows = MutableStateFlow<List<OutboxEntity>>(emptyList())
    override suspend fun insertIgnore(e: OutboxEntity): Long { if (rows.value.any { it.id == e.id }) return -1; rows.value += e; return rows.value.size.toLong() }
    override suspend fun upsert(e: OutboxEntity) { rows.value = rows.value.filter { it.id != e.id } + e }
    override suspend fun get(id: String) = rows.value.firstOrNull { it.id == id }
    override suspend fun nextPending() = rows.value.filter { it.state == OutboxState.PENDING }.minWithOrNull(compareBy({ it.createdAt }, { it.id }))
    override fun observeActive() = rows.map { l -> l.filter { it.state != OutboxState.DONE } }
    override fun observeRecentDone() = rows.map { l -> l.filter { it.state == OutboxState.DONE } }
    override fun observeQueuedCount() = rows.map { l -> l.count { it.state == OutboxState.PENDING || it.state == OutboxState.PAUSED } }
    override fun observeFailedCount() = rows.map { l -> l.count { it.state == OutboxState.FAILED } }
    override suspend fun pendingCount() = rows.value.count { it.state == OutboxState.PENDING }
    override suspend fun pauseAllPending() { rows.value = rows.value.map { if (it.state == OutboxState.PENDING) it.copy(state = OutboxState.PAUSED) else it } }
    override suspend fun resumePaused() { rows.value = rows.value.map { if (it.state == OutboxState.PAUSED) it.copy(state = OutboxState.PENDING) else it } }
    override suspend fun delete(id: String) { rows.value = rows.value.filterNot { it.id == id && it.state != OutboxState.DONE } }
    override suspend fun purgeDoneBefore(before: Long) { rows.value = rows.value.filterNot { it.state == OutboxState.DONE && it.createdAt < before } }
}

class OutboxTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val BASE = System.currentTimeMillis()
    private fun entry(id: String, t: Long) = OutboxEntity(id, AMAL_FAKT, """{"amal":"fakt_yoz_v2","operation_id":"$id"}""", 5, "Obj", 1, OutboxState.PENDING, 0, null, null, BASE + t)
    private fun ok(body: String = """{"ok":true,"raqam":"F1","jami":10.5,"ogohlantirish":[{"qator_id":1,"nom":"N","bor":2,"qoshilmoqda":1,"chegara":2}],"narxsiz_soni":2}""") = ApiResult(200, json.parseToJsonElement(body))
    private fun err(status: Int, body: String? = null) = ApiResult(status, body?.let { json.parseToJsonElement(it) } ?: JsonNull)

    private class NoopScheduler : OutboxScheduler { var calls = 0; override fun schedule() { calls++ } }

    @Test fun verdicts() {
        assertEquals(SendVerdict.SUCCESS, judge(ok()))
        assertEquals(SendVerdict.REJECTED, judge(ApiResult(200, json.parseToJsonElement("""{"ok":false,"error":"sana noto'g'ri"}"""))))   // 200 + ok:false is a validation rejection
        assertEquals(SendVerdict.UNAUTHORIZED, judge(err(401)))
        assertEquals(SendVerdict.REJECTED, judge(err(400)))
        assertEquals(SendVerdict.REJECTED, judge(err(403)))
        assertEquals(SendVerdict.REJECTED, judge(err(409)))
        assertEquals(SendVerdict.RETRY, judge(err(429)))
        assertEquals(SendVerdict.RETRY, judge(err(500)))
        assertEquals(SendVerdict.RETRY, judge(err(503)))
        assertEquals(SendVerdict.RETRY, judge(ApiResult(0, null)))
    }

    @Test fun successMarksDoneAndKeepsServerWarnings() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1))
        val res = OutboxProcessor(dao, { ok() }, json).drain()
        assertEquals(DrainResult.IDLE, res)
        val e = dao.get("a")!!
        assertEquals(OutboxState.DONE, e.state); assertEquals(1, e.attempts); assertNull(e.lastError)
        assertTrue(e.info!!.contains("F1")); assertTrue(e.info!!.contains("\"narxsiz\":2"))
    }

    @Test fun fifoOrder() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("b", 2)); dao.insertIgnore(entry("a", 1)); dao.insertIgnore(entry("c", 3))
        val order = mutableListOf<String>()
        OutboxProcessor(dao, { order += it.id; ok() }, json).drain()
        assertEquals(listOf("a", "b", "c"), order)
    }

    @Test fun networkOrServerErrorRetriesAndStopsTheQueue() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1)); dao.insertIgnore(entry("b", 2))
        var calls = 0
        val res = OutboxProcessor(dao, { calls++; ApiResult(0, null) }, json).drain()
        assertEquals(DrainResult.RETRY_LATER, res); assertEquals(1, calls)                  // b is not attempted before a succeeds (FIFO)
        assertEquals(OutboxState.PENDING, dao.get("a")!!.state); assertEquals(1, dao.get("a")!!.attempts)
        val res2 = OutboxProcessor(dao, { calls++; err(503) }, json).drain()
        assertEquals(DrainResult.RETRY_LATER, res2); assertEquals(2, dao.get("a")!!.attempts); assertEquals("HTTP 503", dao.get("a")!!.lastError)
        // later it succeeds, both go through in order
        assertEquals(DrainResult.IDLE, OutboxProcessor(dao, { ok() }, json).drain())
        assertEquals(setOf(OutboxState.DONE), dao.rows.value.map { it.state }.toSet())
    }

    @Test fun unauthorizedPausesEverythingUntilLogin() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1)); dao.insertIgnore(entry("b", 2))
        val res = OutboxProcessor(dao, { err(401) }, json).drain()
        assertEquals(DrainResult.NEEDS_LOGIN, res)
        assertEquals(listOf(OutboxState.PAUSED, OutboxState.PAUSED), dao.rows.value.map { it.state })
        val sched = NoopScheduler()
        OutboxRepository(dao, sched).resumeAfterLogin()
        assertEquals(listOf(OutboxState.PENDING, OutboxState.PENDING), dao.rows.value.map { it.state }); assertEquals(1, sched.calls)
    }

    @Test fun rejectedIsFailedWithReasonAndDoesNotBlockOthers() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1)); dao.insertIgnore(entry("b", 2))
        val res = OutboxProcessor(dao, { e -> if (e.id == "a") ApiResult(200, json.parseToJsonElement("""{"ok":false,"error":"qatorlar bo'sh"}""")) else ok() }, json).drain()
        assertEquals(DrainResult.IDLE, res)
        assertEquals(OutboxState.FAILED, dao.get("a")!!.state); assertEquals("qatorlar bo'sh", dao.get("a")!!.lastError)
        assertEquals(OutboxState.DONE, dao.get("b")!!.state)
        // 4xx without a body: reason falls back to the status
        val d2 = FakeOutboxDao(); d2.insertIgnore(entry("x", 1))
        OutboxProcessor(d2, { err(422) }, json).drain()
        assertEquals("HTTP 422", d2.get("x")!!.lastError)
    }

    @Test fun failedCanBeRetriedOrDeleted() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1)); dao.insertIgnore(entry("b", 2))
        OutboxProcessor(dao, { err(400) }, json).drain()
        val repo = OutboxRepository(dao, NoopScheduler())
        repo.retry("a")
        assertEquals(OutboxState.PENDING, dao.get("a")!!.state); assertNull(dao.get("a")!!.lastError)
        repo.delete("b")
        assertNull(dao.get("b"))
    }

    @Test fun duplicateOperationIdReplayCreatesOneResult() = runBlocking {
        val dao = FakeOutboxDao(); val sched = NoopScheduler(); val repo = OutboxRepository(dao, sched)
        assertTrue(repo.enqueue(entry("same", 1)))
        assertFalse(repo.enqueue(entry("same", 2)))              // replayed save with the same operation id
        assertEquals(1, dao.rows.value.size)
        val sent = mutableListOf<String>()
        OutboxProcessor(dao, { sent += it.id; ok() }, json).drain()
        OutboxProcessor(dao, { sent += it.id; ok() }, json).drain()  // a second worker run finds nothing to send
        assertEquals(listOf("same"), sent)
        // re-enqueueing an already DONE id must not resurrect it
        assertFalse(repo.enqueue(entry("same", 3)))
        assertEquals(OutboxState.DONE, dao.get("same")!!.state)
    }

    @Test fun doneEntriesAreDeletableOnlyByPurgeNotByUser() = runBlocking {
        val dao = FakeOutboxDao(); dao.insertIgnore(entry("a", 1))
        OutboxProcessor(dao, { ok() }, json).drain()
        OutboxRepository(dao, NoopScheduler()).delete("a")
        assertEquals(OutboxState.DONE, dao.get("a")!!.state)
    }
}
