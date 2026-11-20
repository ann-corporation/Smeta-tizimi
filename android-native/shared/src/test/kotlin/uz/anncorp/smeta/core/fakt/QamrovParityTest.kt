package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures from frontend/src/lib/fakt-qamrov.test.ts and fakt-material-taklif.test.ts (ishMateriallari tests come with the link detector). */
class QamrovParityTest {
    private val MAT = Kat.MAT.kod; private val CHEL = Kat.CHEL.kod; private val OB = Kat.OB.kod
    private fun q(id: Long, tur: String, ota: Long? = null, hajm: Double? = null, kat: String? = null, nom: String = "q$id") = T2Qator(id, ota, 0, tur, null, nom, "m3", hajm, kat, false, false, 1)

    private val rows = listOf(
        q(1, "rz", nom = "Kol"), q(10, "bl", 1, 100.0), q(11, "rs", 10, 50.0, CHEL), q(12, "mat", 10, 20.0, MAT), q(20, "bl", 1, 10.0), q(30, "bl", 1, -4.0),
        q(40, "mat", 1, 8.0, MAT), T2Qator(2, 1, 1, "rz", null, "Tub", "m3", null, null, false, false, 1), q(50, "bl", 2, 6.0), q(60, "bl", 2, null),
    )
    private val states = listOf(
        JurnalHolat(10, smetaHajm = 100.0, faktHajm = 0.0), JurnalHolat(11, smetaHajm = 50.0, faktHajm = 0.0, smetaSumma = 5000.0),
        JurnalHolat(12, smetaHajm = 20.0, faktHajm = 0.0, smetaNarx = 10.0), JurnalHolat(20, smetaHajm = 10.0, faktHajm = 4.0, almashtirilganHajm = 2.0),
        JurnalHolat(30, smetaHajm = -4.0, faktHajm = 0.0), JurnalHolat(40, smetaHajm = 8.0, faktHajm = 0.0), JurnalHolat(50, smetaHajm = 6.0, faktHajm = 6.0),
    )
    private val holat = states.associateBy { it.qatorId }

    private fun qamrov(baj: Map<Long, Double>? = null): List<JurnalIsh> {
        val m = jurnalQur(rows, states, null, baj)
        val bolalar = HashMap<Long, List<Long>>()
        for (b in m.bolimlar) if (b.otaId != null) bolalar[b.otaId] = (bolalar[b.otaId] ?: emptyList()) + b.id
        return bolimIshlariYigish(1, m.bolimIshlari, bolalar, true)
    }

    @Test fun sectionWithDescendantsPercentTimesOpenRemainder() {
        val r = qamrovReja(qamrov(mapOf(20L to 1.0)), 100.0, holat)
        assertEquals(listOf(10L to 100.0, 12L to 20.0, 20L to 3.0, 30L to -4.0, 40L to 8.0), r.qatorlar.map { it.id to it.hajm })
        assertEquals(1, r.yopiq); assertEquals(1, r.smetasiz)
    }

    @Test fun seventyPercentAndDeductionAtTheSamePercent() {
        val r = qamrovReja(qamrov(), 70.0, holat)
        assertEquals(mapOf(10L to 70.0, 12L to 14.0, 20L to 2.8, 30L to -2.8, 40L to 5.6), r.qatorlar.associate { it.id to it.hajm })
    }

    @Test fun exceptionsAreMarkedNotDropped() {
        val r = qamrovReja(qamrov(mapOf(20L to 1.0)), 100.0, holat)
        val ist = r.qatorlar.associate { it.id to it.istisnolar.map { i -> i.kod } }
        assertEquals(emptyList<String>(), ist[10]); assertEquals(listOf("faktli", "zamenalangan", "bajarilmaydi"), ist[20])
        assertEquals(listOf("chegirma"), ist[30]); assertEquals(listOf("narxsiz"), ist[40])
    }

    @Test fun sums() {
        val r = qamrovReja(qamrov(), 50.0, holat)
        val s = r.qatorlar.associate { it.id to it.summa }
        assertEquals(2500.0, s[10]!!, 0.0); assertEquals(100.0, s[12]!!, 0.0); assertNull(s[40])
        val j = qamrovJami(r, emptySet())
        assertEquals(2600.0 + (s[20] ?: 0.0) + (s[30] ?: 0.0), j.ustamasiz!!, 1e-9); assertEquals(1, j.narxsiz); assertTrue(j.kesim.summasizSoni >= 1)
    }

    @Test fun innerResourcesOffAndRemovedWork() {
        assertFalse(12L in qamrovReja(qamrov(), 100.0, holat, QamrovOpsiya(ichkiResurslar = false)).qatorlar.map { it.id })
        val j = qamrovJami(qamrovReja(qamrov(), 100.0, holat), setOf(10L, 40L))
        assertEquals(listOf(20L, 30L), j.paket.map { it.qatorId })
    }

    @Test fun chunksAndPercentText() {
        assertEquals(listOf(listOf(1, 2), listOf(3, 4), listOf(5)), qamrovBolaklari(listOf(1, 2, 3, 4, 5), 2))
        assertTrue(QAMROV_BOLAK <= 2000)
        assertEquals(listOf(1500, 1500, 1200), qamrovBolaklari((0 until 4200).toList()).map { it.size })
        assertEquals(70.0, qamrovFoizOqi("70%")!!, 0.0); assertEquals(12.5, qamrovFoizOqi("12,5")!!, 0.0); assertNull(qamrovFoizOqi("0")); assertNull(qamrovFoizOqi("abc"))
    }

    // ----- JQA-03 -----
    private val r2 = listOf(
        q(1, "rz"), q(10, "bl", 1, 100.0, MAT), q(11, "bl", 1, 100.0, MAT), q(12, "bl", 1, -10.0, MAT), q(13, "bl", 1, 50.0, CHEL), q(14, "mat", 13, 5.0, MAT), q(15, "mat", 13, 5.0, OB), q(30, "bl", null, 8.0, MAT),
    )
    private val s2 = listOf(
        JurnalHolat(10, smetaHajm = 100.0, faktHajm = 120.0), JurnalHolat(11, smetaHajm = 100.0, faktHajm = 40.0), JurnalHolat(12, smetaHajm = -10.0, faktHajm = -12.0),
        JurnalHolat(13, smetaHajm = 50.0, faktHajm = 0.0), JurnalHolat(14, smetaHajm = 5.0, faktHajm = 0.0), JurnalHolat(15, smetaHajm = 5.0, faktHajm = 0.0), JurnalHolat(30, smetaHajm = 8.0, faktHajm = 0.0),
    )

    @Test fun markingCoverage() {
        val j = jurnalQur(r2, s2)
        assertEquals(listOf(10L, 11L, 12L, 14L, 30L), markirovkaIshlari(j.bolimIshlari, MAT, j.ildizIshlari).map { it.id })
    }

    @Test fun overSmetaIsNeverLoweredCorrectionSuggestedSeparately() {
        val j = jurnalQur(r2, s2); val h2 = s2.associateBy { it.qatorId }
        val r = qamrovReja(markirovkaIshlari(j.bolimIshlari, MAT, j.ildizIshlari), 100.0, h2)
        assertEquals(listOf(11L to 60.0, 14L to 5.0, 30L to 8.0), r.qatorlar.map { it.id to it.hajm }); assertTrue(r.qatorlar.all { it.hajm > 0 })
        assertEquals(listOf(10L to -20.0, 12L to 2.0), r.oshganlar.map { it.id to it.hajm })
        assertFalse(qamrovJami(r, emptySet()).paket.any { it.qatorId == 10L })
    }

    // ----- fakt-material-taklif.test.ts -----
    private fun t(id: Long, ota: Long?, tur: String, tartib: Double, qosh: Boolean = false, zamena: Boolean = false) = TaklifQator(id, ota, tur, tartib, qosh, zamena)

    @Test fun workToFollowingSeparateMaterials() {
        val rows = listOf(
            t(1, null, "rz", 1.0), t(9, 1, "mat", 2.0), t(3, 1, "bl", 5.0), t(30, 3, "mat", 1.0), t(5, 1, "bl", 9.0), t(4, 1, "mat", 6.0), t(6, 1, "ob", 7.0), t(7, 1, "mat", 10.0),
            t(8, 1, "rz", 11.0), t(81, 8, "mat", 1.0), t(10, 1, "mat", 12.0),
        )
        val m = ishKeyingiMateriallari(rows)
        assertEquals(listOf(4L, 6L), m[3L]); assertEquals(listOf(7L), m[5L]); assertEquals(listOf(3L, 5L), m.keys.sorted())
    }

    @Test fun additionalAndReplacementRowsDoNotBreakTheChain() {
        val rows = listOf(t(1, null, "rz", 1.0), t(2, 1, "bl", 2.0), t(3, 1, "bl", 3.0, zamena = true), t(4, 1, "mat", 4.0), t(5, 1, "mat", 5.0, qosh = true))
        assertEquals(listOf(4L), ishKeyingiMateriallari(rows)[2L])
    }

    @Test fun materialSuggestion() {
        assertEquals(15.0, materialTaklifi(50.0, 100.0, 40.0, 0.0, 10.0)!!, 0.0); assertNull(materialTaklifi(50.0, 100.0, 40.0, 0.0, 40.0))
        assertEquals(20.0, materialTaklifi(40.0, 100.0, 50.0, 0.0)!!, 0.0); assertEquals(5.0, materialTaklifi(40.0, 100.0, 50.0, 15.0)!!, 0.0); assertNull(materialTaklifi(40.0, 100.0, 50.0, 20.0))
        assertEquals(60.0, materialTaklifi(120.0, 100.0, 50.0, 0.0)!!, 0.0)
        assertNull(materialTaklifi(0.0, 100.0, 50.0, 0.0)); assertNull(materialTaklifi(10.0, null, 50.0, 0.0)); assertNull(materialTaklifi(10.0, 100.0, null, 0.0)); assertNull(materialTaklifi(-2.0, -4.0, 5.0, 0.0))
    }
}
