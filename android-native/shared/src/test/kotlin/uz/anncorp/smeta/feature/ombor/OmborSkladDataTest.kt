package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OmborSkladDataTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun el(s: String) = json.parseToJsonElement(s)

    @Test fun hisobotRequestCarriesOnlySetFilters() {
        val b = hisobotRequest(7, 3, HisobotFilter(davr = "bugun", qidir = " sement "), 50)
        assertEquals("hisobot", b["amal"].toString().trim('"')); assertEquals("50", b["offset"].toString())
        val f = b["filtr"]!!.jsonObject
        assertEquals("\"bugun\"", f["davr"].toString()); assertEquals("\"sement\"", f["qidir"].toString()); assertNull(f["dan"]); assertNull(f["operatsiya"])
        val range = hisobotRequest(7, 3, HisobotFilter(davr = "ixtiyoriy", dan = "2026-01-01", gacha = "2026-01-31"), 0)["filtr"]!!.jsonObject
        assertEquals("\"2026-01-01\"", range["dan"].toString())
    }

    @Test fun hisobotParse() {
        val h = parseHisobot(el("""{"ok":true,"jami":{"kirim_soni":2,"chiqim_soni":1,"birliklar":[{"birligi":"qop","kirim":10,"chiqim":4}],"kirim_summa":100,"kirim_summa_qqs":112,"narxsiz_soni":1,"qqs_foiz":12},"chetlatilgan":2,"jami_qator":3,"qatorlar":[{"id":5,"sana":"2026-11-01","operatsiya":"prixod","nomi":"A","birligi":"qop","obyomi":10,"kontragent":"X","obyekt":null,"summa":null,"summa_qqs":null}]}"""))!!
        assertEquals(2, h.jami.kirimSoni); assertEquals(1, h.jami.narxsiz); assertEquals(3, h.jamiQator); assertTrue(h.rows[0].kirim); assertNull(h.rows[0].summa)
        assertNull(parseHisobot(el("""{"ok":false}""")))
    }

    @Test fun qoldiqRequestDateAndPositive() {
        val b = qoldiqRequest(1, 2, "", true, "2026-10-01", 50)
        assertEquals("\"2026-10-01\"", b["sana"].toString()); assertEquals("\"1\"", b["filtr"]!!.jsonObject["musbat"].toString())
        assertNull(qoldiqRequest(1, 2, "", false, null, 0)["sana"])
        val p = parseQoldiq(el("""{"ok":true,"jami":1,"qatorlar":[{"kalit":"k","nomi":"N","birligi":"m3","kirim":5,"chiqim":6,"qoldiq":-1,"variantlar_soni":2}]}"""))!!
        assertEquals(-1.0, p.rows[0].qoldiq, 0.0); assertEquals(2, p.rows[0].variantlar)
    }

    @Test fun correctionRules() {
        assertFalse(tuzatValid("5", "", false)); assertFalse(tuzatValid("0", "x", false)); assertTrue(tuzatValid("2,5", "x", false)); assertTrue(tuzatValid("", "x", true))
        assertEquals("null", tuzatBody(1, 2, 3, null, " r ", "op")["yangi"].toString()); assertEquals("\"r\"", tuzatBody(1, 2, 3, "4,5", " r ", "op")["sabab"].toString())
        assertEquals("{\"miqdor\":\"4.5\"}", tuzatBody(1, 2, 3, "4,5", "r", "op")["yangi"].toString())
    }

    @Test fun kirimListParsesAndStornoWindow() {
        val p = parseKirimRoyxat(el("""{"ok":true,"natija":{"ok":true,"jami":2,"rasxod_kiritilgan":false,"qatorlar":[{"id":1,"sana":"2026-11-01","nomi":"A","birligi":"qop","obyomi":3,"postavshik":null,"storno":false,"yaratildi":"2026-11-18T10:00:00+00:00","manba_fayl_id":9,"manba_varaq":"Приход","manba_qator":4}],"jami_materiallar":[{"nomi":"A","birligi":"qop","kirim":3,"storno":1,"sof_kirim":2}]}}"""))!!
        assertEquals(1, p.rows.size); assertFalse(p.rasxodKiritilgan); assertEquals(2.0, p.materiallar[0].sofKirim, 0.0)
        val r = p.rows[0]; val t = java.time.OffsetDateTime.parse("2026-11-18T10:00:00+00:00").toInstant().toEpochMilli()
        assertTrue(stornoPossible(r, t + 3_600_000)); assertFalse(stornoPossible(r, t + 25 * 3_600_000)); assertFalse(stornoPossible(r.copy(storno = true), t + 1000))
        assertEquals("window", stornoMessageKey("STORNO_WINDOW_EXPIRED")); assertEquals("fail", stornoMessageKey(null))
        assertNull(parseKirimRoyxat(el("""{"ok":true,"natija":{"ok":false}}""")))
    }

    @Test fun konsolidatsiyaShares() {
        val rows = parseKons(json.parseToJsonElement("""[{"material_nomi":"M","birligi":"t","jami_qoldiq":10,"obyektlar_boyicha":[{"obyekt_id":1,"obyekt_nom":"A","qoldiq":6},{"obyekt_id":2,"obyekt_nom":"B","qoldiq":-4}]}]""").jsonArray.map { it.jsonObject })
        assertEquals(1, rows.size)
        val s = konsShares(rows[0].obyektlar); assertEquals(1.0, s[0].share, 1e-9); assertEquals(0.0, s[1].share, 1e-9); assertTrue(s[1].negative); assertEquals("A", s[0].obj.nom)
        assertEquals(0.0, konsShares(listOf(KonsObj(1, "A", 0.0)))[0].share, 0.0)
    }

    @Test fun stampAndState() {
        assertEquals("18.11.2026 17:15", skladStamp("2026-11-18T17:15:00+00:00")); assertEquals("—", skladStamp(null)); assertEquals("zzz", skladStamp("zzz"))
        assertEquals(-1, skladPositionState(-2.0)); assertEquals(0, skladPositionState(0.0)); assertEquals(1, skladPositionState(3.0))
        assertNotNull(jurnalRequest(1, 2)["ustunlar"])
    }
}
