package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/fakt-korinish.test.ts and the packet decode / holat derivation (ombor/paket.ts, hisob-yadro/holat.paritet.test.ts). */
class FaktKorinishParityTest {
    private fun bolim(id: Long, ota: Long? = null, ulush: Double? = null, ishSoni: Int = 0) = JurnalBolim(id, ota, 0, "b", 1, ulush, ishSoni, 0)
    private fun ish(id: Long, holat: HolatTur) = JurnalIsh(JurnalQator(id, "bl", null, "n", null, null, 0.0, null, 0.0, null, null, holat, null, false, false, null, null, null, null, null, null), emptyList(), emptyList())

    @Test fun meterSharesAndFlags() {
        val m = faktMeter(100.0, 55.0, 40.0, 70.0)
        assertEquals(55.0, m.foiz!!, 1e-9); assertEquals(0.4, m.f2Ulush, 1e-9); assertEquals(0.15, m.faktUlush, 1e-9); assertEquals(0.15, m.yangiUlush, 1e-9); assertEquals(70.0, m.yangiFoiz!!, 1e-9)
        assertFalse(m.oshdi); assertFalse(m.f2Oldinda)
        val o = faktMeter(100.0, 120.0, 100.0)
        assertEquals(120.0, o.foiz!!, 1e-9); assertEquals(1.0, o.f2Ulush + o.faktUlush + o.yangiUlush, 1e-9); assertTrue(o.oshdi); assertTrue(faktMeter(100.0, 90.0, 0.0, 130.0).yangiOshdi)
        val f = faktMeter(100.0, 30.0, 60.0)
        assertTrue(f.f2Oldinda); assertEquals(0.3, f.f2Ulush, 1e-9); assertEquals(0.0, f.faktUlush, 0.0)
        assertNull(faktMeter(null, 5.0, 0.0).foiz); assertNull(faktMeter(0.0, 5.0, 0.0).foiz)
        val c = faktMeter(-10.0, -5.0, null)
        assertEquals(50.0, c.foiz!!, 1e-9); assertEquals(0.5, c.faktUlush, 1e-9)
        assertEquals("99%", foizMatn(99.7)); assertEquals("<1%", foizMatn(0.3)); assertEquals("100%", foizMatn(100.0)); assertEquals("—", foizMatn(null))
    }

    @Test fun summaryAndObjectCompletion() {
        val bolimlar = listOf(bolim(1, ulush = 1.0, ishSoni = 2), bolim(2, 1, 1.0, 1), bolim(3, ulush = 0.2, ishSoni = 8))
        val ishlar = mapOf(1L to listOf(ish(10, HolatTur.Tugadi)), 2L to listOf(ish(11, HolatTur.Oshdi)), 3L to listOf(ish(12, HolatTur.Qisman), ish(13, HolatTur.Yangi)))
        val x = jurnalXulosa(bolimlar, ishlar)
        assertEquals(4, x.ishJami); assertEquals(mapOf(HolatTur.Yangi to 1, HolatTur.Qisman to 1, HolatTur.Tugadi to 1, HolatTur.Oshdi to 1, HolatTur.Smetasiz to 0), x.ishlar)
        assertEquals(2, x.bolimJami); assertEquals(1, x.bolimTugagan)
        val u = obyektUlushi(bolimlar) { mapOf(1L to 100.0, 3L to 900.0)[it] }
        assertEquals("summa", u.usul); assertEquals((100 * 1 + 900 * 0.2) / 1000, u.ulush!!, 1e-9)
        val u2 = obyektUlushi(bolimlar) { if (it == 1L) 100.0 else null }
        assertEquals("ish", u2.usul); assertEquals((2 * 1 + 8 * 0.2) / 10, u2.ulush!!, 1e-9)
        assertNull(obyektUlushi(emptyList()) { 1.0 }.ulush)
        assertNull(f2OlishMumkin(null)); assertEquals(12.5, f2OlishMumkin(JurnalHolat(1, f2MumkinHajm = 12.5))!!, 0.0)
    }

    @Test fun keyboardPureParts() {
        assertEquals(setOf(HolatFiltr.Hammasi, HolatFiltr.Kiritilgan, HolatFiltr.Boshlanmagan, HolatFiltr.Chala), HolatFiltr.entries.toSet())
        assertTrue(holatFiltrMos(HolatFiltr.Boshlanmagan, 1, HolatTur.Yangi, emptySet())); assertFalse(holatFiltrMos(HolatFiltr.Chala, 1, HolatTur.Yangi, emptySet())); assertTrue(holatFiltrMos(HolatFiltr.Kiritilgan, 7, HolatTur.Tugadi, setOf(7L)))
        assertEquals(3, keyingiMoslik(listOf(1, 3, 5), 1, 1)); assertEquals(1, keyingiMoslik(listOf(1, 3, 5), 5, 1)); assertEquals(3, keyingiMoslik(listOf(1, 3, 5), 5, -1)); assertEquals(5, keyingiMoslik(listOf(1, 3, 5), 1, -1)); assertNull(keyingiMoslik(emptyList(), null, 1))
    }

    @Test fun signedAvailabilityAndPacketDecode() {
        assertEquals(5.0, mumkinHajm(8.0, 3.0, 10.0)!!, 0.0); assertEquals(-5.0, mumkinHajm(-8.0, -3.0, -10.0)!!, 0.0); assertNull(mumkinHajm(null, 3.0, 10.0)); assertEquals(0.0, mumkinHajm(0.0, 0.0, 10.0)!!, 0.0)
        val json = Json.parseToJsonElement("""{"format":"t2-paket/1","obyekt_id":9,"obyekt_nom":"X","kompaniya_id":1,"soni":3,
          "lugat":{"nom":["Bolim","Ish","Beton"],"kod":["1"],"birlik":["m3"],"tur":["rz","bl","mat"],"kat":["MAT"]},
          "q":{"id":[1,2,3],"ota_id":[null,1,2],"daraja":[0,1,2],"tartib":[1,2,3],"tur":[0,1,2],"kat":[null,null,0],"kod":[0,null,null],"nom":[0,1,2],"birlik":[null,0,0],
               "hajm":[null,100,50],"narx":[null,null,10],"summa":[null,1000,500],"norma":[null,null,null],"narx_usul":[null,null,null],"versiya":[4,4,4],"qoshimcha":[0,0,0],"zamena":[0,0,1],"xom_qator":{}},
          "h":{"fakt_hajm":[null,40,20],"fakt_summa":[null,400,200],"f2_hajm":[null,10,0],"f2_summa":[null,100,0],"f2_summa_yoq":[null,0,0],"f2_summa_nomalum":[null,0,0],"direct_fakt_hajm":[null,40,20],"fakt_manbasi":[0,0,1],
               "almashtirilgan_hajm":{"2":5},"almashtirilgan_summa":{}},"f2":[],"meta":{}}""")
        val d = parseJurnalPaket(json)!!
        assertEquals(9L, d.obyektId); assertEquals(3, d.rows.size); assertEquals(listOf("rz", "bl", "mat"), d.rows.map { it.tur }); assertEquals("MAT", d.rows[2].kat); assertTrue(d.rows[2].zamena); assertEquals(4, d.rows[0].versiya)
        val s2 = d.states.first { it.qatorId == 2L }
        assertEquals(100.0, s2.smetaHajm!!, 0.0); assertEquals(40.0, s2.faktHajm!!, 0.0); assertEquals(30.0, s2.f2MumkinHajm!!, 0.0); assertEquals(5.0, s2.almashtirilganHajm!!, 0.0)
        assertEquals(100.0 - 10 - 5, s2.qoldiqHajm!!, 0.0); assertEquals(1000.0 - 100, s2.qoldiqSumma!!, 0.0); assertEquals("BL_NORMA", d.states.first { it.qatorId == 3L }.faktManbasi)
        // the model the screen builds from it
        val m = jurnalQur(d.rows, d.states)
        assertEquals(1, m.bolimlar.size); assertEquals(listOf(2L), m.bolimIshlari[1L]!!.map { it.id }); assertNotNull(m.bolimIshlari[1L]!![0].resurslar.firstOrNull { it.id == 3L })
        // wrong format / misaligned column / unknown type are refused as a whole
        assertNull(parseJurnalPaket(Json.parseToJsonElement("""{"format":"x"}""")))
        assertNull(parseJurnalPaket(Json.parseToJsonElement(json.toString().replace("\"soni\":3", "\"soni\":4"))))
    }
}
