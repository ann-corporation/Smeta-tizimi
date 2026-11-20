package uz.anncorp.smeta.feature.f2

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str

class F2DraftTest {
    private fun j(s: String) = Json.parseToJsonElement(s)

    @Test fun pageParsesRowsAndServerSums() {
        val p = parseF2Page(j("""{"ok":true,"akt":{"id":7,"obyekt_id":3,"raqam":"F2-1","oy":"2026-11","lifecycle_status":"draft","versiya":4},
            "summa":{"qqs_bilan":112,"ustamali":110,"ustamasiz":100,"narxsiz_soni":2},
            "qatorlar":[{"qator_id":11,"kod":"1.1","nom":"Beton","birlik":"m3","hajm":-2.5,"narx":null,"summa":null},{"qator_id":12,"nom":null,"hajm":1}],"keyingi_offset":null}"""))!!
        assertEquals(7L, p.head.aktId); assertTrue(p.head.editable); assertEquals(4, p.head.versiya)
        assertEquals(2, p.rows.size); assertEquals(-2.5, p.rows[0].hajm!!, 0.0); assertNull(p.rows[0].narx); assertEquals("#12", p.rows[1].nom)
        assertEquals(112.0, p.sums!!.qqsBilan, 0.0); assertEquals(100.0, p.sums!!.ustamasiz, 0.0); assertEquals(2, p.unpriced); assertNull(p.next)
    }
    @Test fun submittedActIsReadOnlyAndBadShapeIsNull() {
        assertFalse(parseF2Page(j("""{"ok":true,"akt":{"id":1,"lifecycle_status":"submitted"},"qatorlar":[]}"""))!!.head.editable)
        assertNull(parseF2Page(j("""{"ok":false,"code":"TOPILMADI"}""")))
        assertNull(parseF2Page(j("""{"ok":true,"qatorlar":[]}""")))
    }
    @Test fun volumeAllowsMinusNeverZeroPriceNeverNegative() {
        assertEquals(-2.5, checkVolume("-2,5").first!!, 0.0)
        assertEquals(FieldIssue.ZERO, checkVolume("0").second); assertEquals(FieldIssue.ZERO, checkVolume("0,000").second)
        assertEquals(FieldIssue.EMPTY, checkVolume("  ").second); assertEquals(FieldIssue.FORMAT, checkVolume("abc").second)
        assertEquals(1250000.0, checkPrice("1 250 000").first!!, 0.0)
        assertEquals(FieldIssue.NEGATIVE, checkPrice("-5").second); assertEquals(0.0, checkPrice("0").first!!, 0.0)
    }
    @Test fun editsBuildServerArgs() {
        var e = DraftEdits().change(11, RowChange(hajm = -2.5)).change(12, RowChange(narx = 99.0, hajm = 4.0)).remove(13)
        assertEquals(3, e.count); assertTrue(editFits(e))
        val a = f2EditArgs(7, e, 4)
        assertEquals(7.0, a["akt_id"].num()!!, 0.0); assertEquals(4.0, a["kutilgan_versiya"].num()!!, 0.0)
        assertEquals(2, (a["ozgartir"] as JsonArray).size); assertEquals(13.0, ((a["olib_tashla"] as JsonArray)[0] as JsonPrimitive).content.toDouble(), 0.0)
        e = e.change(11, null); assertEquals(2, e.count)          // clearing a change removes it
        e = e.restore(13); assertEquals(1, e.count)
        assertNull(f2EditArgs(7, DraftEdits().remove(1), null)["kutilgan_versiya"])
        assertEquals("vosita", f2ReadBody(8, 7)["amal"].str()); assertEquals("f2", f2ReadBody(8, 7)["nom"].str())
    }
    @Test fun removingAChangedRowDropsTheChange() {
        val e = DraftEdits().change(5, RowChange(hajm = 1.0)).remove(5)
        assertTrue(e.changes.isEmpty()); assertEquals(setOf(5L), e.removed)
    }
    @Test fun previewShowsBeforeAfterAndToken() {
        val r = parseToolPreview(ApiResult(200, j("""{"ok":true,"holat":"tasdiq_kerak","token":"T1","tavsif":"F2 qoralama","ogohlantirish":["Narxsiz qator bor"],
            "preview":{"qatorlar":[{"qator_id":11,"kod":"1.1","nom":"Beton","birlik":"m3","ozgarish":[{"maydon":"certified_quantity","oldin":1,"keyin":-2.5}]},{"qator_id":12,"olib_tashlandi":true,"ozgarish":[]}],
            "jami":{"oldin":{"qqs_bilan":112,"ustamali":110,"ustamasiz":100},"keyin":{"qqs_bilan":56,"ustamali":55,"ustamasiz":50},"farq":null},"natijalar":[]}}""")))
        val p = (r as ToolResult.Preview).value
        assertEquals("T1", p.token); assertFalse(p.rejected); assertEquals(2, p.rows.size); assertEquals(-2.5, p.rows[0].changes[0].after!!, 0.0); assertTrue(p.rows[1].removed)
        assertEquals(112.0, p.totals.before!!.qqsBilan, 0.0); assertEquals(50.0, p.totals.after!!.ustamasiz, 0.0); assertNull(p.totals.diff); assertEquals(listOf("Narxsiz qator bor"), p.warnings)
    }
    @Test fun rejectedPreviewHasNoTokenAndErrorsAreUzbek() {
        val rej = (parseToolPreview(ApiResult(200, j("""{"ok":true,"holat":"rad","xabar":"Server rad etdi","preview":{"qatorlar":[],"jami":{},"natijalar":[]}}"""))) as ToolResult.Preview).value
        assertTrue(rej.rejected); assertNull(rej.token); assertEquals("Server rad etdi", rej.message)
        val off = parseToolPreview(ApiResult(0, null)) as ToolResult.Error
        assertTrue(off.offline); assertTrue(draftErrorText(off).contains("onlayn"))
        val e = parseToolPreview(ApiResult(403, j("""{"ok":false,"code":"PERMISSION_DENIED"}""")))
        assertEquals("PERMISSION_DENIED", (e as ToolResult.Error).code); assertTrue(draftErrorText(e).contains("ruxsat"))
        assertNull(parseConfirm(ApiResult(200, j("""{"ok":true,"holat":"yozildi"}"""))))
        assertNotNull(parseConfirm(ApiResult(409, j("""{"ok":false,"code":"TOKEN_YAROQSIZ"}"""))))
        assertEquals("T", f2ConfirmBody(8, "T")["token"].str()); assertEquals("tasdiq", f2ConfirmBody(8, "T")["amal"].str())
    }
    @Test fun suggestionsParseAndSummarize() {
        val l = parseSuggestions(j("""{"ok":true,"takliflar":[
            {"id":1,"qator_id":11,"nom":"Beton","bayroq":"olib_tashlansin","qaror":"kutilmoqda","qosh":false,"eskirgan":false},
            {"id":2,"qator_id":12,"nom":"Armatura","bayroq":"hajm_notogri","taklif_hajm":8.5,"joriy_hajm":10,"qaror":"qabul"},
            {"id":3,"qator_id":13,"bayroq":"hujjat_kerak","qaror":"keyinroq"},{"id":4,"qator_id":14,"qaror":"rad","qaror_sabab":"yo'q"}]}"""))!!
        assertEquals(4, l.size); assertEquals(SuggestFlag.REMOVE, l[0].flag); assertTrue(l[0].pending); assertEquals(SuggestDecision.ACCEPTED, l[1].decision)
        val s = summarize(l); assertEquals(4, s.total); assertEquals(3, s.resolved); assertEquals(1, s.docsAwaited)
        assertNull(parseSuggestions(j("""{"ok":false}"""))); assertEquals("/api/tekshiruv?amal=akt&kompaniya_id=8&akt_id=7", suggestionsPath(8, 7))
    }
    @Test fun acceptStepsMirrorThePtoRules() {
        val volume = Suggestion(1, 12, null, null, null, SuggestFlag.WRONG_VOLUME, null, 8.5, 10.0, false, SuggestDecision.PENDING, null, null, false)
        val remove = volume.copy(flag = SuggestFlag.REMOVE, suggestedVolume = null)
        assertEquals(listOf("f2_qoralama_tahrir"), acceptSteps(volume, 7, 3, 4, true).map { it.tool })
        assertEquals(listOf("f2_qoralama_tahrir", "bajarilmadi"), acceptSteps(remove, 7, 3, 4, true).map { it.tool })
        assertTrue(acceptSteps(volume, 7, 3, 4, false).isEmpty())                       // not a draft: only the decision
        assertTrue(acceptSteps(volume.copy(addRow = true), 7, 3, 4, true).isEmpty())    // add-row: by hand in the editor
        assertTrue(acceptSteps(volume.copy(flag = SuggestFlag.NEEDS_DOC, suggestedVolume = null), 7, 3, 4, true).isEmpty())
        val h = acceptSteps(volume, 7, 3, 4, true)[0].args["ozgartir"] as JsonArray
        assertEquals(1, h.size)
    }
    @Test fun rejectNeedsReasonAndBodyCarriesIt() {
        assertFalse(reasonValid(SuggestDecision.REJECTED, "  ab ")); assertTrue(reasonValid(SuggestDecision.REJECTED, "Hajm noto'g'ri")); assertTrue(reasonValid(SuggestDecision.LATER, ""))
        val b = decisionBody(9, SuggestDecision.REJECTED, "  Hajm noto'g'ri "); assertEquals("rad", b["qaror"].str()); assertEquals("Hajm noto'g'ri", b["sabab"].str())
        assertEquals("keyinroq", decisionBody(9, SuggestDecision.LATER, "x")["qaror"].str()); assertNull(decisionBody(9, SuggestDecision.ACCEPTED, null)["sabab"].str())
        assertTrue(suggestionErrorText("SABAB_KERAK").contains("sabab"))
    }
    @Test fun sectionsComeFromTheCachedTree() {
        val parent = mapOf(11L to 10L, 10L to 1L, 20L to null)
        val kind = mapOf(1L to ("rz" to "Poydevor"), 10L to ("bl" to "Beton"), 11L to ("rs" to "Sement"))
        assertEquals("Poydevor", sectionOf(11, parent, kind)); assertEquals("Poydevor", sectionOf(10, parent, kind)); assertNull(sectionOf(20, parent, kind)); assertNull(sectionOf(99, parent, kind))
        val g = groupBySection(listOf(11L, 20L, 10L), { it }) { sectionOf(it, parent, kind) }
        assertEquals(listOf("Poydevor", null), g.map { it.first }); assertEquals(listOf(11L, 10L), g[0].second)
    }
}
