package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.fakt.PodvalTexts.Koef

/**
 * PARITY with the website: fixtures / expectations copied from frontend/src/lib/hisob-yadro/hisob-yadro.test.ts (podval, hisob, yaxlit svod, buyurtmachi,
 * korinishlar, review fixes) and lib/svod-yaxlit.test.ts. Synthetic coefficients (not a real object), same as the site tests.
 */
class KaskadParityTest {
    private val NK: Map<String, Double?> = mapOf(
        Koef.TRANSPORT_MATERIAL to 5.0, Koef.SKLADSKIE_MATERIAL to 2.0, Koef.SKLADSKIE_MK to 0.75, Koef.TRANSPORT_KABEL to 1.5, Koef.PROCHIE_PODRYADCHIK to 18.0,
        Koef.TRANSPORT_OBORUD to 2.0, Koef.ZAGOT_SKLAD_OBORUD to 1.2, Koef.STRAXOVANIE to 0.32, Koef.RISK to 0.0, Koef.NDS to 12.0,
    )
    private fun chel(v: Double) = mapOf(Kat.CHEL to v)
    private fun near(e: Double, a: Double?) = assertEquals(e, a!!, 0.0)

    @Test fun missingPercentageMakesItogo4UnknownNotZero() {
        val r = kaskad(chel(1000.0), standartPodval(NK - Koef.PROCHIE_PODRYADCHIK))
        assertTrue("prochie" in r.nomalumQatorlar); assertNull(r.itogo4); assertNull(r.qqsBilan)
        near(1000.0, r.qiymat["itogo1"])                      // steps before the unknown are known
    }

    @Test fun unknownVatRateMakesVatNullButItogo4Known() {
        val r = kaskad(chel(1000.0), standartPodval(NK - Koef.NDS))
        assertNotNull(r.itogo4); assertNull(r.qqs); assertNull(r.qqsFoiz)
    }

    @Test fun serverInheritanceModeKeepsSmetaPercentAndFillsTheRestFromCoefficients() {
        val base = standartPodval(NK)
        val p = base.copy(qatorlar = base.qatorlar.map { q -> if (q.kod == "prochie") q.copy(foiz = 20.0, manba = "smeta") else if (q.kod == "strax") q.copy(foiz = 9.0, manba = "meros") else q })
        val m = serverMerosKoefQoy(p, NK + (Koef.STRAXOVANIE to 0.5) + (Koef.TRANSPORT_KABEL to null))
        fun f(kod: String) = m.qatorlar.first { it.kod == kod }.foiz
        assertEquals(20.0, f("prochie"))                 // from the estimate: the caller cannot replace it
        assertEquals(0.5, f("strax"))                    // inherited: from the coefficients, like the server
        assertTrue(m.qatorlar.first { it.kod == "strax" }.merosIzoh!!.contains("по умолчанию"))
        assertTrue(serverMerosKoefQoy(p, NK, "shartnoma").qatorlar.first { it.kod == "strax" }.merosIzoh!!.contains("из договора"))
        assertNull(f("tr_kab"))                          // no coefficient: unknown, not 0
    }

    @Test fun unknownKfIsNullAndKOplateReturnsNull() {
        val kf = kategoriyaKf(standartPodval(NK - Koef.TRANSPORT_KABEL))
        assertNull(kf[Kat.KAB]); assertNotNull(kf[Kat.CHEL])
        assertNull(kOplate(100.0, Kat.KAB, kf)); assertNull(kOplate(100.0, null, kf))
    }

    @Test fun hisobResultOrderAndNullSemantics() {
        val k = kesimYigish(listOf(Kat.CHEL.kod to 1000.0, Kat.MAT.kod to null), { it.first }, { it.second })
        val h = hisob(k, koef = NK)
        assertEquals(1, h.narxsizSoni); assertEquals(12.0, h.qqsFoiz)
        near(yaxlit2(h.ustamali!! + h.qqs!!), h.qqsBilan)
    }

    @Test fun noCoefficientAndNoPodvalIsKoefYoq() {
        val h = hisob(kesimYigish(listOf(Kat.CHEL.kod to 1000.0), { it.first }, { it.second }))
        assertEquals("KOEF_YOQ", h.sabab); assertNull(h.ustamali); near(1000.0, h.ustamasiz)
    }

    @Test fun unknownCategorySumNeverGoesToMatItIsAddedWithoutMarkup() {
        fun cut(vararg x: Pair<String, Double>) = kesimYigish(x.toList(), { it.first }, { it.second })
        val a = hisob(cut(Kat.MAT.kod to 1000.0), koef = NK)
        val b = hisob(cut(Kat.MAT.kod to 1000.0, "???" to 1000.0), koef = NK)
        near(1000.0, b.kategoriyalar[Kat.MAT]); near(1000.0, b.nomalumSumma)
        near(yaxlit2(a.ustamali!! + 1000), b.ustamali); assertTrue(b.taxminiy)
    }

    @Test fun vatConstantFromOneSource() {
        assertEquals(12.0, NDS_SUKUT_FOIZ, 0.0); near(112.0, qqsBilan(100.0, NDS_SUKUT_FOIZ)); assertNull(qqsBilan(100.0, null))
    }

    @Test fun roundSvodIsUniversalOnlyVat() {
        near(1000.0, yaxlitQqssiz(1120.0, 12.0, 999.0)); near(777.78, yaxlitQqssiz(null, null, 777.777)); assertNull(yaxlitQqssiz(1120.0, null, 999.0))
        val t = yaxlitTaqsim(1000.0, listOf(IdSumma(1, 333.33), IdSumma(2, 333.33), IdSumma(3, 333.34), IdSumma(4, -10.0)))!!
        near(1000.0, yaxlit2(t.values.sum())); assertTrue(t[4]!! < 0)
        assertNull(yaxlitTaqsim(10.0, listOf(IdSumma(1, null)))); assertNull(yaxlitTaqsim(10.0, listOf(IdSumma(1, 0.0))))
        near(500.0, yaxlitKorinish(1000.0, 800.0, 400.0)); assertNull(yaxlitKorinish(1000.0, 0.0, 400.0))
        near(1120.0, yaxlitKOplate(1000.0, 12.0)); assertNull(yaxlitKOplate(1000.0, null))
        near(1120.0, kOplate(1000.0, Kat.MAT, kategoriyaKf(standartPodval(NK)), true, 12.0))
    }

    @Test fun svodAfterVatWithVatExact() {
        val y = yaxlitBilanYakun(100.0, 12.0, 112.0, 1000.01, 892.87)!!
        near(992.87, y.itogo4); near(119.14, y.nds); near(1112.01, y.vsego); assertNull(yaxlitBilanYakun(100.0, 12.0, 112.0, null, null))
        val s = yaxlitSvodSumma(1000.01, 12.0, null, 12.0)
        near(1000.01, s.qqsBilan); near(1000.01, yaxlit2(s.qqssiz!! + s.qqs!!))
        val r = kaskad(chel(1000.0), standartPodval(NK), KaskadOpsiya(yaxlit = YaxlitKirish.QqsdanKeyin(777777.77)))
        val w = kaskad(chel(1000.0), standartPodval(NK))
        near(yaxlit2(w.vsego!! + 777777.77), r.vsego); assertEquals(w.qiymat["itogo4"], r.qiymat["itogo4"]); assertEquals(w.qiymat["nds"], r.qiymat["nds"])
        near(r.qqsBilan!!, yaxlit2(r.itogo4!! + r.qqs!!))
    }

    @Test fun customPodvalWithoutItogo4CannotTakeRoundSum() {
        val p = Podval(listOf(PodvalQator("jami", "ВСЕГО", PodvalTur.Jami, baza = listOf(KatHad(Kat.CHEL)))))
        val r = kaskad(chel(10.0), p, KaskadOpsiya(nomalumQism = 5.0))
        assertNull(r.itogo4); assertTrue("itogo4" in r.nomalumQatorlar)
    }

    @Test fun customRowBetweenItogo4AndVsegoIsRefusedExplicitly() {
        val p = standartPodval(NK); val i = p.qatorlar.indexOfFirst { it.kod == "nds" }
        val qs = p.qatorlar.toMutableList(); qs.add(i, PodvalQator("bonus", "Бонус", PodvalTur.Foiz, 1.0, listOf(QatorHad("itogo4"))))
        val r = kaskad(chel(10.0), p.copy(qatorlar = qs), KaskadOpsiya(yaxlit = YaxlitKirish.QqsdanKeyin(5.0)))
        assertEquals("SVOD_YAXLIT_ITOGO4_DAN_KEYIN_QATOR", r.xato); assertNull(r.vsego)
    }

    @Test fun roundEntryStagesAndCustomerCosts() {
        val w = kaskad(chel(1000.0), standartPodval(NK))
        val r = kaskad(chel(1000.0), standartPodval(NK), KaskadOpsiya(yaxlitlar = listOf(YaxlitKirish.QqssizUstamadanKeyin(500.0))))
        near(yaxlit2(w.qiymat["itogo4"]!! + 500), r.qiymat["itogo4"]); near(yaxlit2(r.qiymat["itogo4"]!! * 0.12), r.qqs)
        val a = kaskad(mapOf(Kat.CHEL to 1000.0, Kat.MAT to 300.0), standartPodval(NK))
        val b = kaskad(chel(1000.0), standartPodval(NK), KaskadOpsiya(yaxlitlar = listOf(YaxlitKirish.TogriXarajat(mapOf(Kat.MAT to 300.0)))))
        assertEquals(a.qqsBilan, b.qqsBilan)
        val ob = kaskad(mapOf(Kat.OB to 1000.0), standartPodval(NK))
        near(0.0, ob.qiymat["itogo1"]); near(0.0, ob.qiymat["prochie"]); near(20.0, ob.qiymat["tr_ob"]); near(12.0, ob.qiymat["zag_ob"])
        val p = standartPodval(NK)
        val extra = listOf(
            PodvalQator("zakazchik", "z", PodvalTur.Foiz, 5.0, listOf(QatorHad("vsego"))), PodvalQator("shaffof", "s", PodvalTur.Foiz, 0.05, listOf(QatorHad("vsego"))),
            PodvalQator("malumot", "m", PodvalTur.Foiz, 1.0, listOf(QatorHad("vsego")), amal = "korsatish"),
        )
        val c = kaskad(chel(1000.0), p.copy(qatorlar = p.qatorlar + extra), KaskadOpsiya(yaxlit = YaxlitKirish.QqsdanKeyin(10000.0)))
        val d = kaskad(chel(1000.0), standartPodval(NK), KaskadOpsiya(yaxlit = YaxlitKirish.QqsdanKeyin(10000.0)))
        assertEquals(d.qqsBilan, c.qqsBilan)
        near(yaxlit2(c.vsego!! * 0.05), c.qiymat["zakazchik"]); near(yaxlit2(c.vsego!! * 0.0005), c.qiymat["shaffof"])
        near(yaxlit2(c.vsego!! + c.qiymat["zakazchik"]!! + c.qiymat["shaffof"]!!), c.buyurtmachiJami)
        assertEquals(listOf("qoshiladi", "qoshiladi", "korsatish"), c.buyurtmachi.map { it.amal })
    }

    @Test fun views() {
        fun q(id: Long = 1, kat: String? = Kat.MAT.kod, narx: Double? = 10.0, sm: Double? = 100.0, f2: Double? = null, f2h: Double? = null, fh: Double? = null, alm: Double? = null) = KorinishQator(id, kat, narx, sm, fh, f2, f2h, null, alm)
        near(500.0, korinishSummasi(q(f2 = 300.0, alm = 200.0), Korinish.Qoldiq)); assertNull(korinishSummasi(q(sm = null, f2 = 300.0), Korinish.Qoldiq)); assertNull(qoldiq(null, 0.0)); near(100.0, qoldiq(100.0, null))
        near(-123.45, korinishSummasi(q(f2 = -123.45), Korinish.F2)); assertNull(korinishSummasi(q(f2 = null), Korinish.F2))
        // price rule
        assertEquals(FaktSummaNatija(70000.0, "f2", 35000.0), faktSummaF2Narxda(2.0, 5.0, 175000.0, 24000.0))
        assertNull(faktSummaF2Narxda(null, 5.0, 175000.0, null).summa)
        assertEquals(FaktSummaNatija(24000.0, "fakt", null), faktSummaF2Narxda(2.0, 0.0, 0.0, 24000.0)); assertEquals("fakt", faktSummaF2Narxda(2.0, null, null, 24000.0).manba)
        near(-35000.0, faktSummaF2Narxda(-1.0, -2.0, -70000.0, -12000.0).summa); assertEquals(FaktSummaNatija(null, "f2", null), faktSummaF2Narxda(2.0, 5.0, null, 24000.0))
        assertEquals(FaktSummaNatija(3270.0, "fakt", null), faktSummaF2Narxda(1.0, 1.0, 0.0, 3270.0, 1.0)); near(0.0, faktSummaF2Narxda(1.0, 1.0, 0.0, 3270.0, 0.0).summa)
        assertNull(faktSummaF2Narxda(null, 1.0, null, null, 2.0).summa); near(0.0, faktSummaF2Narxda(2.0, 5.0, 0.0, 24000.0).summa)
        near(28656.23, faktSummaF2Narxda(1.0, 1.0, 28656.224999999995, null).summa); near(-28656.23, faktSummaF2Narxda(1.0, 1.0, -28656.224999999995, null).summa)
        assertEquals("IF(AND(ISNUMBER(J1),J1<>0),IF(AND(ISNUMBER(K1),H1<>\"\"),ROUND(H1*K1/J1,2),\"\"),ROUND(H1*F1,2))", faktSummaF2NarxFormula("H1", "J1", "K1", "ROUND(H1*F1,2)"))
        near(50.0, korinishSummasi(q(fh = 5.0, f2h = 8.0, f2 = 80.0), Korinish.Fakt, true)); near(100.0, korinishSummasi(q(fh = 5.0, f2h = 8.0, f2 = 160.0), Korinish.Fakt, true))
        near(50.0, korinishSummasi(q(fh = 5.0, f2 = 80.0), Korinish.Fakt)); near(800.0, yaxlitQoldiqF2(1200.0, 400.0))
        // monthly money = the same cascade at the scaled volume view
        val qs = listOf(q(1, Kat.CHEL.kod, 1000.0, 10.0).let { KorinishQator(it.id, it.kat, it.narx, it.smetaHajm, davrHajm = hajmMasshtab(10.0, 0.3)) }, KorinishQator(2, Kat.MAT.kod, 500.0, 40.0, davrHajm = hajmMasshtab(40.0, 0.3)))
        val oy = hisob(korinishKesim(qs, Korinish.Oy), koef = NK)
        val togri = hisob(kesimYigish(listOf(Kat.CHEL.kod to 3000.0, Kat.MAT.kod to 6000.0), { it.first }, { it.second }), koef = NK)
        assertEquals(togri.qqsBilan, oy.qqsBilan)
        // svod descendants go to the VAT-free part; F2 view: CHEL / MASH inside a svod section are NOT round, OB stays
        val k = korinishKesim(listOf(q(1), q(2, Kat.CHEL.kod)), Korinish.Smeta, yaxlitIdlar = setOf(2L))
        near(1000.0, k.yaxlitQator); near(1000.0, k.summalar[Kat.MAT])
        val f2qs = listOf(q(1, Kat.CHEL.kod, f2 = 1000.0), q(2, Kat.MASH.kod, f2 = 200.0), q(3, Kat.OB.kod, f2 = 500.0)); val yx = setOf(1L, 2L, 3L)
        val f2 = korinishKesim(f2qs, Korinish.F2, yaxlitIdlar = yx)
        near(1000.0, f2.summalar[Kat.CHEL]); near(200.0, f2.summalar[Kat.MASH]); near(500.0, f2.yaxlitQator)
        val sm = korinishKesim(f2qs.map { KorinishQator(it.id, it.kat, it.f2Summa, 1.0, f2Summa = it.f2Summa) }, Korinish.Smeta, yaxlitIdlar = yx)
        assertNull(sm.summalar[Kat.CHEL]); near(1700.0, sm.yaxlitQator)
    }

    @Test fun reviewFixes() {
        val t = yaxlitQatorlarga(1000.0, listOf(IdSumma(1, 300.0), IdSumma(2, null), IdSumma(3, 700.0)))!!
        assertFalse(2 in t); near(1000.0, yaxlit2(t[1]!! + t[3]!!)); assertNull(yaxlitQatorlarga(10.0, listOf(IdSumma(1, null))))
        val r = kaskad(chel(1000.0), standartPodval(NK), KaskadOpsiya(yaxlitlar = listOf(YaxlitKirish.TogriXarajat(mapOf(Kat.MAT to null)))))
        assertNull(r.qqsBilan); assertTrue("togri_xarajat" in r.nomalumQatorlar)
        val p = standartPodval(NK)
        val qs = p.qatorlar.map { if (it.kod == "vsego") it.copy(kod = "jami_tolov") else it } + PodvalQator("zakazchik", "z", PodvalTur.Foiz, 5.0, listOf(QatorHad("jami_tolov")), amal = "qoshiladi")
        val custom = p.copy(qatorlar = qs)
        assertNull(podvalVsegoKodi(custom))
        val e = kaskad(chel(1000.0), custom)
        assertEquals("VSEGO_KODI_YOQ", e.xato); assertNull(e.qqsBilan)
    }

    // ----- lib/svod-yaxlit.test.ts -----
    @Test fun svodYaxlitTest() {
        val cats = ServerCats(1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        val bolim = SvodYaxlitBolim(10, "B", 2240.01, 12.0, 2000.0, 2000.0)
        val yax = SvodYaxlit(2000.0, 1000.0, 0.0, listOf(bolim))
        val k = kaskad(serverCatsdan(cats), standartPodval(NK))
        val h = hisob(katKesimServerdan(cats, yax), koef = NK)
        near(yaxlit2(k.vsego!! + 2240.01), h.qqsBilan); near(yaxlit2(k.itogo4!! + 2000), h.ustamali); near(2000.0, h.ustamasiz)
        near(k.itogo4!!, hisob(katKesimServerdan(cats), koef = NK).ustamali)
    }
}
