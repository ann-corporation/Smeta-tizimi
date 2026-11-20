package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PARITY with the website: fixtures and expectations copied from frontend/src/lib/fakt-jurnal.test.ts (bolimSummalari, nakopitelniyMoslik, bolimMaxraji),
 * hisob-yadro/hisob-yadro.test.ts (yaxlit2, qatorSumma, yigindi2Qatiy), svod-yaxlit.test.ts and svod-yaxlit-ekranlar.test.ts (yaxlitQatorIdlari).
 * The markup-dependent expectations of those files (kaskad, ustamali) come with the kaskad port.
 */
class BolimSummalariParityTest {
    private val MAT = "МАТ"; private val CHEL = "ЧЕЛ"
    private fun q(id: Long, tur: String, ota: Long? = null, hajm: Double? = null, kat: String? = null, zamena: Boolean = false, qosh: Boolean = false) =
        T2Qator(id, ota, 0, tur, null, "n", "m3", hajm, kat, qosh, zamena, 1)

    @Test fun yaxlit2IsExcelRound() {
        assertEquals(1.01, yaxlit2(1.005), 0.0); assertEquals(-1.01, yaxlit2(-1.005), 0.0); assertEquals(2.68, yaxlit2(2.675), 0.0); assertEquals(-2.68, yaxlit2(-2.675), 0.0)
        assertEquals(1111.05, yaxlit2(1111.0499999999), 0.0); assertEquals(0.13, yaxlit2(0.125), 0.0); assertEquals(-0.13, yaxlit2(-0.125), 0.0)
        assertTrue(yaxlit2(-0.001).equals(0.0)); assertTrue(yaxlit2(Double.NaN).isNaN())
        assertEquals(3.02, qatorSumma(3.0, 1.005)!!, 0.0); assertNull(qatorSumma(null, 5.0)); assertNull(yigindi2Qatiy(listOf(1.0, null))); assertEquals(0.3, yigindi2Qatiy(listOf(0.1, 0.2))!!, 0.0)
    }

    @Test fun sectionAndObjectSums() {
        val r = listOf(
            q(1, "rz"), q(2, "rz", 1), q(3, "bl", 2, 1.0), q(4, "mat", 3, kat = MAT), q(5, "rs", 3, kat = CHEL),
            q(6, "bl", 2, 1.0, zamena = true), q(7, "mat", 6, kat = MAT),
        )
        val h = listOf(
            JurnalHolat(4, smetaHajm = 1.0, faktHajm = 1.0, smetaSumma = 100.0, faktSumma = 50.0, f2Summa = 40.0, qoldiqSumma = 60.0),
            JurnalHolat(5, smetaHajm = 1.0, faktHajm = 0.0, smetaSumma = null, faktSumma = null, f2Summa = null, qoldiqSumma = null),
            JurnalHolat(7, smetaHajm = 1.0, faktHajm = 1.0, smetaSumma = 30.0, faktSumma = 30.0, f2Summa = 0.0, qoldiqSumma = 30.0),
        )
        val s = bolimSummalari(r, h)
        assertEquals(100.0, s[1]!!.smeta.ustamasiz!!, 0.0); assertEquals(1, s[1]!!.smeta.kesim.summasizSoni)
        assertEquals(80.0, s[2]!!.fakt.ustamasiz!!, 0.0); assertEquals(90.0, s[0]!!.qoldiq.ustamasiz!!, 0.0); assertEquals(40.0, s[0]!!.f2.ustamasiz!!, 0.0)
        assertEquals(30.0, s[0]!!.qoshimcha.ustamasiz!!, 0.0)   // replacement smeta: separate ("smeta" excludes it)
        // A withdrawn resource (4): its fakt is not in the section/object totals; smeta and F2 unchanged.
        val c = bolimSummalari(r, h, setOf(4L))
        assertEquals(30.0, c[2]!!.fakt.ustamasiz!!, 0.0); assertEquals(30.0, c[0]!!.fakt.ustamasiz!!, 0.0); assertEquals(100.0, c[1]!!.smeta.ustamasiz!!, 0.0); assertEquals(40.0, c[0]!!.f2.ustamasiz!!, 0.0)
    }

    @Test fun workOwnF2AndFaktAreAddedChildrenSeparatelyNeverTwice() {
        val r = listOf(
            q(1, "rz"), q(2, "rz", 1), q(3, "bl", 2, 10.0), q(4, "mat", 3, kat = MAT), q(8, "bl", 1, 5.0, qosh = true), q(9, "bl", 2, 2.0), q(10, "rs", 9, kat = CHEL),
        )
        val h = listOf(
            JurnalHolat(3, smetaHajm = 10.0, faktHajm = 2.0, smetaSumma = 1000.0, f2Summa = 0.0, faktSumma = 0.0),
            JurnalHolat(4, smetaHajm = 1.0, faktHajm = 1.0, smetaSumma = 1000.0, faktSumma = 200.0, f2Summa = 300.0, qoldiqSumma = 700.0),
            JurnalHolat(8, smetaHajm = 5.0, faktHajm = 0.0, smetaSumma = null, f2Summa = 5000.0, faktSumma = 0.0),
            JurnalHolat(9, smetaHajm = 2.0, faktHajm = 1.0, smetaSumma = 400.0, f2Summa = 70.0, faktSumma = 10.0),
            JurnalHolat(10, smetaHajm = 2.0, faktHajm = 1.0, smetaSumma = 400.0, faktSumma = 100.0, f2Summa = 30.0, qoldiqSumma = 370.0),
        )
        val s = bolimSummalari(r, h)
        assertEquals(300.0 + 5000 + 70 + 30, s[0]!!.f2.ustamasiz!!, 0.0); assertEquals(300.0 + 70 + 30, s[2]!!.f2.ustamasiz!!, 0.0); assertEquals(5400.0, s[1]!!.f2.ustamasiz!!, 0.0)
        assertEquals(200.0 + 100, s[0]!!.fakt.ustamasiz!!, 0.0); assertEquals(0, s[0]!!.f2Narxda)
        // Price rule: row 10 has approved F2 (0.5 volume, 30 sum -> 60 per unit): fakt 1 x 60 (not the smeta price).
        val h2 = h.map { if (it.qatorId == 10L) it.copy(f2Hajm = 0.5) else it }
        val s2 = bolimSummalari(r, h2)
        assertEquals(200.0 + 60, s2[0]!!.fakt.ustamasiz!!, 0.0); assertEquals(1, s2[0]!!.f2Narxda)
        assertEquals(1400.0, s[0]!!.smeta.ustamasiz!!, 0.0); assertEquals(700.0 + 370 - 5000 - 70, s[0]!!.qoldiq.ustamasiz!!, 0.0)
        // Nakopitelniy agreement: smeta = tree + additional; F2 = total approved.
        assertTrue(nakopitelniyMoslik(s[0]!!, 1400.0, 5400.0).mos)
        val f = nakopitelniyMoslik(s[0]!!, 1400.0, 5500.0)
        assertFalse(f.mos); assertEquals(-100.0, f.f2Farq!!, 0.0); assertEquals(0.0, f.smetaFarq!!, 0.0)
        val n = nakopitelniyMoslik(s[0]!!, null, null, nakBor = false)
        assertTrue(n.mos); assertNull(n.f2Farq); assertEquals(1400.0, n.smetaJami!!, 0.0)
        // Completion denominator = original smeta + additional.
        assertEquals(n.smetaJami, bolimMaxraji(s[0])); assertNull(bolimMaxraji(null))
    }

    @Test fun svodSectionsMarkedAndDescendants() {
        val daraxt = listOf(
            q(10, "rz"), q(11, "bl", 10, 1.0), q(12, "rs", 11, 0.3, CHEL), q(13, "rs", 11, 0.7, MAT),
            q(20, "rz"), q(21, "bl", 20, 1.0), q(22, "rs", 21, 1.0, CHEL), q(23, "rs", 21, 2.0, MAT), q(24, "rs", 21, 0.5, "ОБ"),
        )
        val svod = SvodYaxlit(1200.0, 1000.0, 0.0, listOf(SvodYaxlitBolim(10, "MAGIC FUN", 1344.0, 12.0, 1200.0, 1000.0)))
        assertEquals(listOf(10L, 11L, 12L, 13L), yaxlitQatorIdlari(daraxt, svod).sorted()); assertEquals(0, yaxlitQatorIdlari(daraxt, null).size)
        // svod-yaxlit.test.ts
        fun bolim(summa: Double?, qqssiz: Double) = SvodYaxlitBolim(10, "B", summa, if (summa == null) null else 12.0, qqssiz, qqssiz)
        assertNull(svodYaxlitQqs(null, 12.0))
        assertEquals(2240.01, bolimQqsBilan(bolim(2240.01, 2000.0), 12.0)!!, 0.0); assertEquals(2240.0, bolimQqsBilan(bolim(null, 2000.0), 12.0)!!, 0.0); assertNull(bolimQqsBilan(bolim(null, 2000.0), null))
        // fakt / F2 in the svod section: CHEL / MASH stay ordinary; the rest is the round part
        val barglar = daraxt.filter { it.tur == "rs" }
        val f = KesimAccessor<T2Qator>({ it.id }, { it.kat }, { (it.hajm ?: 0.0) * 1000 }, { (it.hajm ?: 0.0) * 1000 })
        val k = svodFaktKesimi(daraxt, barglar, f, svod)
        assertEquals(1300.0, k.summalar[Kat.CHEL]!!, 0.0); assertEquals(2000.0, k.summalar[Kat.MAT]!!, 0.0); assertEquals(500.0, k.summalar[Kat.OB]!!, 0.0)
        assertEquals(700.0, k.yaxlit!!.qqssiz, 0.0); assertEquals(700.0, k.yaxlit!!.barglar, 0.0); assertEquals(0.0, k.yaxlit!!.svodQqsBilan!!, 0.0)
    }
}
