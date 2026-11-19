package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/fakt-f2-tenglash.test.ts (reja, butun obyekt, tenglashJami, F2 narxi faktga). */
class FaktF2TenglashParityTest {
    private fun q(id: Long, tur: String, ota: Long? = null, nom: String = "q$id", hajm: Double? = null, kat: String? = null, daraja: Int = 0) =
        T2Qator(id = id, otaId = ota, daraja = daraja, tur = tur, kod = null, nom = nom, birlik = "m3", hajm = hajm, kat = kat)
    private val rows = listOf(
        q(1, "rz", nom = "Bo‘lim"), q(2, "rz", 1, "Ichki", daraja = 1), q(10, "bl", 1, "Ish A", 10.0), q(11, "rs", 10, hajm = null, kat = "ЧЕЛ", nom = "Ishchi"),
        q(12, "mat", 10, "Beton", 5.0), q(20, "bl", 2, "Ish B", 4.0), q(21, "bl", 1, "Chegirma", -3.0),
    )
    private fun st(id: Long, smeta: Double, fakt: Double, f2: Double, narx: Double? = 100.0) = JurnalHolat(qatorId = id, smetaHajm = smeta, faktHajm = fakt, f2Hajm = f2, smetaNarx = narx)
    private val states = listOf(st(10, 10.0, 3.0, 8.0), st(11, 20.0, 6.0, 16.0), st(12, 5.0, 5.0, 4.0), st(20, 4.0, 4.0, 4.0), st(21, -3.0, -3.0, -3.0))
    private val model = jurnalQur(rows, states)
    private val holat = states.associateBy { it.qatorId }
    private val bolalar = model.bolimlar.filter { it.otaId != null }.groupBy({ it.otaId!! }, { it.id })
    private fun ishlar(ichki: Boolean) = bolimIshlariYigish(1, model.bolimIshlari, bolalar, ichki)
    private fun guruhlar() = model.bolimlar.map { it.nom to model.bolimIshlari[it.id].orEmpty() } + ("Bo‘limsiz" to model.ildizIshlari)
    private fun hm(vararg e: JurnalHolat) = holat + e.associateBy { it.qatorId }
    private fun l(akt: Long, qator: Long, hajm: Double, narx: Double?, cq: Double? = null, cp: Double? = null, ca: Double? = null) =
        F2AktQator(null, akt, qator, hajm, narx, narx?.let { hajm * it }, cq, cp, ca)

    @Test fun onlyPositiveDifferenceAndRsFollowsNorm() {
        val r = faktF2Reja(ishlar(true), holat)
        assertEquals(listOf(10L to 5.0), r.paket.map { it.qatorId to it.hajm }); assertEquals(1, r.qatorlar[0].avtomatik)
        assertEquals(1500.0, r.jamiSumma, 0.0); assertEquals(1, r.manfiyReja)
    }

    @Test fun innerSectionsOffAndUnpricedCounted() {
        val r = faktF2Reja(ishlar(false), hm(st(10, 10.0, 3.0, 8.0, null)))
        assertEquals(0, r.narxsiz); assertEquals(1000.0, r.jamiSumma, 0.0)
    }

    @Test fun matResourceAddsItsOwnDifference() {
        val r = faktF2Reja(ishlar(false), hm(st(12, 5.0, 1.0, 4.0)))
        assertEquals(listOf(10L to 5.0, 12L to 3.0), r.paket.map { it.qatorId to it.hajm })
    }

    @Test fun wholeObjectEachWorkOnceAndNeverNegative() {
        val r = obyektF2Reja(guruhlar(), hm(st(20, 4.0, 1.0, 4.0), st(12, 5.0, 9.0, 4.0)))
        assertEquals(listOf(10L to 5.0, 20L to 3.0), r.paket.map { it.qatorId to it.hajm }); assertEquals(listOf("Bo‘lim", "Ichki"), r.qatorlar.map { it.bolim }); assertTrue(r.paket.all { it.hajm > 0 })
    }

    @Test fun totalsWithExclusions() {
        val r = obyektF2Reja(guruhlar(), hm(st(20, 4.0, 1.0, 4.0, null)))
        val j0 = tenglashJami(r, emptySet(), emptySet())
        assertEquals(1500.0, j0.ustamasiz!!, 0.0); assertEquals(1, j0.narxsiz); assertEquals(listOf(Triple("Bo‘lim", 1, 1500.0), Triple("Ichki", 1, null)), j0.bolimlar.map { Triple(it.nom, it.soni, it.ustamasiz) })
        val j1 = tenglashJami(r, setOf(10L), emptySet()); assertEquals(listOf(20L), j1.paket.map { it.qatorId }); assertNull(j1.ustamasiz)
        assertEquals(listOf(10L), tenglashJami(r, emptySet(), setOf("Ichki")).paket.map { it.qatorId })
    }

    @Test fun f2PriceAveragingPartialAndCertificate() {
        val m = f2NarxYigish(listOf(l(7, 1, 2.0, 50.0), l(8, 1, 3.0, 50.0), l(7, 2, 1.0, 10.0), l(9, 2, 3.0, 30.0), l(7, 3, 1.0, 10.0), l(8, 3, 1.0, null), l(7, 4, 2.0, null), l(7, 5, 4.0, 0.0), l(7, 6, 2.0, 10.0, 4.0, 12.0, 48.0)))
        assertEquals(50.0, m[1L]!!.narx!!, 0.0); assertEquals(listOf(7L, 8L), m[1L]!!.aktlar); assertEquals(25.0, m[2L]!!.narx!!, 0.0)
        assertEquals(5.0, m[3L]!!.narx!!, 0.0); assertTrue(m[3L]!!.aralash); assertEquals(1, m[3L]!!.narxsizSoni); assertNull(m[4L]!!.narx); assertEquals(0.0, m[5L]!!.narx!!, 0.0); assertEquals(12.0, m[6L]!!.narx!!, 0.0)
    }

    @Test fun f2PriceGoesToThePackageWithItsSource() {
        val h = hm(st(12, 5.0, 1.0, 4.0, 100.0))
        val r = faktF2Reja(ishlar(true), h, null, TenglashKontekst(f2Narx = f2NarxYigish(listOf(l(31, 10, 8.0, 140.0), l(31, 12, 2.0, 90.0), l(32, 12, 2.0, 110.0)))))
        val p0 = r.paket[0]; assertEquals(10L, p0.qatorId); assertEquals(5.0, p0.hajm, 0.0); assertEquals(140.0, p0.narx!!, 0.0); assertEquals("f2_sertifikat", p0.narxManba); assertEquals(31L, p0.narxManbaId); assertEquals("Fakt = F2: F2 №31 narxi", p0.narxIzoh)
        val p1 = r.paket[1]; assertEquals(100.0, p1.narx!!, 0.0); assertNull(p1.narxManbaId); assertEquals("Fakt = F2: F2 №31, №32 — hajm bo'yicha o'rtacha narx", p1.narxIzoh)
        val j = tenglashJami(r, emptySet(), emptySet()); assertEquals((5 * 140 + 3 * 100).toDouble(), j.ustamasiz!!, 0.0); assertEquals(listOf(2, 0, 0), listOf(j.f2Narxli, j.smetaNarxli, j.narxsiz))
    }

    @Test fun unknownF2PriceIsNeverInvented() {
        val h = hm(st(12, 5.0, 1.0, 4.0, 100.0))
        val r = faktF2Reja(ishlar(true), h, null, TenglashKontekst(f2Narx = f2NarxYigish(listOf(l(31, 10, 8.0, null), l(31, 12, 4.0, null)))))
        val p0 = r.paket[0]; assertTrue(p0.narxYoq); assertNull(p0.narx); assertEquals("f2_sertifikat", p0.narxManba); assertEquals("Fakt = F2: F2 №31 da narx yo'q", p0.narxIzoh)
        assertNull(r.paket[1].narx); assertNull(r.paket[1].narxManba)
        val j = tenglashJami(r, emptySet(), emptySet()); assertEquals(listOf(0, 1, 1), listOf(j.f2Narxli, j.smetaNarxli, j.narxsiz)); assertEquals(300.0, j.ustamasiz!!, 0.0)
    }

    @Test fun sourcesOfOwnFaktAndOldDocuments() {
        val m = faktManbaYigish(
            listOf(FaktAkt(1, "F1", null, "Fakt = F2 eski", null), FaktAkt(2, "F2", null, "Fakt = F2 nusxa", null)),
            listOf(FaktAktQator(1, 10, 3.0, "f2_sertifikat", null), FaktAktQator(2, 12, 2.0, "f2_sertifikat", 77), FaktAktQator(3, 10, 1.5, null, null)),
        )
        assertEquals(4.5, m.directFakt[10L]!!, 0.0); assertEquals(1.5, m.qolda[10L]!!, 0.0); assertEquals(3.0, m.f2Delta[10L]!!, 0.0); assertEquals(setOf(77L), m.nusxalangan); assertEquals(listOf(1L), m.eskiAktlar.map { it.id })
    }
}
