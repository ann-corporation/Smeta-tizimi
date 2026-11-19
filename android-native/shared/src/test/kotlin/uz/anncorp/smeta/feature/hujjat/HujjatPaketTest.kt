package uz.anncorp.smeta.feature.hujjat

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.BytesResult
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str

class HujjatPaketTest {
    private fun j(s: String) = Json.parseToJsonElement(s)
    private val page = j("""{"ok":true,"jami":3,"kesilgan":false,"offset":0,"nomzodlar":[
        {"kalit":"f2:5","tur":"f2","sarlavha":"F-2 2026-11","holat":"tasdiqlangan","obyekt_id":7,"obyekt_nom":"Korpus A","oy":"2026-11","akt_id":5,"fayl_id":99,"versiya":3,"taxminiy":false,"takror":false},
        {"kalit":"f3:2","tur":"forma3","sarlavha":"F-3","obyekt_id":7,"forma3_id":2,"shartnoma_id":4},
        {"kalit":"nk:1","tur":"nakopitelniy","sarlavha":"Nak","obyekt_id":7,"oy":"2026-11"}]}""")

    @Test fun parsesPageAndRequests() {
        val p = parsePaketPage(page)!!
        assertEquals(3, p.rows.size); assertEquals(3, p.total); assertFalse(p.hasMore)
        assertTrue(p.rows[0].onDisk); assertFalse(p.rows[1].onDisk)
        assertEquals(mapOf("akt_id" to 5L), buildRequest(p.rows[0])!!.params)
        assertEquals(mapOf("shartnoma_id" to 4L, "f3_id" to 2L), buildRequest(p.rows[1])!!.params)
        assertEquals(mapOf("oy_son" to 202611L), buildRequest(p.rows[2])!!.params)
        assertNull(buildRequest(p.rows[0].copy(type = "aosr")))
        assertNull(parsePaketPage(j("""{"ok":false}""")))
    }
    @Test fun filterSendsOnlyValidParts() {
        val f = PaketFilter(turlar = setOf("f2", "bad"), holatlar = setOf("qoralama"), oyDan = "2026-03", oyGacha = "2026-13")
        assertFalse(f.monthsValid)
        val o = f.toJson(50, 50)
        assertEquals(1, (o["turlar"] as kotlinx.serialization.json.JsonArray).size); assertEquals("2026-03", o["oy_dan"].str()); assertNull(o["oy_gacha"])
        assertEquals(50.0, o["offset"].num()!!, 0.0)
        assertTrue(PaketFilter().monthsValid)
        // site rules: contract + objects go to the server, a reversed month range is swapped, saved filters drop paging
        val g = PaketFilter(shartnomaId = 4, obyektIds = listOf(7, 9)).withMonths("2026-05", "2026-02")
        assertEquals("2026-02", g.oyDan); assertEquals("2026-05", g.oyGacha); assertFalse(g.isEmpty)
        val gj = g.toJson(); assertEquals(1, (gj["shartnoma_ids"] as kotlinx.serialization.json.JsonArray).size); assertEquals(2, (gj["obyekt_ids"] as kotlinx.serialization.json.JsonArray).size)
        assertNull(g.toSavedJson()["offset"]); assertEquals(parseSavedFilter(g.toSavedJson()), g)
        assertEquals(listOf(7L to "Korpus A"), searchObjects(listOf(7L to "Korpus A", 8L to "Bog"), " korp", emptyList()))
        assertTrue(searchObjects(listOf(7L to "Korpus A"), "korp", listOf(7)).isEmpty())
        assertEquals("m" to 5L, elapsedBucket(5 * 60_000L)); assertNull(elapsedBucket(10_000L))
        assertTrue(paketListPath(8, PaketFilter(), 0).startsWith("/api/hujjat-maydoni?amal=paket_royxat&kompaniya_id=8&filtr=%7B"))
        assertEquals("f2", paketBuildBody(8, 7, buildRequest(parsePaketPage(page)!!.rows[0])!!)["tur"].str())
        assertEquals(1.0, paketBuildBody(8, 7, BuildRequest("f2", mapOf("akt_id" to 5)))["disk_afzal"].num()!!, 0.0)
    }

    private class Fake(val disk: BytesResult, val gen: BytesResult) : BffApi {
        var diskCalls = 0; var genCalls = 0
        override suspend fun bff(path: String, method: String, body: kotlinx.serialization.json.JsonElement?, etag: String?) = ApiResult(200, null)
        override suspend fun bffBytes(path: String, maxBytes: Long): BytesResult { diskCalls++; return disk }
        override suspend fun bffPostBytes(path: String, body: kotlinx.serialization.json.JsonElement, maxBytes: Long): BytesResult { genCalls++; return gen }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody) = ApiResult(404, null)
    }

    @Test fun diskCopyIsFreeAndEngineIsTheFallback() = runBlocking {
        val rows = parsePaketPage(page)!!.rows
        val api = Fake(BytesResult(200, byteArrayOf(1, 2), "application/x", "a.xlsx"), BytesResult(200, byteArrayOf(9), null, null))
        val r = PaketRepository(api).fetch(8, rows[0]) as GenResult.Ready
        assertEquals("a.xlsx", r.name); assertEquals(1, api.diskCalls); assertEquals(0, api.genCalls)
        val g = PaketRepository(api).fetch(8, rows[1]) as GenResult.Ready
        assertEquals(1, api.genCalls); assertTrue(g.name.endsWith(".xlsx"))
        // Disk read failed -> engine; no engine for the type -> Failed
        val api2 = Fake(BytesResult(404, null), BytesResult(402, null, null, null, "TOKEN_YETMAYDI"))
        assertTrue(PaketRepository(api2).fetch(8, rows[0]) is GenResult.NoTokens)
        assertTrue(PaketRepository(api2).fetch(8, rows[0].copy(type = "aosr", fileId = null)) is GenResult.Failed)
    }
}
