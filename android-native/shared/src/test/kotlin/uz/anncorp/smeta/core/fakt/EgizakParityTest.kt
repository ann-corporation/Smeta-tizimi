package uz.anncorp.smeta.core.fakt

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/fakt-egizak.test.ts (+ twin matching of f2-moslash-v3/egizak, correction rows, CAS, unit warning). */
class EgizakParityTest {
    private fun q(id: Long, ota: Long?, tur: String, nom: String, kod: String? = null, hajm: Double? = if (tur == "rz") null else 10.0, qosh: Boolean = false, birlik: String? = if (tur == "rz") null else "М3", opId: String? = null) =
        EgizakQator(id, ota, 0, id.toDouble(), tur, kod, nom, birlik, hajm, qosh, null, opId)
    private fun asl(d: Long) = listOf(q(1 + d, null, "rz", "Bo‘lim"), q(2 + d, 1 + d, "bl", "Ish 1", "E1"), q(3 + d, 1 + d, "mat", "Beton"), q(4 + d, 1 + d, "bl", "Ish 2", "E2"))
    private val A = asl(0)
    private fun tomon(id: Long, rows: List<EgizakQator>, smeta: Map<Long, Double?>, fakt: Map<Long, Double> = emptyMap()) = EgizakTomon(id, "Egizak $id", rows, smeta, fakt)
    private fun k(rejim: Rejim, v: String) = Kiritma(rejim, v)

    @Test fun strictMapAndSoftMatching() {
        val m = aslMoslash(A, asl(100))
        assertTrue(m.qatiy); assertEquals(listOf(1L to 101L, 2L to 102L, 3L to 103L, 4L to 104L), m.map.toList())
        val y = aslMoslash(A, asl(100).filter { it.id != 103L })
        assertFalse(y.qatiy); assertEquals(listOf(3L), y.topilmadi); assertEquals(104L, y.map[4L])
    }

    @Test fun twinsAreCandidatesByRootName() {
        val o = listOf(EgizakObyekt(1, "Osiyo oshxonasi №1", 5), EgizakObyekt(2, "Osiyo oshxonasi №2", 5), EgizakObyekt(3, "Boshqa", 5), EgizakObyekt(4, "Osiyo oshxonasi №3", 6), EgizakObyekt(5, "X", null))
        assertEquals(listOf(2L, 3L), egizakObyektlar(o, 1).map { it.id }); assertEquals(emptyList<Long>(), egizakObyektlar(o, 5).map { it.id })
        assertEquals(listOf(2L), egizakJuftlari(o, 1).map { it.id }); assertEquals("osiyo oshxonasi", egizakNomIldizi("Osiyo  oshxonasi # 2")); assertNull(egizakNomIldizi("Boshqa"))
    }

    @Test fun percentFromEachTwinsOwnSmetaAndModesKept() {
        val B = asl(100); val C = asl(200)
        val kirit = mapOf(2L to k(Rejim.Plus, "50%"), 4L to k(Rejim.Teng, "6"))
        val rb = faktEgizakReja(A, kirit, tomon(10, B, mapOf(102L to 10.0, 104L to 10.0), mapOf(104L to 1.0)), emptyMap())
        val rc = faktEgizakReja(A, kirit, tomon(11, C, mapOf(202L to 40.0, 204L to 10.0)), emptyMap())
        assertEquals(listOf(102L to 5.0, 104L to 5.0), rb.paket.map { it.qatorId to it.hajm }); assertEquals(listOf(202L to 20.0, 204L to 6.0), rc.paket.map { it.qatorId to it.hajm })
        assertEquals(listOf(Rejim.Plus, Rejim.Teng), rb.moslar.map { it.rejim }); val m1 = rb.moslar[1]; assertEquals(1.0, m1.joriy, 0.0); assertEquals(5.0, m1.delta, 0.0); assertEquals(6.0, m1.yangi, 0.0)
    }

    @Test fun unmatchedRowsWithReasonMinusAndLowFaktAllowed() {
        val B = asl(100).filter { it.id != 103L }
        val kirit = mapOf(3L to k(Rejim.Plus, "2"), 2L to k(Rejim.Plus, "-1"), 1L to k(Rejim.Plus, "1"), 99L to k(Rejim.Plus, "1"))
        val r = faktEgizakReja(A + q(99, 1, "mat", "Qo‘shimcha", qosh = true), kirit, tomon(10, B, mapOf(102L to 10.0, 104L to 10.0), mapOf(102L to 4.0)), emptyMap())
        assertEquals(listOf(102L to -1.0), r.paket.map { it.qatorId to it.hajm })
        assertEquals(mapOf(3L to "topilmadi", 1L to "tur", 99L to "qoshimcha_yoq"), r.radlar.associate { it.aId to it.sabab })
    }

    @Test fun percentWithoutSmetaIsNotInvented() {
        val r = faktEgizakReja(A, mapOf(2L to k(Rejim.Teng, "50%")), tomon(10, asl(100), mapOf(102L to null)), emptyMap())
        assertTrue(r.paket.isEmpty()); assertEquals(listOf(Triple(2L, "Ish 1", "FOIZ_SMETASIZ")), r.radlar.map { Triple(it.aId, it.nom, it.sabab) })
    }

    @Test fun additionalRowByOperationIdAndByUniqueContentKey() {
        val aq = q(50, 1, "mat", "Qosh", qosh = true)
        val bq = q(150, 101, "mat", "Qosh", qosh = true, opId = egizakOpId(50, 10).uppercase())
        val x = qoshimchaXarita(A + aq, asl(100) + bq, 10); assertEquals(150L, x[50L])
        val r = faktEgizakReja(A + aq, mapOf(50L to k(Rejim.Plus, "3")), tomon(10, asl(100) + bq, mapOf(150L to 5.0)), x)
        assertEquals(listOf(150L to 3.0), r.paket.map { it.qatorId to it.hajm })
        val a2 = q(50, 1, "bl", "ЗАСЫПКА ТРАНШЕЙ", "E1-1-33", 0.66, true)
        val b2 = q(150, 101, "bl", "ЗАСЫПКА  ТРАНШЕЙ", "E1-1-33", 0.66, true)
        assertEquals(150L, qoshimchaXarita(A + a2, asl(100) + b2, 10)[50L])
        val b3 = q(151, 101, "bl", "ЗАСЫПКА ТРАНШЕЙ", "E1-1-33", 0.66, true)
        assertFalse(qoshimchaXarita(A + a2, asl(100) + b2 + b3, 10).containsKey(50L))
        val b4 = q(152, 101, "bl", "ЗАСЫПКА ТРАНШЕЙ", "E1-1-33", 0.7, true)
        assertFalse(qoshimchaXarita(A + a2, asl(100) + b4, 10).containsKey(50L))
    }

    @Test fun faktAsEqualEntriesOnlyBlMatOb() {
        val m = faktdanKiritmalar(listOf(jq(1, "bl", 4.0), jq(2, "rs", 4.0), jq(3, "mat", 0.0), jq(4, "ob", -2.0)))
        assertEquals(listOf(1L to "4", 4L to "-2"), m.map { it.key to it.value.qiymat }); assertTrue(m.values.all { it.rejim == Rejim.Teng })
    }
    private fun jq(id: Long, tur: String, fakt: Double) = JurnalQator(id, tur, null, "n", null, 10.0, fakt, null, 0.0, null, 0.0, HolatTur.Yangi, null, false, false, null, null, null, null, null, null)

    @Test fun twinsDoNotBlockEachOther() = runBlocking {
        fun rejalar() = listOf(10L, 11L, 12L).map { id -> faktEgizakReja(A, mapOf(4L to k(Rejim.Teng, "6")), tomon(id, asl(id * 10), mapOf(id * 10 + 4 to 10.0), mapOf(id * 10 + 4 to 1.0)), emptyMap()) }
        val ops = mapOf(10L to "op-10", 11L to "op-11", 12L to "op-12"); val yozilgan = ArrayList<Pair<Long, String>>()
        val res = faktEgizakYoz(rejalar(), ops, { oid, idlar -> idlar.associateWith { if (oid == 11L) 3.0 else 1.0 } }, { oid, _, op -> yozilgan.add(oid to op); true to null })
        assertEquals(listOf("yozildi", "ziddiyat", "yozildi"), res.map { it.holat }); assertEquals(listOf(10L to "op-10", 12L to "op-12"), yozilgan)
        val res2 = faktEgizakYoz(rejalar(), ops, { _, idlar -> idlar.associateWith { 1.0 } }, { oid, _, _ -> if (oid == 10L) throw RuntimeException("403"); if (oid == 11L) false to "FAKT_LINE_INVALID" else true to null })
        assertEquals(listOf("xato", "xato", "yozildi"), res2.map { it.holat }); assertEquals("FAKT_LINE_INVALID", res2[1].xabar)
    }

    @Test fun correctionRowsFollowTheMainWork() {
        // "НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ... ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ": bound to the nearest preceding ordinary work with the same unit and ~same volume.
        val rows = listOf(
            TuzatishManba(1, "bl", "E1", "УСТРОЙСТВО БЕТОНА", "М3", 10.0, 9, 1.0, false, false),
            TuzatishManba(2, "bl", "E1-1", "НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ", "М3", 10.0, 9, 2.0, false, false),
        )
        val x = tuzatishBoglanishlari(rows); assertEquals(mapOf(2L to 1L), x.asos); assertEquals(mapOf(1L to listOf(2L)), x.ergashuvchi)
        assertEquals(5.0, tuzatishFakti(10.0, 5.0, 10.0)!!, 0.0); assertNull(tuzatishFakti(10.0, null, 10.0)); assertNull(tuzatishFakti(10.0, 5.0, 0.0))
        val (p, tz) = tuzatishPaketi(listOf(FaktQatorHajm(1, 4.0)), x, mapOf(1L to 0.0, 2L to 0.0), mapOf(1L to 10.0, 2L to 10.0))
        assertEquals(listOf(1L to 4.0, 2L to 4.0), p.map { it.qatorId to it.hajm }); assertEquals(listOf(2L), tz)
    }

    @Test fun casAndUnitWarning() {
        val kirit = mapOf(1L to k(Rejim.Teng, "5"), 2L to k(Rejim.Plus, "5"), 3L to k(Rejim.Teng, ""))
        assertEquals(listOf(1L), jamiIdlari(kirit, emptyMap()))
        assertEquals(listOf(Triple(1L, 2.0, 5.0), Triple(9L, 0.0, null)), casZiddiyat(listOf(1, 9), mapOf(1L to 2.0), mapOf(1L to 5.0)).map { Triple(it.id, it.brauzer, it.server) })
        assertNull(birlikOgohi(10.0, 0.0, Rejim.Plus, 12.0, "М3"))
        val o = birlikOgohi(3.0, 0.0, Rejim.Plus, 300.0, "100М3")!!; assertEquals(100, o.kopaytma); assertEquals(3.0, o.taklif!!, 1e-9); assertTrue(o.gumon); assertEquals(2, o.daraja)
        assertNotNull(qiymatBirlikOgohi("300", Rejim.Teng, 3.0, 0.0, "100М3")); assertNull(qiymatBirlikOgohi("", Rejim.Teng, 3.0, 0.0, "М3"))
    }
}
