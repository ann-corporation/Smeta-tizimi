package uz.anncorp.smeta.feature.disk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi

/** Disk writes (upload, folders, file actions, trash): request shapes are the site's own (hmPapka / hmFaylAmal / hujjat-yukla), results map to one list. */
class DiskWriteTest {
    private val listing = """{"ok":true,"daraja":3,"shaxsiy":true,"yol":[],"papkalar":[{"id":2,"nom":"Shartnomalar","tizim":false}],"fayllar":[{"id":10,"nom":"reja.pdf","mime":"application/pdf","bayt":2048,"versiya":1,"yangilandi":"2026-11-17T10:30:00+00:00","savatda":null,"izohlar":0}]}"""

    private class Fake(val listing: String, var writeStatus: Int = 200, var writeCode: String? = null) : BffApi {
        val posts = mutableListOf<JsonObject>(); val gets = mutableListOf<String>(); val uploads = mutableListOf<okhttp3.RequestBody>()
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            if (method == "POST") {
                posts += body as JsonObject
                return if (writeStatus in 200..299) ApiResult(200, Json.parseToJsonElement("""{"ok":true}""")) else ApiResult(writeStatus, Json.parseToJsonElement("""{"ok":false}"""), writeCode)
            }
            gets += path
            return when {
                path.contains("amal=versiyalar") -> ApiResult(200, Json.parseToJsonElement("""{"ok":true,"versiyalar":[{"raqam":3,"bayt":2048,"joriy":true},{"raqam":1,"bayt":10,"joriy":false}]}"""))
                else -> ApiResult(200, Json.parseToJsonElement(listing))
            }
        }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null)
        override suspend fun diskUpload(body: okhttp3.RequestBody): ApiResult {
            uploads += body
            return if (writeStatus in 200..299) ApiResult(200, Json.parseToJsonElement("""{"ok":true}""")) else ApiResult(writeStatus, null, writeCode)
        }
    }

    private fun controller(api: Fake) = DiskController(DiskRepository(api), CoroutineScope(Dispatchers.Unconfined)) { 7L }
    private fun <T> eventually(block: () -> T?): T = runBlocking { withTimeout(5_000) { var v = block(); while (v == null) { kotlinx.coroutines.delay(10); v = block() }; v } }

    @Test fun bodiesAreTheSitesOwn() {
        assertEquals("""{"amal":"papka","op":"yarat","kompaniya_id":7,"nom":"Yangi","ota_id":2}""", diskFolderBody(7, "yarat", name = "Yangi", parentId = 2).toString())
        assertEquals("""{"amal":"papka","op":"nomla","papka_id":2,"nom":"B"}""", diskFolderBody(null, "nomla", folderId = 2, name = "B").toString())
        assertEquals("""{"amal":"fayl","fayl_id":10,"op":"savat"}""", diskFileBody(10, "savat").toString())
        assertEquals("""{"amal":"fayl","fayl_id":10,"op":"kochir","papka_id":2}""", diskFileBody(10, "kochir", folderId = 2).toString())
    }

    @Test fun uploadFormHasTheServerFields() {
        val b = diskUploadForm("a.pdf", "application/pdf", byteArrayOf(1, 2), "11111111-1111-4111-8111-111111111111", 7, 2)
        val names = b.parts.map { it.headers!!["Content-Disposition"]!! }
        assertTrue(names.any { it.contains("name=\"operation_id\"") }); assertTrue(names.any { it.contains("name=\"kompaniya_id\"") }); assertTrue(names.any { it.contains("name=\"papka_id\"") })
        assertTrue(names.any { it.contains("name=\"fayl\"") && it.contains("filename=\"a.pdf\"") })
        val personalRoot = diskUploadForm("a.pdf", "", byteArrayOf(1), "11111111-1111-4111-8111-111111111111", null, null)
        assertTrue(personalRoot.parts.none { it.headers!!["Content-Disposition"]!!.contains("kompaniya_id") || it.headers!!["Content-Disposition"]!!.contains("papka_id") })
    }

    @Test fun resultsMapByCodeThenStatus() {
        assertEquals(DiskOp.OFFLINE, diskOpResult(0, null, null)); assertEquals(DiskOp.DONE, diskOpResult(200, null, true)); assertEquals(DiskOp.FAILED, diskOpResult(200, null, false))
        assertEquals(DiskOp.QUOTA, diskOpResult(413, "KVOTA_TUGADI", false)); assertEquals(DiskOp.TOO_LARGE, diskOpResult(413, "FILE_TOO_LARGE", false))
        assertEquals(DiskOp.BAD_TYPE, diskOpResult(415, "MIME_REJECTED", false)); assertEquals(DiskOp.EXISTS, diskOpResult(409, "NOM_BAND", false))
        assertEquals(DiskOp.FORBIDDEN, diskOpResult(403, "RUXSAT_YOQ", false)); assertEquals(DiskOp.NOT_EMPTY, diskOpResult(400, "PAPKA_BOSH_EMAS", false))
    }

    @Test fun createFolderPostsThenReloads() {
        val api = Fake(listing); val c = controller(api)
        c.select(DiskTab.COMPANY); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.openFolder(2, "Shartnomalar"); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        val before = api.gets.size
        c.createFolder("  Akt  ")
        eventually { c.state.value.takeIf { it.op == DiskOp.DONE && !it.working } }
        assertEquals("""{"amal":"papka","op":"yarat","kompaniya_id":7,"nom":"Akt","ota_id":2}""", api.posts.single().toString())
        assertTrue(api.gets.size > before)
    }

    @Test fun trashAndRestoreFileOnTheCard() {
        val api = Fake(listing); val c = controller(api)
        c.select(DiskTab.MINE); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.showFile("f10"); eventually { c.state.value.detail?.takeIf { it.versions != null } }
        c.trashFile()
        eventually { c.state.value.takeIf { it.op == DiskOp.DONE && !it.working } }
        assertEquals("""{"amal":"fayl","fayl_id":10,"op":"savat"}""", api.posts.last().toString()); assertNull(c.state.value.detail)
        c.showFile("f10"); eventually { c.state.value.detail?.takeIf { it.versions != null } }
        c.clearOp(); c.restoreFile()
        eventually { c.state.value.takeIf { it.op == DiskOp.DONE && !it.working } }
        assertEquals("""{"amal":"fayl","fayl_id":10,"op":"tikla"}""", api.posts.last().toString())
    }

    @Test fun cardHeaderShowsTheCurrentVersionOfTheList() {
        val api = Fake(listing); val c = controller(api)
        c.select(DiskTab.MINE); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        assertEquals("v1", c.state.value.rows.first { !it.folder }.sub!!.substringAfterLast("  ·  "))
        c.showFile("f10")
        val d = eventually { c.state.value.detail?.takeIf { it.versions != null } }
        assertEquals(3, d.file.version); assertTrue(d.file.detailText().contains("v3"))
    }

    @Test fun uploadGoesToTheOpenFolderAndRefusalsShow() {
        val api = Fake(listing); val c = controller(api)
        c.select(DiskTab.COMPANY); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.openFolder(2, "Shartnomalar"); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.upload("a.pdf", "application/pdf", byteArrayOf(1, 2, 3))
        eventually { c.state.value.takeIf { it.op == DiskOp.DONE && !it.working } }
        assertEquals(1, api.uploads.size)
        // too large: refused on the phone, never sent
        c.clearOp(); c.upload("big.bin", "application/octet-stream", ByteArray((DISK_UPLOAD_MAX_BYTES + 1).toInt()))
        eventually { c.state.value.takeIf { it.op == DiskOp.TOO_LARGE && !it.working } }
        assertEquals(1, api.uploads.size)
        // server refuses: quota
        api.writeStatus = 413; api.writeCode = "KVOTA_TUGADI"; c.clearOp(); c.upload("b.pdf", "application/pdf", byteArrayOf(1))
        eventually { c.state.value.takeIf { it.op == DiskOp.QUOTA && !it.working } }
        // the trash and the shared tab are read-only for uploads
        c.select(DiskTab.TRASH); api.uploads.clear(); c.clearOp(); c.upload("c.pdf", "application/pdf", byteArrayOf(1))
        assertTrue(api.uploads.isEmpty()); assertNull(c.state.value.op)
    }

    @Test fun moveTargetsNeverOfferTheFolderItself() {
        val api = Fake(listing); val c = controller(api)
        c.select(DiskTab.MINE); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        assertEquals(listOf(2L), c.moveTargets(false).map { it.id })              // root level: only the sub-folder
        c.openFolder(2, "Shartnomalar"); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        assertEquals(listOf(0L, 2L), c.moveTargets(false).map { it.id }.let { it })   // up to the root + the folder below
        assertEquals(listOf(0L), c.moveTargets(true).map { it.id })                   // the open folder can only go up
    }
}
