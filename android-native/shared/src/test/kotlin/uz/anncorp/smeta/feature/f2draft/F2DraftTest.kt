package uz.anncorp.smeta.feature.f2draft

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str

class F2DraftTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun j(s: String): JsonElement = json.parseToJsonElement(s)

    private val sheet = """{"ok":true,"akt":{"id":501,"raqam":"17","versiya":4,"holat":"qoralama","lifecycle_status":"draft"},
      "summa":{"qqs_bilan":112,"ustamali":100,"ustamasiz":90},
      "qatorlar":[{"id":1,"qator_id":11,"kod":"C1","nom":"Beton","birlik":"m3","hajm":10,"narx":5,"summa":50},
                  {"id":2,"qator_id":12,"kod":"C2","nom":"Armatura","birlik":"t","hajm":-2.5,"narx":null,"summa":null}],"keyingi_offset":null}"""

    @Test fun sheetKeepsMinusAndUnknownPrices() {
        val s = parseSheet(j(sheet))!!
        assertEquals(4, s.act.versiya); assertTrue(s.act.editable)
        assertEquals(2, s.rows.size); assertTrue(s.rows[1].minus); assertNull(s.rows[1].narx); assertNull(s.rows[1].summa)
        assertEquals(112.0, s.total!!.qqsBilan)
    }

    @Test fun approvedActIsNotEditable() {
        val s = parseSheet(j(sheet.replace("\"draft\"", "\"approved\"").replace("qoralama", "tasdiqlangan")))!!
        assertFalse(s.act.editable)
    }

    @Test fun previewShowsOldToNewTotalsAndWarnings() {
        val p = parsePreview(j("""{"ok":true,"holat":"tasdiq_kerak","token":"tk1","tavsif":"2 qator","ogohlantirish":["smeta hajmidan oshadi"],
          "preview":{"qatorlar":[{"qator_id":11,"kod":"C1","nom":"Beton","birlik":"m3","ozgarish":[{"maydon":"hajm","oldin":10,"keyin":12}]},{"qator_id":12,"olib_tashlandi":true,"ozgarish":[]}],
          "jami":{"oldin":{"qqs_bilan":112,"ustamali":100,"ustamasiz":90},"keyin":{"qqs_bilan":134.4,"ustamali":120,"ustamasiz":108},"farq":{"qqs_bilan":22.4,"ustamali":20,"ustamasiz":18}},
          "natijalar":[{"rpc":"t2_f2_qoralama_yangila_v1","ok":false,"xabar":"versiya"}]}}"""))!!
        assertEquals("tk1", p.token); assertEquals(2, p.rows.size)
        assertEquals(Change("hajm", 10.0, 12.0), p.rows[0].changes[0]); assertTrue(p.rows[1].removed)
        assertEquals(134.4, p.after!!.qqsBilan); assertEquals(22.4, p.diff!!.qqsBilan)
        assertEquals(listOf("smeta hajmidan oshadi"), p.warnings); assertEquals(listOf("versiya"), p.failedSteps)
    }

    @Test fun cellChecksMatchTheSite() {
        assertTrue(checkHajm("-3,5") is CellCheck.Valid)
        assertEquals(-3.5, (checkHajm("-3,5") as CellCheck.Valid).value, 0.0)
        assertTrue(checkHajm("0") is CellCheck.Invalid); assertTrue(checkHajm("abc") is CellCheck.Invalid)
        assertTrue(checkNarx("1 250,5") is CellCheck.Valid); assertTrue(checkNarx("-1") is CellCheck.Invalid)
    }

    @Test fun editBodyCarriesVersionAndOnlyChangedFields() {
        val b = editBody(17, 501, 4, listOf(RowEdit(11, hajm = 12.0), RowEdit(12, narxsiz = true)), listOf(13))
        val a = b["args"]!!.jsonObject
        assertEquals("f2_qoralama_tahrir", b["nom"].str()); assertEquals(4.0, a["kutilgan_versiya"].num())
        val oz = a["ozgartir"] as kotlinx.serialization.json.JsonArray
        assertEquals(12.0, oz[0].jsonObject["hajm"].num()); assertNull(oz[0].jsonObject["narx"])
        assertEquals("true", oz[1].jsonObject["narxsiz"].str()); assertEquals(1, (a["olib_tashla"] as kotlinx.serialization.json.JsonArray).size)
        assertNull(editBody(17, 501, null, listOf(RowEdit(1, hajm = 1.0)), emptyList())["args"]!!.jsonObject["kutilgan_versiya"])
    }

    private fun taklif(extra: String) = parseTakliflar(j("""{"ok":true,"takliflar":[{"id":7,"qator_id":11,"qaror":"kutilmoqda","qosh":false,"eskirgan":false $extra}]}"""))!!.first()

    @Test fun qabulStepsFollowTheSiteRules() {
        val hajm = taklif(""","taklif_hajm":8""")
        assertEquals(listOf("f2_qoralama_tahrir"), qabulQadamlari(hajm, 17, 501, 9, 4, true).map { it.nom })
        val rm = taklif(""","bayroq":"olib_tashlansin"""")
        assertEquals(listOf("f2_qoralama_tahrir", "bajarilmadi"), qabulQadamlari(rm, 17, 501, 9, 4, true).map { it.nom })
        assertTrue(qabulQadamlari(hajm, 17, 501, 9, 4, false).isEmpty())          // not a draft: decision only
        assertTrue(qabulQadamlari(taklif(""","qosh":true"""), 17, 501, 9, 4, true).isEmpty())
        assertTrue(qabulQadamlari(taklif(""","bayroq":"qabul""""), 17, 501, 9, 4, true).isEmpty())
    }

    @Test fun summaryCountsPendingDocuments() {
        val l = parseTakliflar(j("""{"ok":true,"takliflar":[{"id":1,"qator_id":1,"qaror":"qabul"},{"id":2,"qator_id":2,"qaror":"kutilmoqda","bayroq":"hujjat_kerak"}]}"""))!!
        assertEquals(TakliflarXulosa(2, 1, 1), takliflarXulosa(l))
    }

    /** A scripted gateway: records the bodies, answers read / preview / confirm like /api/f2-buyruq. */
    private class FakeApi(val answers: MutableList<ApiResult>) : BffApi {
        val sent = ArrayList<JsonObject>()
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { sent += (body as JsonObject); return answers.removeAt(0) }
        override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
    }

    @Test fun previewThenConfirmWritesOnlyOnConfirm() = runBlocking {
        val api = FakeApi(mutableListOf(
            ApiResult(200, j("""{"ok":true,"token":"tk","preview":{"qatorlar":[],"jami":{},"natijalar":[]}}""")),
            ApiResult(200, j("""{"ok":true,"holat":"yozildi"}""")),
        ))
        val repo = F2DraftRepository(api)
        val p = repo.preview(editBody(17, 501, 4, listOf(RowEdit(11, hajm = 3.0)), emptyList()))
        assertEquals("tk", (p as F2Out.Ok).value.token)
        assertEquals("vosita", api.sent[0]["amal"].str())            // preview = a tool call, no write
        assertTrue(repo.confirm(17, "tk") is F2Out.Ok)
        assertEquals("tasdiq", api.sent[1]["amal"].str()); assertEquals("tk", api.sent[1]["token"].str())
        assertEquals("true", (api.sent[1]["tasdiqlayman"] as JsonPrimitive).content)
    }

    @Test fun conflictAndOfflineAreReported() = runBlocking {
        val api = FakeApi(mutableListOf(ApiResult(409, j("""{"ok":false,"code":"REJA_O_ZGARDI"}"""), "REJA_O_ZGARDI"), ApiResult(0, null, "NETWORK")))
        val repo = F2DraftRepository(api)
        val a = repo.confirm(17, "tk") as F2Out.Fail
        assertTrue(a.stale); assertTrue(f2FailText(a).contains("o'zgargan"))
        val b = repo.confirm(17, "tk")
        assertNotNull(b)
    }

    @Test fun rejectNeedsReason() = runBlocking {
        val repo = TakliflarRepository(FakeApi(mutableListOf()))
        assertEquals("SABAB_KERAK", repo.decide(7, "rad", "ab"))
    }

    @Test fun pendingEditsDropWhenBackToOriginalAndValidate() {
        val s = parseSheet(j(sheet))!!; val r = s.rows[0]
        var e = DraftEdits().setCell(r, "hajm", "12,5")
        assertEquals(1, e.count); assertEquals(12.5, e.toEdits()!![0].hajm!!, 0.0)
        e = e.setCell(r, "hajm", "10")                       // original value: no change
        assertTrue(e.isEmpty)
        e = e.setCell(r, "hajm", "0").setCell(s.rows[1], "narx", "-5")
        assertEquals(2, e.errors().size); assertNull(e.toEdits())
        assertEquals(1, e.remove(listOf(11L)).errors().size)  // a removed row is not validated
        assertNull(e.remove(listOf(11L)).toEdits())
        assertNotNull(DraftEdits().remove(listOf(11L)).toEdits())
    }

    @Test fun narxsizAndLimits() {
        val s = parseSheet(j(sheet))!!
        val e = DraftEdits().markNarxsiz(s.rows[1], true)
        assertEquals(true, e.toEdits()!![0].narxsiz); assertNull(e.toEdits()!![0].narx)
        assertTrue(DraftEdits(cells = (1L..101L).associateWith { Pending(hajm = "1") }).limitText()!!.contains("100"))
        assertNull(DraftEdits().limitText())
    }
}