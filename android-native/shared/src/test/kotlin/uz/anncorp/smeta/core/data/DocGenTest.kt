package uz.anncorp.smeta.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The app contains no document template: it only asks the server (royxat / yarat) and shows the bytes. */
class DocGenTest {
    private val json = Json { ignoreUnknownKeys = true }

    private val list = """{"ok":true,"hujjatlar":[
        {"kalit":"f2:246","tur":"f2","sarlavha":"Ф-2 № 1 · 2026-10","holat":"tasdiqlangan","summa":150026606.32,"parametrlar":{"akt_id":246},"formatlar":["xlsx","pdf"]},
        {"kalit":"forma3:5:9","tur":"forma3","sarlavha":"Форма № 3","holat":"tayyor","summa":null,"parametrlar":{"shartnoma_id":5,"f3_id":9},"formatlar":["pdf"]},
        {"tur":"f2"}]}"""

    @Test fun parsesTheServerAnnouncedList() {
        val items = parseGenList(json.parseToJsonElement(list))!!
        assertEquals(2, items.size)
        assertEquals("f2:246", items[0].key); assertTrue(items[0].isF2); assertEquals(150026606.32, items[0].amount!!, 0.001)
        assertEquals(mapOf("akt_id" to 246L), items[0].params); assertEquals(listOf("xlsx", "pdf"), items[0].formats)
        assertTrue(items[1].isF3); assertNull(items[1].amount); assertEquals(mapOf("shartnoma_id" to 5L, "f3_id" to 9L), items[1].params)
        assertNull(parseGenList(json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseGenList(null))
    }

    @Test fun requestsSendTheServerParamsBackUnchanged() {
        val item = parseGenList(json.parseToJsonElement(list))!![1]
        val b = genCreateRequestBody(8, 5, item, "pdf")
        assertEquals("yarat", b["amal"]!!.jsonPrimitive.content); assertEquals("forma3", b["tur"]!!.jsonPrimitive.content)
        assertEquals("pdf", b["format"]!!.jsonPrimitive.content)
        assertEquals("8", b["kompaniya_id"]!!.jsonPrimitive.content); assertEquals("5", b["obyekt_id"]!!.jsonPrimitive.content)
        assertEquals("5", b["shartnoma_id"]!!.jsonPrimitive.content); assertEquals("9", b["f3_id"]!!.jsonPrimitive.content)
        assertEquals("royxat", genListRequestBody(8, 5)["amal"]!!.jsonPrimitive.content)
    }

    @Test fun mapsServerErrors() {
        assertTrue(mapGenError(0, null) is GenResult.Offline)
        assertTrue(mapGenError(402, "TOKEN_YETMAYDI") is GenResult.NoTokens)
        assertTrue(mapGenError(403, "PERMISSION_DENIED") is GenResult.Forbidden)
        assertTrue(mapGenError(409, "F2_QATOR_TOPILMADI") is GenResult.DataIncomplete)
        assertTrue(mapGenError(500, "PDF_YASALMADI") is GenResult.Failed)
    }

    private class Api(val listBody: String, val file: BytesResult) : BffApi {
        var postedPath: String? = null; var postedBody: JsonElement? = null; var listedBody: JsonElement? = null
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            listedBody = body
            return ApiResult(200, Json.parseToJsonElement(listBody))
        }
        override suspend fun bffPostBytes(path: String, body: JsonElement, maxBytes: Long): BytesResult { postedPath = path; postedBody = body; return file }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null)
    }

    @Test fun repositoryListsAndGeneratesThroughTheServerOnly() = runTest {
        val pdf = "%PDF-1.4 server-built".toByteArray()
        val api = Api(list, BytesResult(200, pdf, "application/pdf", "Ф-2 № 1.pdf"))
        val repo = DocGenRepository(api)
        val items = repo.list(8, 5)!!
        assertEquals("royxat", (api.listedBody as JsonObject)["amal"]!!.jsonPrimitive.content)
        val r = repo.generate(8, 5, items[0], "pdf") as GenResult.Ready
        assertArrayEquals(pdf, r.bytes); assertEquals("Ф-2 № 1.pdf", r.name); assertEquals("application/pdf", r.mime)
        assertEquals(GEN_PATH, api.postedPath)
        assertEquals("246", (api.postedBody as JsonObject)["akt_id"]!!.jsonPrimitive.content)
    }

    @Test fun serverRefusalsAreSurfacedNotRetriedLocally() = runTest {
        val item = parseGenList(json.parseToJsonElement(list))!![0]
        assertTrue(DocGenRepository(Api(list, BytesResult(402, null, code = "TOKEN_YETMAYDI"))).generate(8, 5, item, "xlsx") is GenResult.NoTokens)
        assertTrue(DocGenRepository(Api(list, BytesResult(0, null))).generate(8, 5, item, "xlsx") is GenResult.Offline)
        val fallbackName = DocGenRepository(Api(list, BytesResult(200, byteArrayOf(1, 2), null, null))).generate(8, 5, item, "xlsx") as GenResult.Ready
        assertTrue(fallbackName.name.endsWith(".xlsx")); assertTrue(fallbackName.mime.contains("spreadsheet"))
    }
}