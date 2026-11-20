package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: t2-bajarilmadi.ts / fakt-studio.ts (bajarilmadiHajmlar, bajarilmadiTaklif) / resurs-amal.ts (chiqarilganmi) / ish-varaq model (chiqarilganlarOl). */
class BajarilmadiParityTest {
    @Test fun sumsOnlyActiveMarksPerRow() {
        val l = parseBajarilmadiRoyxat(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"qatorlar":[
            {"id":1,"qator_id":7,"bajarilmagan_hajm":2,"sabab_kod":"texnik_sabab","holat":"faol","sana":"2026-11-01"},
            {"id":2,"qator_id":7,"bajarilmagan_hajm":3,"sabab_kod":"boshqa","holat":"faol"},
            {"id":3,"qator_id":7,"bajarilmagan_hajm":9,"sabab_kod":"boshqa","holat":"bekor"}]}}"""))!!
        assertEquals(mapOf(7L to 5.0), bajarilmadiHajmlar(l))
        assertNull(parseBajarilmadiRoyxat(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":false}}""")))
    }

    @Test fun takenOutOnlyWhenWholeKnownSmetaIsCovered() {
        assertTrue(chiqarilganmi(10.0, 10.0)); assertTrue(chiqarilganmi(-4.0, 4.0)); assertFalse(chiqarilganmi(10.0, 9.0))
        assertFalse(chiqarilganmi(null, 5.0)); assertFalse(chiqarilganmi(0.0, 0.0)); assertFalse(chiqarilganmi(10.0, null))
    }

    @Test fun takenOutResourcesOnly() {
        fun r(id: Long, tur: String, h: Double?) = T2Qator(id = id, otaId = null, daraja = 1, tur = tur, kod = null, nom = "n", birlik = null, hajm = h, kat = null, qoshimcha = false, zamena = false, versiya = 1, norma = null, narx = null)
        val rows = listOf(r(1, "mat", 5.0), r(2, "bl", 5.0), r(3, "ob", null), r(4, "rs", 8.0))
        val states = listOf(JurnalHolat(1, smetaHajm = 5.0), JurnalHolat(2, smetaHajm = 5.0), JurnalHolat(4, smetaHajm = 8.0))
        assertEquals(setOf(1L), chiqarilganlarOl(rows, states, mapOf(1L to 5.0, 2L to 5.0, 3L to 1.0, 4L to 3.0)))
    }

    @Test fun suggestionIsOpenRemainderNeverNegative() {
        assertEquals(6.0, bajarilmadiTaklif(10.0, 3.0, 1.0)!!, 0.0); assertEquals(0.0, bajarilmadiTaklif(10.0, 12.0, 0.0)!!, 0.0); assertNull(bajarilmadiTaklif(null, 1.0, 0.0))
        assertEquals(5.0, bajarilmadiTaklif(10.0, 3.0, 1.0, 1.0)!!, 0.0)
    }

    @Test fun payloadsMatchTheSiteShape() {
        val p = bajarilmadiBelgilaPayload(2, 3, 7, null, "texnik_sabab", " ", "2026-11-19", "op")
        assertEquals("bajarilmadi_belgila", p["amal"].toString().trim('"')); assertTrue(p["sabab_izoh"] == null); assertEquals("null", p["qatorlar"]!!.toString().substringAfter("\"hajm\":").substringBefore("}"))
        assertEquals("bajarilmadi_bekor", bajarilmadiBekorPayload(2, 9, "op")["amal"].toString().trim('"'))
        assertEquals("Sabab «Boshqa» bo‘lsa izoh yozish shart.", bajarilmadiXato("SABAB_IZOH_MAJBURIY"))
    }
}
