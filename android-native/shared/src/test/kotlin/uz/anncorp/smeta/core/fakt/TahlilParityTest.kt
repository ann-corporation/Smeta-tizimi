package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Bajarilish tahlili": the assembly over the already-ported rules (fakt-korinish.test.ts / fakt-jurnal.test.ts fixtures are in FaktKorinishParityTest). */
class TahlilParityTest {
    private fun q(id: Long, tur: String, ota: Long? = null, hajm: Double? = null) = T2Qator(id = id, otaId = ota, daraja = 0, tur = tur, kod = null, nom = "q$id", birlik = "m3", hajm = hajm)
    private fun st(id: Long, smeta: Double, fakt: Double, smetaSumma: Double? = null) = JurnalHolat(qatorId = id, smetaHajm = smeta, faktHajm = fakt, f2Hajm = 0.0, smetaSumma = smetaSumma)
    private fun d(vararg s: JurnalHolat, rows: List<T2Qator>) = JurnalMalumot(1, "Obyekt", rows, s.toList())

    @Test fun twoWorksOneDoneOneNotStartedWeightedByWorkCountWhenSumsAreUnknown() {
        val t = bajarilishTahlili(d(st(10, 10.0, 10.0), st(11, 10.0, 0.0), rows = listOf(q(1, "rz"), q(10, "bl", 1, 10.0), q(11, "bl", 1, 10.0))))
        assertEquals(2, t.xulosa.ishJami); assertEquals(1, t.xulosa.ishlar[HolatTur.Tugadi]); assertEquals(1, t.xulosa.ishlar[HolatTur.Yangi])
        assertEquals(1, t.xulosa.bolimJami); assertEquals(0, t.xulosa.bolimTugagan)
        assertEquals("ish", t.obyekt.usul); assertEquals(0.5, t.obyekt.ulush!!, 1e-9)
    }

    @Test fun finishedSectionAndSumWeightedWhenSmetaSumsAreKnown() {
        val t = bajarilishTahlili(d(st(10, 10.0, 10.0), st(12, 10.0, 10.0, 1000.0), st(20, 10.0, 0.0), st(22, 10.0, 0.0, 3000.0), rows = listOf(q(1, "rz"), q(2, "rz"), q(10, "bl", 1, 10.0), q(12, "mat", 10, 10.0), q(20, "bl", 2, 10.0), q(22, "mat", 20, 10.0))))
        assertEquals(2, t.xulosa.bolimJami); assertEquals(1, t.xulosa.bolimTugagan)
        assertEquals("summa", t.obyekt.usul); assertEquals(0.25, t.obyekt.ulush!!, 1e-9)    // (1000 x 1 + 3000 x 0) / 4000
    }

    @Test fun nothingToWeighGivesNoShare() {
        val t = bajarilishTahlili(d(rows = emptyList()))
        assertNull(t.obyekt.ulush); assertNull(t.obyekt.usul); assertEquals(0, t.xulosa.ishJami)
        assertEquals("smeta hajmi yo‘q — hisoblab bo‘lmaydi", tahlilUsulMatnKalit(t.obyekt)); assertEquals(5, HOLAT_TARTIB.size)
    }

    @Test fun notDoneMarksTakeAResourceOutOfTheShare() {
        val t = bajarilishTahlili(d(st(10, 10.0, 0.0, 1000.0), rows = listOf(q(1, "rz"), q(10, "bl", 1, 10.0))), baj = mapOf(10L to 0.0))
        assertTrue(t.xulosa.ishJami >= 1)
    }
}
