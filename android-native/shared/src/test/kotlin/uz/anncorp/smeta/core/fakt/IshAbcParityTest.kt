package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/ish-abc.test.ts (+ the api/t2-ish-abc.ts shapes). */
class IshAbcParityTest {
    private fun r(kat: String = "МАТ", norma: String = "1", narx: String = "", hajm: String = "", nom: String = "x", birlik: String = "м3") = AbcResurs(kat, "", nom, birlik, norma, hajm, narx, "qolda")

    @Test fun realBrickworkRowMatchesTheDatabaseResult() {
        val h = abcHisobla("0,5", listOf(r("ЧЕЛ", "170,17", "29421"), r("МАТ", "3.8808", "1360000"), r("МАШ", "0.11", "")))
        assertEquals(listOf(85.085, 1.9404, 0.055), h.qatorlar.map { it.hajm })
        assertEquals(listOf(2503285.79, 2638944.0, null), h.qatorlar.map { it.summa })
        assertEquals(5142229.79, h.jami, 0.0); assertEquals(2503285.79, h.jamiKat["ЧЕЛ"]!!, 0.0); assertEquals(2638944.0, h.jamiKat["МАТ"]!!, 0.0); assertEquals(0.0, h.jamiKat["МАШ"]!!, 0.0)
        assertEquals(1, h.narxsiz); assertNull(h.ishNarxi)
    }

    @Test fun validation() {
        val x = abcTekshir(true, AbcIsh("", "", "м3", "0"), listOf(r(norma = "0")), "")
        assertEquals(listOf("ish", "ish", "r0", "sabab"), x.map { it.joy }.sorted())
        assertTrue(abcTekshir(true, AbcIsh("", "a", "м3", "1"), listOf(r()), "s").isEmpty())
        assertEquals("resurs", abcTekshir(false, null, emptyList(), "s")[0].joy)
    }

    @Test fun bestPriceOrderNeverPicksTheCatalogue() {
        fun v(m: String, n: Double) = NarxVariant(m, n, "")
        assertEquals(7.0, abcEngYaxshiNarx(listOf(v("katalog", 5.0), v("smeta", 7.0)))!!.narx, 0.0)
        assertEquals("smeta_shartnoma", abcEngYaxshiNarx(listOf(v("smeta", 7.0), v("smeta_shartnoma", 8.0)))!!.manba)
        assertEquals("smeta_obyekt", abcEngYaxshiNarx(listOf(v("smeta_shartnoma", 8.0), v("smeta_obyekt", 9.0)))!!.manba)
        assertNull(abcEngYaxshiNarx(listOf(v("katalog", 5.0)))); assertNull(abcEngYaxshiNarx(emptyList()))
    }

    @Test fun normlessResourceUsesTheExactVolume() {
        val h = abcHisobla("2", listOf(r(norma = "", hajm = "15", narx = "1000")))
        assertEquals(15.0, h.qatorlar[0].hajm!!, 0.0); assertEquals(15000.0, h.qatorlar[0].summa!!, 0.0)
        assertTrue(abcTekshir(true, AbcIsh("", "a", "м3", "1"), listOf(r(norma = "", hajm = "3")), "s").isEmpty())
        assertEquals("r0", abcTekshir(true, AbcIsh("", "a", "м3", "1"), listOf(r(norma = "", hajm = "")), "s")[0].joy)
    }

    @Test fun categoryDetection() {
        assertEquals("ЧЕЛ", abcKatAniqla("ЧЕЛ")); assertEquals("ОБ", abcKatAniqla(null, "ob")); assertEquals("МАШ", abcKatAniqla(null, "rs", "МАШ.-Ч")); assertEquals("МАТ", abcKatAniqla(null, "rs", "м3"))
    }

    @Test fun explicitZeroPriceIsKnownMissingOrNegativeIsUnknown() {
        val known = abcHisobla("2", listOf(r(norma = "1", narx = "0")))
        assertEquals(0.0, known.qatorlar[0].summa!!, 0.0); assertEquals(0, known.narxsiz); assertEquals(0.0, known.ishNarxi!!, 0.0)
        for (p in listOf("", "-1")) { val u = abcHisobla("2", listOf(r(norma = "1", narx = p))); assertNull(u.qatorlar[0].summa); assertEquals(1, u.narxsiz); assertNull(u.ishNarxi) }
    }

    @Test fun numberParsingLikeTheSite() {
        assertEquals(1234.5, abcSon("1 234,5")!!, 0.0); assertNull(abcSon("")); assertNull(abcSon("abc")); assertNull(abcSon("1f")); assertEquals(1000.0, abcSon("1e3")!!, 0.0); assertNull(abcSon("1,2,3"))
        assertEquals(-2.68, pulYaxlit(-2.675), 0.0); assertEquals(2503285.79, pulYaxlit(85.085 * 29421), 0.0)
    }

    @Test fun libraryAnswersAndPayloads() {
        val iv = parseIshTuriRoyxat(Json.parseToJsonElement("""[{"manba":"smeta","qator_id":5,"kod":"E1","nom":"Kladka","birlik":"m3","soni":3,"shu_obyekt":true,"sostav":[{"tur":"rs","kat":"ЧЕЛ","nom":"Usta","birlik":"chel","norma":170.17,"narx":29421}]}]"""))
        assertEquals(1, iv.size); assertEquals("Kladka", iv[0].nom); assertTrue(iv[0].shuObyekt); assertEquals(170.17, iv[0].sostav[0].norma!!, 0.0)
        val rv = parseResursRoyxat(Json.parseToJsonElement("""[{"manba":"katalog","kat":"МАТ","nom":"Beton","birlik":"m3","narx":1200,"narx_manba":"katalog"}]"""))
        assertEquals("katalog", rv[0].narxManba); assertEquals(1200.0, rv[0].narx!!, 0.0)
        val nt = parseNarxTakliflari(Json.parseToJsonElement("""[{"i":1,"variantlar":[{"manba":"smeta","narx":7,"izoh":"x"}]},{"i":9,"variantlar":[]}]"""), 2)
        assertTrue(nt[0].isEmpty()); assertEquals(7.0, nt[1][0].narx, 0.0)
        val p = abcSaqlaPayload(2, 3, "additional", 10, null, 4, AbcSaqlaIsh(null, "Kladka", "m3", 0.5), abcSaqlaResurslari(listOf(r("ЧЕЛ", "170,17", "29421"), r(norma = "", hajm = "3"))), null, "2026-11-19", "sabab", "op")
        assertEquals("ish_abc_saqla_v1", p["amal"].toString().trim('"')); assertEquals("null", p["almashtirilayotgan_qator_id"].toString()); assertTrue(p["resurslar"].toString().contains("\"norma\":170.17")); assertTrue(p["resurslar"].toString().contains("\"hajm\":3.0"))
        assertEquals("qator_ish_abc_tahrir_v2", abcTahrirPayload(2, 3, 9, 7, null, emptyList(), null, null, "s", "op")["amal"].toString().trim('"'))
        assertEquals("qator_ish_abc_tahrir_v1", abcTahrirPayload(2, 3, 9, null, null, emptyList(), null, null, "s", "op")["amal"].toString().trim('"'))
        assertEquals("zamena_almashtirish_belgila_v1", zamenaAlmashtirishPayload(2, 9, 1.5)["amal"].toString().trim('"'))
        assertEquals("Smeta shu orada o‘zgargan — jadvalni yangilab qayta urinib ko‘ring.", abcXato("STALE_VERSION")); assertEquals("Saqlab bo‘lmadi.", abcXato(null))
    }

    @Test fun sourceNamesNeverShowExternalProgramNames() {
        assertEquals("QURAI katalogi", manbaKorinishi(null)); assertEquals("Mening KP faylim", manbaKorinishi("Mening KP faylim")); assertEquals("QURAI katalogi 2025", manbaKorinishi("ABC Base 2025"))
        assertEquals("QURAI katalogi 2026", manbaKorinishi("TNQ")); assertEquals("QURAI · ШНҚ 4.02.15-04 asosida", manbaKorinishi("TNQ ШНҚ 4.02.15-04"))
    }
}
