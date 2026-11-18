package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OmborReportTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun obj(s: String) = json.parseToJsonElement(s).jsonObject

    @Test fun questionWithButtons() {
        val q = parseAskQuestion(obj("""{"ok":true,"holat":"savol","matn":"sement 10","savol":"Kirimmi yoki chiqimmi?","variantlar":[{"yorliq":"Kirim","tanlov":{"amal":"prixod"}},{"yorliq":"Chiqim","tanlov":{"amal":"chiqim"}},{"yorliq":"bad","tanlov":{"amal":"xxx"}}]}"""))!!
        assertEquals("Kirimmi yoki chiqimmi?", q.text)
        assertEquals(listOf("Kirim", "Chiqim"), q.options.map { it.label })
        assertEquals("prixod", q.options[0].amal)
        assertEquals("sement 10", q.heard)
    }

    @Test fun questionWithoutButtonsStillAsks() {
        val q = parseAskQuestion(obj("""{"ok":true,"holat":"savol","savol":"Qaysi material?","variantlar":[]}"""))!!
        assertTrue(q.options.isEmpty())
        assertEquals("Qaysi material?", q.text)
    }

    @Test fun otherStatesAreNotQuestions() {
        assertNull(parseAskQuestion(obj("""{"ok":true,"holat":"tasdiq_kerak"}""")))
        assertNull(parseAskQuestion(obj("""{"ok":true,"holat":"tushunilmadi"}""")))
    }

    @Test fun answerResendsTheSameTextWithTheChoice() {
        val b = askAnswerBody(3, 9, "ru", "sement 10 qop", AskOption("Alfa", kontragent = "Alfa-snab", nomi = "Sement", birligi = "qop"))
        assertEquals("tahlil", b["amal"]!!.jsonPrimitive.content)
        assertEquals("rus", b["til"]!!.jsonPrimitive.content)
        assertEquals("sement 10 qop", b["matn"]!!.jsonPrimitive.content)
        val t = b["tanlov"]!!.jsonObject
        assertEquals("Alfa-snab", t["kontragent"]!!.jsonPrimitive.content)
        assertEquals("Sement", t["nomi"]!!.jsonPrimitive.content)
        assertNull(t["amal"])
    }

    @Test fun reportParsesTotalsAndRowsAndKeepsUnknownSumsNull() {
        val r = parseReport(json.parseToJsonElement("""{"ok":true,"davr":{"belgi":"oy","dan":"2026-11-01","gacha":"2026-11-30"},"jami":{"kirim_soni":2,"chiqim_soni":1,"birliklar":[{"birligi":"qop","kirim":50,"chiqim":10}],"kirim_summa":1000,"kirim_summa_qqs":1120,"chiqim_summa":null,"chiqim_summa_qqs":null,"narxsiz_soni":1,"qqs_foiz":12},"jami_qator":3,
            "qatorlar":[{"id":1,"sana":"2026-11-03","operatsiya":"prixod","nomi":"Sement","birligi":"qop","obyomi":50,"kontragent":"X","obyekt_id":null,"narx":20,"summa":1000,"summa_qqs":1120,"izoh":null},
                        {"id":2,"sana":"2026-11-04","operatsiya":"rasxod","nomi":"Sement","birligi":"qop","obyomi":10,"kontragent":null,"obyekt":"Blok A","narx":null,"summa":null,"summa_qqs":null}]}"""))!!
        assertEquals("2026-11-01", r.from)
        assertEquals(2, r.totals.incomeCount)
        assertNull(r.totals.expenseSum)
        assertEquals(1, r.totals.unpriced)
        assertEquals(listOf(true, false), r.rows.map { it.income })
        assertNull(r.rows[1].sum)
        assertEquals("Blok A", r.rows[1].objectName)
        assertEquals(3, r.totalRows)
    }

    @Test fun reportBodyUsesPresetOrRange() {
        val p = reportBody(1, 2, ReportPeriod.LAST_MONTH, null, null, " sement ", null)["filtr"]!!.jsonObject
        assertEquals("otgan_oy", p["davr"]!!.jsonPrimitive.content)
        assertEquals("sement", p["qidir"]!!.jsonPrimitive.content)
        val r = reportBody(1, 2, null, "2026-11-01", "2026-11-10", null, true)["filtr"]!!.jsonObject
        assertEquals("ixtiyoriy", r["davr"]!!.jsonPrimitive.content)
        assertEquals("2026-11-10", r["gacha"]!!.jsonPrimitive.content)
        assertEquals("chiqim", r["operatsiya"]!!.jsonPrimitive.content)
    }

    @Test fun stockOnDate() {
        val rows = parseStockOnDate(json.parseToJsonElement("""{"ok":true,"sana":"2026-11-01","jami":1,"qatorlar":[{"nomi":"Qum","birligi":"m3","qoldiq":12.5,"kirim":20,"chiqim":7.5,"oxirgi_sana":"2026-10-30"},{"birligi":"x"}]}"""))!!
        assertEquals(1, rows.size)
        assertEquals(12.5, rows[0].qty!!, 0.0)
        assertEquals("2026-11-01", stockOnDateBody(1, 2, "2026-11-01", null)["sana"]!!.jsonPrimitive.content)
        assertNull(parseStockOnDate(json.parseToJsonElement("""{"ok":false}""")))
    }
}
