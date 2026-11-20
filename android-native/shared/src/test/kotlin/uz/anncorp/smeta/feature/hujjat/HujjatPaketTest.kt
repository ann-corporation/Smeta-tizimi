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
    }

    private class Fake(val handler: (String, String, kotlinx.serialization.json.JsonElement?) -> ApiResult, val bytes: BytesResult) : BffApi {
        val calls = ArrayList<Pair<String, kotlinx.serialization.json.JsonElement?>>()
        override suspend fun bff(path: String, method: String, body: kotlinx.serialization.json.JsonElement?, etag: String?): ApiResult { calls += path to body; return handler(path, method, body) }
        override suspend fun bffBytes(path: String, maxBytes: Long): BytesResult { calls += path to null; return bytes }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody) = ApiResult(404, null)
    }

    @Test fun serverBuildsAndThePhoneOnlyDownloads() = runBlocking {
        val link = j("""{"ok":true,"havola":"/api/hujjat-paket?amal=ol&k=paket%2Fu1%2Fx","hajm":3,"soni":2,"xatolar":["bir hujjat olinmadi"]}""")
        val api = Fake({ _, _, _ -> ApiResult(200, link) }, BytesResult(200, byteArrayOf(1, 2, 3), "application/zip", "hujjatlar-paketi.zip"))
        val r = PaketRepository(api).build(8, PaketFilter(turlar = setOf("f2")), listOf("f2:5"), PaketFormat.ZIP, "HUJJATLAR PAKETI") as PaketBuild.Ready
        assertEquals("hujjatlar-paketi.zip", r.name); assertEquals(listOf("bir hujjat olinmadi"), r.errors)
        val body = api.calls[0].second as kotlinx.serialization.json.JsonObject
        assertEquals("yig", body["amal"].str()); assertEquals("zip", body["chiqish"].str()); assertEquals("havola", body["yetkazish"].str())
        assertEquals("f2:5", (body["kalitlar"] as kotlinx.serialization.json.JsonArray)[0].str())
        assertTrue(api.calls[1].first.startsWith("/api/hujjat-paket?amal=ol"))
        // tokens: the server refuses -> NoTokens; nothing is downloaded
        val api2 = Fake({ _, _, _ -> ApiResult(402, null, "TOKEN_YETMAYDI") }, BytesResult(404, null))
        assertTrue((PaketRepository(api2).build(8, PaketFilter(), emptyList(), PaketFormat.EXCEL, "P") as PaketBuild.Failed).result is GenResult.NoTokens)
        assertEquals(1, api2.calls.size)
    }

    @Test fun estimateIsAServerAnswerAndChargesNothing() = runBlocking {
        val e = parsePaketEstimate(j("""{"ok":true,"tanlangan":3,"tolanadigan":1,"bepul":2,"token":12.5}"""))!!
        assertEquals(PaketEstimate(3, 1, 2, 12.5), e)
        assertNull(parsePaketEstimate(j("""{"ok":false}""")).also { assertNull(parsePaketLink(j("""{"ok":true,"havola":"/etc/passwd"}"""))) })
        val api = Fake({ _, _, _ -> ApiResult(200, j("""{"ok":true,"tanlangan":1,"tolanadigan":0,"bepul":1,"token":0}""")) }, BytesResult(404, null))
        assertEquals(0.0, PaketRepository(api).estimate(8, PaketFilter(), listOf("a"))!!.token!!, 0.0)
        assertEquals("baho", (api.calls[0].second as kotlinx.serialization.json.JsonObject)["amal"].str())
    }
}