package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.RequestBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.media.ImageMath

class PhotoQueueTest {
    private val bytes = ByteArray(300) { (it * 7).toByte() }
    private val sha = ImageMath.sha256Hex(bytes)
    private fun job(qator: Long? = null) = PhotoJob("/x/p.jpg", sha, bytes.size, 8, 21, qator, "2026-11-15", null, null, "beton")
    private fun entry(id: String, j: PhotoJob) = OutboxEntity(id, KIND_PHOTO, j.toJson().toString(), 21, "Obj", 1, OutboxState.PENDING, 0, null, null, System.currentTimeMillis())

    @Test fun multipartCarriesEveryFieldTheCanonicalUploadNeeds() {
        val body = uploadBody(bytes, "foto-1.jpg", job(), "op-1")
        assertTrue(body.contentType().toString().startsWith("multipart/form-data; boundary="))
        val buf = Buffer(); body.writeTo(buf)
        val text = buf.readString(Charsets.ISO_8859_1)
        for (field in listOf("kompaniya_id" to "8", "obyekt_id" to "21", "turi" to PHOTO_TYPE, "operation_id" to "op-1", "sha256" to sha, "size" to bytes.size.toString())) {
            assertTrue("missing ${field.first}", Regex("""name="${field.first}"\r\n(?:Content-[^\r]+\r\n)*\r\n${Regex.escape(field.second)}\r\n""").containsMatchIn(text))
        }
        assertTrue(text.contains("""name="fayl"; filename="foto-1.jpg""""))
        assertTrue(text.contains("Content-Type: image/jpeg"))
        assertTrue(text.indexOf("name=\"sha256\"") < text.indexOf("name=\"fayl\""))     // fields first, file last
        assertEquals(bytes.size.toLong() + 0, body.parts.last().body.contentLength())
    }

    @Test fun jobRoundTripsAndSkipsUnsetFields() {
        val j = job(5).copy(lat = 41.3, lng = 69.2, documentId = 77, fotoId = 90, linked = true)
        assertEquals(j, parsePhotoJob(j.toJson().toString()))
        assertNull(parsePhotoJob("""{"file":"a"}"""))
        assertNull(parsePhotoJob("not json"))
        assertFalse(job().toJson().containsKey("lat"))
    }

    @Test fun payloadsMatchTheBotSequence() {
        val l = linkPayload(job().copy(documentId = 77, lat = 1.5, lng = 2.5), "op-9")
        assertEquals("bogla", l["amal"].str()); assertEquals("umumiy", l["manba_turi"].str()); assertEquals("op-9", l["operation_id"].str())
        assertEquals(77L, l["document_id"].num()!!.toLong()); assertEquals(1.5, l["lat"].num()!!, 0.0)
        val r = rowLinkPayload(job(5).copy(fotoId = 90))
        assertEquals("yangila", r["amal"].str()); assertEquals("qator", r["manba_turi"].str())
        assertEquals(5L, r["manba_id"].num()!!.toLong()); assertEquals(90L, r["id"].num()!!.toLong())
        assertEquals(true, (r["manba_ozgar"] as JsonPrimitive).content.toBoolean())
    }

    private class FakeApi(var uploadStatus: Int = 200, var linkStatus: Int = 200) : BffApi {
        val calls = mutableListOf<String>(); val sent = mutableListOf<JsonObject>(); var uploadedOp: String? = null
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            calls += "bff:$method $path"; (body as? JsonObject)?.let { sent += it }
            val amal = (body as? JsonObject)?.get("amal").str()
            return if (linkStatus != 200) ApiResult(linkStatus, null) else ApiResult(200, buildJsonObject { put("ok", true); if (amal == "bogla") put("id", 90) })
        }
        override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult {
            calls += "upload:$companyId/$obyektId"
            val buf = Buffer(); body.writeTo(buf); uploadedOp = Regex("""name="operation_id"\r\n(?:Content-[^\r]+\r\n)*\r\n([^\r]+)""").find(buf.readString(Charsets.ISO_8859_1))?.groupValues?.get(1)
            return if (uploadStatus != 200) ApiResult(uploadStatus, null) else ApiResult(200, buildJsonObject { put("ok", true); put("document_id", 77) })
        }
    }

    @Test fun sendsUploadThenLinkThenRowAndDeletesTheFile() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-1", job(5)); dao.insertIgnore(e)
        val api = FakeApi(); val deleted = mutableListOf<String>()
        val r = PhotoSender(api, dao, { bytes }, { deleted += it }).send(e)
        assertTrue(r.ok)
        assertEquals(listOf("upload:8/21", "bff:POST /api/foto-dalil", "bff:POST /api/foto-dalil"), api.calls)
        assertEquals("op-1", api.uploadedOp)                                     // idempotent: the outbox id IS the operation id
        assertEquals("op-1", api.sent[0]["operation_id"].str())
        assertEquals(listOf("/x/p.jpg"), deleted)
    }

    @Test fun withoutARowOnlyUploadAndLink() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-2", job()); dao.insertIgnore(e)
        val api = FakeApi()
        assertTrue(PhotoSender(api, dao, { bytes }, {}).send(e).ok)
        assertEquals(2, api.calls.size)
    }

    @Test fun retryResumesWhereItStopped() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-3", job(5)); dao.insertIgnore(e)
        val api = FakeApi(linkStatus = 503)
        val first = PhotoSender(api, dao, { bytes }, {}).send(e)
        assertEquals(503, first.status)
        assertEquals(77L, parsePhotoJob(dao.get("op-3")!!.payloadJson)!!.documentId)     // progress persisted
        val api2 = FakeApi()
        assertTrue(PhotoSender(api2, dao, { bytes }, {}).send(dao.get("op-3")!!).ok)
        assertFalse(api2.calls.any { it.startsWith("upload") })                           // bytes are not uploaded twice
    }

    @Test fun missingOrChangedFileIsRejectedNotRetried() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-4", job()); dao.insertIgnore(e)
        val missing = PhotoSender(FakeApi(), dao, { null }, {}).send(e)
        assertEquals(SendVerdict.REJECTED, judge(missing)); assertEquals("FILE_MISSING", rejectionReason(missing))
        val corrupt = PhotoSender(FakeApi(), dao, { ByteArray(5) }, {}).send(e)
        assertEquals(SendVerdict.REJECTED, judge(corrupt)); assertEquals("FILE_CORRUPT", rejectionReason(corrupt))
    }

    @Test fun processorSendsPhotosAndFactsThroughOneQueue() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-5", job()); dao.insertIgnore(e)
        val api = FakeApi(); val sender = PhotoSender(api, dao, { bytes }, {})
        OutboxProcessor(dao, { x -> if (x.kind == KIND_PHOTO) sender.send(x) else ApiResult(500, null) }, kotlinx.serialization.json.Json).drain()
        val done = dao.get("op-5")!!
        assertEquals(OutboxState.DONE, done.state); assertNull(done.info)
    }

    @Test fun networkFailureKeepsTheEntryQueuedWithItsProgress() = runBlocking {
        val dao = FakeOutboxDao(); val e = entry("op-6", job()); dao.insertIgnore(e)
        val sender = PhotoSender(FakeApi(uploadStatus = 0), dao, { bytes }, {})
        val res = OutboxProcessor(dao, { sender.send(it) }, kotlinx.serialization.json.Json).drain()
        assertEquals(DrainResult.RETRY_LATER, res)
        assertEquals(OutboxState.PENDING, dao.get("op-6")!!.state)
        assertNotNull(dao.get("op-6")!!.lastError)
    }

    @Test fun unsentEntriesCanBeDroppedWithTheirFiles() = runBlocking {
        val dao = FakeOutboxDao()
        dao.insertIgnore(entry("a", job())); dao.insertIgnore(entry("b", job()).copy(state = OutboxState.FAILED)); dao.insertIgnore(entry("c", job()).copy(state = OutboxState.DONE))
        val cleaned = mutableListOf<String>()
        val repo = OutboxRepository(dao, object : OutboxScheduler { override fun schedule() {} }) { cleaned += it.id }
        assertEquals(listOf("a", "b"), repo.unsent().map { it.id })
        repo.deleteUnsent()
        assertEquals(listOf("a", "b"), cleaned)
        assertEquals(listOf("c"), dao.rows.value.map { it.id })                      // delivered history is untouched
    }
}
