package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.fakt.PodvalTexts.Koef

/** PARITY with the website: fixtures of frontend/src/lib/qiymat-uchlik.test.ts (qiymatUchligi) + useUstamaliSumma / podvalTanla scope rules. */
class UstamaParityTest {
    private val NK: Map<String, Double?> = mapOf(
        Koef.TRANSPORT_MATERIAL to 5.0, Koef.SKLADSKIE_MATERIAL to 2.0, Koef.SKLADSKIE_MK to 0.75, Koef.TRANSPORT_KABEL to 1.5, Koef.PROCHIE_PODRYADCHIK to 18.0,
        Koef.TRANSPORT_OBORUD to 2.0, Koef.ZAGOT_SKLAD_OBORUD to 1.2, Koef.STRAXOVANIE to 0.32, Koef.RISK to 0.0, Koef.NDS to 12.0,
    )
    private fun kesim(vararg p: Pair<String?, Double>): Kesim { val k = bosKesim(); for ((kat, s) in p) kesimgaQosh(k, kat, s); return k }

    @Test fun vatBilanIsTheServerCascadeTotal() {
        val k = kesim("ЧЕЛ" to 1_000_000.0)
        val h = hisob(k, null, NK); val q = qiymatUchligi(h, 1_000_000.0)
        assertEquals(h.qqsBilan, q.qqsBilan); assertEquals(h.ustamali, q.ustamali); assertEquals(1_000_000.0, q.ustamasiz!!, 0.0); assertFalse(q.taxminiy); assertNull(q.sabab)
        assertEquals(yaxlit2(q.ustamali!! * 1.12), q.qqsBilan!!, 0.011)
    }

    @Test fun nullSumNeverZero() {
        val h = hisob(kesim("ЧЕЛ" to 1000.0), null, NK)
        assertEquals("SUMMA_YOQ", qiymatUchligi(h, null).sabab); assertNull(qiymatUchligi(h, null).ustamasiz)
        val q = qiymatUchligi(null, 500.0); assertNull(q.qqsBilan); assertNull(q.ustamali); assertEquals(500.0, q.ustamasiz!!, 0.0); assertEquals("HISOBLANMADI", q.sabab)
        assertEquals("KOEF_YOQ", qiymatUchligi(hisob(kesim("ЧЕЛ" to 1000.0), null, null), 1000.0).sabab)
    }

    @Test fun unknownCategoryIsApproximateAndAddedOnce() {
        val q = qiymatUchligi(hisob(kesim("МАТ" to 1000.0, null to 500.0), null, NK), 1500.0)
        val tayanch = qiymatUchligi(hisob(kesim("МАТ" to 1000.0), null, NK), 1000.0)
        assertTrue(q.taxminiy); assertEquals(500.0, q.nomalum, 0.0)
        assertEquals(tayanch.ustamali!! + 500, q.ustamali!!, 0.011); assertEquals(tayanch.qqsBilan!! + 500 * 1.12, q.qqsBilan!!, 0.011)
    }

    @Test fun allUnknownCategoryMeansUnknownMarkup() {
        val q = qiymatUchligi(hisob(kesim(null to 500.0), null, NK), 500.0)
        assertEquals("KAT_NOMALUM", q.sabab); assertNull(q.ustamali); assertNull(q.qqsBilan); assertEquals(500.0, q.nomalum, 0.0)
    }

    @Test fun parsesNakrutkaAndPicksPodvalByScope() {
        val nk = parseNakrutka(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"koeffitsientlar":{"НДС":12,"РИСК":0},"svod_yaxlit":{"qqssiz":10,"barglar":8,"summasiz":2,"bolimlar":[{"qator_id":5,"nom":"A","svod_summa":null,"qqs_stavka":12,"qqssiz":10,"barglar":8}]}}}"""))
        assertNotNull(nk); assertEquals(12.0, nk!!.first["НДС"]!!, 0.0); assertEquals(5L, nk.second!!.bolimlar[0].qatorId)
        assertNull(parseNakrutka(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":false}}""")))
        fun podval(nom: String, oid: String, sid: String) = """{"obyekt_id":$oid,"shartnoma_id":$sid,"nom":"$nom","qatorlar":[{"kod":"pryamye","nom":"P","tur":"jami","baza":[{"kat":"ЧЕЛ","k":1}]},{"kod":"vsego","nom":"V","tur":"jami","baza":[{"qator":"pryamye"}]}]}"""
        val royxat = Json.parseToJsonElement("""{"ok":true,"qatorlar":[${podval("kompaniya", "null", "null")},${podval("shartnoma", "null", "7")},${podval("obyekt", "3", "null")}]}""")
        assertEquals("obyekt", parsePodvalTanlov(royxat, 3, 7).podval!!.nom); assertEquals("shartnoma", parsePodvalTanlov(royxat, 4, 7).podval!!.nom); assertEquals("kompaniya", parsePodvalTanlov(royxat, 4, null).podval!!.nom)
        assertNull(parsePodvalTanlov(Json.parseToJsonElement("""{"ok":true,"qatorlar":[]}"""), 1).podval)
        assertTrue(parsePodvalTanlov(Json.parseToJsonElement("""{"ok":true,"toliq":false,"qatorlar":[]}"""), 1).xato)
        assertTrue(parsePodvalTanlov(Json.parseToJsonElement("""{"ok":true,"qatorlar":[{"obyekt_id":1,"qatorlar":[{"kod":"x","nom":"x","tur":"nomalum"}]}]}"""), 1).xato)
    }

    @Test fun unreadablePodvalKeepsMarkupUnknown() {
        val q = UstamaMalumot(NK, null, null, podvalXato = true).uchlik(kesim("ЧЕЛ" to 1000.0), 1000.0)
        assertEquals("PODVAL_TOLIQ_EMAS", q.sabab); assertNull(q.ustamali); assertEquals(1000.0, q.ustamasiz!!, 0.0)
        assertEquals("HISOBLANMADI", (null as UstamaMalumot?).uchlik(kesim("ЧЕЛ" to 1000.0), 1000.0).sabab)
    }
}
