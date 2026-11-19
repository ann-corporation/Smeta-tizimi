package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/fakt-tiklash.test.ts (dalil boyicha takliflar). */
class FaktTiklashParityTest {
    private fun h(id: Long, fakt: Double?, f2: Double?, narx: Double? = null, f2Summa: Double? = null) = JurnalHolat(qatorId = id, smetaHajm = 100.0, faktHajm = fakt, f2Hajm = f2, smetaNarx = narx, f2Summa = f2Summa)
    private fun meta(id: Long, tur: String = "bl") = TiklashMeta(id, tur, "Ish $id", "m3", "МАТ", "B1")
    private fun rq(id: Long, delta: Double = 5.0, fakt: Double = 3.0, f2: Double = 8.0, narx: Double? = 100.0, summa: Double? = 500.0, nusxa: List<NusxaSatr>? = null) =
        TenglashQator(id, "bl", "Ish $id", "m3", fakt, f2, delta, narx, summa, 0, "B1", bosKesim(), "f2", listOf(7L), nusxa = nusxa)
    private fun reja(vararg q: TenglashQator) = TenglashReja(q.toList(), q.toList().flatMap(::paketQatorlar), 0.0, 0, 0, 0, emptyList())
    private val bos = reja()
    private fun yig(vararg x: Triple<Long, Long, Double?>) = qoralamaYigish(x.map { QoralamaQator(it.first, it.second, it.third, null) })

    @Test fun approvedF2Proposal() {
        val s = tiklashSatrlar(TiklashKontekst(reja(rq(10)), mapOf(10L to h(10, 3.0, 8.0)), listOf(meta(10)), emptyMap()))
        assertEquals(1, s.size); val x = s[0]
        assertEquals("f2:10", x.kalit); assertEquals("F2 №7", x.hujjat); assertEquals(3.0, x.fakt, 0.0); assertEquals(8.0, x.keyin, 0.0); assertEquals(5.0, x.delta, 0.0); assertEquals(500.0, x.summa!!, 0.0)
        val p = x.paket[0]; assertEquals(10L, p.qatorId); assertEquals(5.0, p.hajm, 0.0); assertEquals(100.0, p.narx!!, 0.0); assertEquals("f2_sertifikat", p.narxManba); assertEquals(7L, p.narxManbaId)
    }

    @Test fun draftProposalAtSmetaPriceWithoutServerPrice() {
        val s = tiklashSatrlar(TiklashKontekst(bos, mapOf(20L to h(20, 2.0, 0.0, 50.0)), listOf(meta(20)), yig(Triple(3L, 20L, 6.0)), mapOf(3L to "Q-3")))
        assertEquals(1, s.size); val x = s[0]
        assertEquals("qoralama:20", x.kalit); assertEquals("qoralama F2 №Q-3", x.hujjat); assertEquals(4.0, x.delta, 0.0); assertEquals(6.0, x.keyin, 0.0); assertEquals(50.0, x.narx!!, 0.0); assertEquals(200.0, x.summa!!, 0.0); assertEquals("smeta", x.narxManba)
        val p = x.paket.single(); assertEquals(4.0, p.hajm, 0.0); assertNull(p.narx); assertNull(p.narxManba); assertTrue(p.narxIzoh!!.contains("qoralama F2 №Q-3"))
    }

    @Test fun noProposalWhenFaktCoversTheEvidence() {
        val s = tiklashSatrlar(TiklashKontekst(bos, mapOf(20L to h(20, 6.0, 0.0, 50.0), 21L to h(21, 9.0, 8.0)), listOf(meta(20), meta(21)), yig(Triple(3L, 20L, 6.0), Triple(3L, 21L, 0.5))))
        assertTrue(s.isEmpty())
    }

    @Test fun approvedPlusDraftOnOneRowMergesIntoOneLine() {
        val s = tiklashSatrlar(TiklashKontekst(reja(rq(10)), mapOf(10L to h(10, 3.0, 8.0, f2Summa = 800.0)), listOf(meta(10)), yig(Triple(4L, 10L, 4.0))))
        val q = s.first { it.manba == "qoralama" }
        assertEquals(8.0, q.fakt, 0.0); assertEquals(12.0, q.keyin, 0.0); assertEquals(4.0, q.delta, 0.0); assertEquals(400.0, q.summa!!, 0.0); assertEquals("f2", q.narxManba)
        val p = tiklashPaket(s, s.map { it.kalit }.toSet()); assertEquals(1, p.size)
        assertEquals(10L, p[0].qatorId); assertEquals(9.0, p[0].hajm, 0.0); assertEquals(100.0, p[0].narx!!, 0.0); assertEquals("f2_sertifikat", p[0].narxManba); assertTrue(p[0].narxIzoh!!.contains("qoralama F2"))
    }

    @Test fun minusIsWrittenNegativeAndLowFaktGivesNothing() {
        val s = tiklashSatrlar(TiklashKontekst(bos, mapOf(30L to h(30, 0.0, 0.0, 50.0), 31L to h(31, -5.0, 0.0, 50.0)), listOf(meta(30), meta(31)), yig(Triple(5L, 30L, -3.0), Triple(5L, 31L, -3.0))))
        assertEquals(listOf(30L), s.map { it.id }); assertEquals(-3.0, s[0].delta, 0.0); assertEquals(-150.0, s[0].summa!!, 0.0); assertEquals(-3.0, s[0].keyin, 0.0)
        assertEquals(1, tiklashJami(s, setOf(s[0].kalit)).manfiySoni); assertNull(dalilFarqi(-3.0, -5.0)); assertEquals(-3.0, dalilFarqi(-3.0, 0.0)!!, 0.0)
    }

    @Test fun unknownSumIsNullNeverZero() {
        val s = tiklashSatrlar(TiklashKontekst(bos, mapOf(40L to h(40, 1.0, 8.0, f2Summa = null), 41L to h(41, 0.0, 0.0)), listOf(meta(40), meta(41)), yig(Triple(6L, 40L, 2.0), Triple(6L, 41L, 5.0))))
        val a = s.first { it.id == 40L }; assertNull(a.summa); assertEquals("narxsiz", a.narxManba); assertEquals(9.0, a.delta, 0.0)
        val b = s.first { it.id == 41L }; assertNull(b.summa); assertNull(b.narx)
        val j = tiklashJami(s, s.map { it.kalit }.toSet()); assertNull(j.umumiy.ustamasiz); assertEquals(2, j.umumiy.narxsiz)
    }

    @Test fun labourMachinesAreNeverWrittenOnDraftAndUnknownVolumeIsDropped() {
        val s = tiklashSatrlar(TiklashKontekst(bos, mapOf(50L to h(50, 0.0, 0.0, 1.0)), listOf(meta(50, "rs"), meta(51)), yig(Triple(1L, 50L, 5.0), Triple(1L, 51L, 5.0), Triple(1L, 52L, null))))
        assertTrue(s.isEmpty()); assertEquals(0, yig(Triple(1L, 9L, null)).size)
    }

    @Test fun draftSumsPerRow() {
        val y = yig(Triple(1L, 9L, 2.0), Triple(2L, 9L, 3.0), Triple(2L, 9L, 1.0))[9L]!!
        assertEquals(6.0, y.hajm, 0.0); assertEquals(listOf(1L, 2L), y.aktlar)
    }

    @Test fun copy1to1LinesAreKeptAndUnselectedAreDropped() {
        val nus = rq(11, 5.0, nusxa = listOf(NusxaSatr(901, 7, 2.0, 20.0), NusxaSatr(902, 7, 3.0, 30.0)), summa = 50.0)
        val s = tiklashSatrlar(TiklashKontekst(reja(rq(10), nus), mapOf(10L to h(10, 3.0, 8.0), 11L to h(11, 0.0, 5.0)), listOf(meta(10), meta(11)), emptyMap()))
        assertEquals(listOf(Triple(11L, 2.0, 901L), Triple(11L, 3.0, 902L)), tiklashPaket(s, setOf("f2:11")).map { Triple(it.qatorId, it.hajm, it.manbaAktQatorId) })
        assertTrue(tiklashPaket(s, emptySet()).isEmpty())
        val j = tiklashJami(s, s.map { it.kalit }.toSet()); assertEquals(2, j.f2.soni); assertEquals(0, j.qoralama.soni); assertEquals(550.0, j.umumiy.ustamasiz!!, 0.0)
    }

    @Test fun keyinAddsTheSelection() {
        val s = tiklashSatrlar(TiklashKontekst(reja(rq(10)), mapOf(10L to h(10, 3.0, 8.0)), listOf(meta(10)), emptyMap()))
        val j = tiklashJami(s, setOf("f2:10"))
        assertEquals(1500.0, faktKeyin(1000.0, j.umumiy.kesim, j.umumiy).ustamasiz!!, 0.0); assertEquals(500.0, faktKeyin(null, null, j.umumiy).ustamasiz!!, 0.0)
        assertEquals("Obyekt — F2 №7; qoralama F2 №3", tiklashSarlavha("Obyekt", listOf("F2 №7", "qoralama F2 №3")))
    }
}
