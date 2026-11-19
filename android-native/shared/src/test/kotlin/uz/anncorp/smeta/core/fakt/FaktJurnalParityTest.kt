package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PARITY with the website: the fixtures and expectations below are copied from frontend/src/lib/fakt-jurnal.test.ts,
 * fakt-jurnal.formula.test.ts, fakt-jurnal.son.test.ts and formula/number-formula.test.ts. If the site changes a rule, its test changes and
 * this file must follow (same numbers, same error codes). bolimSummalari / nakopitelniyMoslik tests come with their port.
 */
class FaktJurnalParityTest {
    private fun q(id: Long, tur: String, ota: Long? = null, daraja: Int = 0, kod: String? = null, nom: String = "n", hajm: Double? = null, kat: String? = null, zamena: Boolean = false, qosh: Boolean = false, versiya: Int = 1) =
        T2Qator(id, ota, daraja, tur, kod, nom, "m3", hajm, kat, qosh, zamena, versiya)

    private val rows = listOf(
        q(1, "rz", kod = "1", nom = "Zemlyanye", versiya = 4),
        q(2, "bl", 1, 1, nom = "Razrabotka grunta", hajm = 100.0),
        q(3, "rs", 2, 2, nom = "Zatraty truda", hajm = 50.0),
        q(4, "mat", 2, 2, nom = "Pesok", hajm = 10.0),
        q(5, "rz", 1, 1, kod = "1.1", nom = "Ichkari"),
        q(6, "bl", 5, 2, nom = "Zasypka", hajm = 20.0),
        q(7, "mat", 1, 1, nom = "Shcheben", hajm = 5.0),
    )
    private val states = listOf(
        JurnalHolat(2, smetaHajm = 100.0, faktHajm = 40.0, smetaSumma = 1000.0, faktSumma = 400.0),
        JurnalHolat(3, smetaHajm = 50.0, faktHajm = 20.0),
        JurnalHolat(6, smetaHajm = 20.0, faktHajm = 20.0, smetaSumma = 1000.0, faktSumma = 1000.0),
        JurnalHolat(7, smetaHajm = 5.0, faktHajm = 6.0),
    )

    @Test fun sectionsInTreeOrderWithShareBySum() {
        val m = jurnalQur(rows, states)
        assertEquals(listOf(1L to 0, 5L to 1), m.bolimlar.map { it.id to it.daraja })
        assertEquals(0.8, m.bolimlar[0].ulush!!, 1e-9)
        assertEquals(3, m.bolimlar[0].ishSoni); assertEquals(2, m.bolimlar[0].tugaganSoni); assertEquals(4, m.bolimlar[0].versiya)
        assertEquals(1.0, m.bolimlar[1].ulush!!, 0.0)
    }

    @Test fun workResourcesAndAutomaticRows() {
        val ishlar = jurnalQur(rows, states).bolimIshlari[1L]!!
        assertEquals(listOf(2L, 7L), ishlar.map { it.id })
        assertEquals(HolatTur.Qisman, ishlar[0].q.holat); assertEquals(60.0, ishlar[0].q.qoldiq!!, 0.0)
        assertEquals(1L, ishlar[0].q.otaId); assertEquals(4, ishlar[0].q.otaVersiya)
        assertEquals(listOf(4L), ishlar[0].resurslar.map { it.id })
        assertEquals(listOf(3L to 20.0), ishlar[0].avtomatik.map { it.id to it.fakt })
        assertEquals(HolatTur.Oshdi, ishlar[1].q.holat)
    }

    @Test fun sectionWithEveryWorkDoneIs100EvenWhenTheWorkSumIsZero() {
        val r = listOf(q(1, "rz", nom = "Stena"), q(2, "bl", 1, hajm = 0.2), q(3, "mat", 1, hajm = 0.037))
        val h = listOf(JurnalHolat(2, smetaHajm = 0.2, faktHajm = 0.2, smetaSumma = 2246153.0, faktSumma = 0.0), JurnalHolat(3, smetaHajm = 0.037, faktHajm = 0.037, smetaSumma = 285084.0, faktSumma = 285084.0))
        assertEquals(1.0, jurnalQur(r, h).bolimlar[0].ulush!!, 0.0)
    }

    @Test fun holatTurAndDeductionWork() {
        assertEquals(HolatTur.Yangi, holatTur(10.0, 0.0)); assertEquals(HolatTur.Tugadi, holatTur(10.0, 10.0)); assertEquals(HolatTur.Smetasiz, holatTur(null, 3.0))
        assertEquals(HolatTur.Yangi, holatTur(-4.0, 0.0)); assertEquals(HolatTur.Qisman, holatTur(-4.0, -2.0))
        assertEquals(HolatTur.Tugadi, holatTur(-4.0, -4.0)); assertEquals(HolatTur.Oshdi, holatTur(-4.0, -5.0))
    }

    @Test fun plusAndEqualModesMakeOneDeltaPackage() {
        val faktlar = mapOf(2L to 40.0, 4L to 0.0, 6L to 20.0)
        val p = jurnalPaket(mapOf(2L to Kiritma(Rejim.Teng, "55"), 4L to Kiritma(Rejim.Plus, "2,5"), 6L to Kiritma(Rejim.Teng, "20")), faktlar)
        assertTrue(p.ok); assertEquals(listOf(FaktQatorHajm(2, 15.0), FaktQatorHajm(4, 2.5)), p.qatorlar)
        val bad = jurnalPaket(mapOf(2L to Kiritma(Rejim.Teng, "-1"), 4L to Kiritma(Rejim.Plus, "x"), 6L to Kiritma(Rejim.Plus, "0")), faktlar)
        assertFalse(bad.ok); assertEquals(listOf("MANFIY", "NOL", "SON_EMAS"), bad.xatolar.values.map { it.name }.sorted())
        assertEquals(listOf(FaktQatorHajm(2, -10.0)), jurnalPaket(mapOf(2L to Kiritma(Rejim.Teng, "30")), faktlar).qatorlar)
    }

    @Test fun remainderShareAndSonOqi() {
        assertEquals("15", qoldiqUlushi(60.0, null, 25.0)); assertNull(qoldiqUlushi(0.0, null, 100.0)); assertEquals(1000.5, sonOqi(" 1 000,5 ")!!, 0.0)
        assertEquals("-2", qoldiqUlushi(-4.0, -4.0, 50.0)); assertNull(qoldiqUlushi(1.0, -4.0, 50.0)); assertNull(qoldiqUlushi(-1.0, 10.0, 50.0))
    }

    @Test fun deductionPlanAcceptsNegativeFaktOnly() {
        val faktlar = mapOf(1L to 0.0, 2L to 0.0); val smetalar = mapOf<Long, Double?>(1L to -4.0, 2L to 10.0)
        val ok = jurnalPaket(mapOf(1L to Kiritma(Rejim.Teng, "-3")), faktlar, smetalar)
        assertTrue(ok.ok); assertEquals(listOf(FaktQatorHajm(1, -3.0)), ok.qatorlar)
        val bad = jurnalPaket(mapOf(1L to Kiritma(Rejim.Teng, "2"), 2L to Kiritma(Rejim.Teng, "-1")), faktlar, smetalar)
        assertEquals(JurnalXato.ISHORA, bad.xatolar[1]); assertEquals(JurnalXato.MANFIY, bad.xatolar[2])
    }

    @Test fun sectionContentIncludesDescendantsAndDropsEmptyBranches() {
        val r = listOf(q(1, "rz", nom = "A"), q(2, "rz", 1, nom = "A.1"), q(3, "rz", 2, nom = "A.1.1"), q(4, "bl", 3, nom = "Ish", hajm = 1.0), q(5, "rz", 1, nom = "A.2 (bosh)"))
        val m = jurnalQur(r, emptyList())
        val t = bolimTarkibi(1, m.bolimlar, m.bolimIshlari)
        assertEquals(listOf(Triple(1L, 0, emptyList<Long>()), Triple(2L, 1, emptyList()), Triple(3L, 2, listOf(4L))), t.map { Triple(it.bolim.id, it.nisbiy, it.ishlar.map { i -> i.id }) })
        assertEquals(1, m.bolimlar.first { it.id == 1L }.ishSoni)
    }

    @Test fun replacementFollowsItsOriginalWithCategoryAndOriginalName() {
        val r = listOf(
            q(1, "rz", nom = "A"), q(2, "bl", 1, kod = "E1", nom = "Asl ish", hajm = 10.0), q(3, "bl", 1, nom = "Boshqa ish", hajm = 5.0),
            q(4, "bl", 1, nom = "Zamena ish", hajm = 10.0, zamena = true, qosh = true), q(5, "mat", 2, nom = "Blok", kat = "MAT", hajm = 3.0),
            q(6, "mat", 2, nom = "Kabel", kat = "KAB", hajm = 2.0), q(7, "mat", 2, nom = "Gisht", kat = "MAT", hajm = 300.0, zamena = true),
        )
        val zb = ZamenaBoglanish(mapOf(4L to 2L, 7L to 5L), mapOf(2L to 4.0))
        val ishlar = jurnalQur(r, emptyList(), zb).bolimIshlari[1L]!!
        assertEquals(listOf(2L, 4L, 3L), ishlar.map { it.id })
        assertEquals(2L, ishlar[1].q.almashtiradi); assertEquals("E1 Asl ish", ishlar[1].q.aslNom)
        assertEquals(4.0, ishlar[0].q.almashtirilgan!!, 0.0)
        assertEquals(listOf(5L, 7L, 6L), ishlar[0].resurslar.map { it.id }); assertEquals("KAB", ishlar[0].resurslar[2].kat)
        class Z(val id: Long, val a: Long?)
        assertEquals(listOf(1L, 2L), zamenaTartibla(listOf(Z(1, 2), Z(2, 1)), { it.id }, { it.a }).map { it.id }.sorted())
    }

    // ----- fakt-jurnal.formula.test.ts -----
    private val kq = faktFormulaKonteksti(100.0, 60.0, 40.0, 30.0)
    private fun num(r: KiritmaSoni): Double = (r as KiritmaSoni.Num).value

    @Test fun formulaContextAndValues() {
        assertEquals(mapOf("SMETA" to 100.0, "FAKT" to 60.0, "QOLDIQ" to 40.0, "F2_MUMKIN" to 30.0), kq)
        assertEquals(40.0, num(kiritmaSoni("=SMETA-FAKT", 100.0, kq)), 0.0); assertEquals(50.0, num(kiritmaSoni("=SMETA*0,5", 100.0, kq)), 0.0)
        assertEquals(40.0, num(kiritmaSoni("=QOLDIQ", 100.0, kq)), 0.0); assertEquals(31.0, num(kiritmaSoni("=F2_MUMKIN+1", 100.0, kq)), 0.0)
        assertEquals(0.333333, num(kiritmaSoni("=1/3", 100.0, kq)), 0.0); assertEquals(12.5, num(kiritmaSoni("12,5", 100.0, kq)), 0.0)
        assertEquals(50.0, num(kiritmaSoni("50%", 100.0, kq)), 0.0)
        assertEquals(KiritmaSoni.Bosh, kiritmaSoni("", 100.0, kq)); assertEquals(KiritmaSoni.Bosh, kiritmaSoni("   ", 100.0, kq))
    }

    @Test fun badFormulaIsNaNAndEmptyIsNullNotZero() {
        for (x in listOf("=", "=1/0", "=NOMA", "=constructor", "=__proto__", "=SUM(1)", "=1+", "=window.alert(1)")) assertTrue(x, num(kiritmaSoni(x, 100.0, kq)).isNaN())
        assertTrue(num(kiritmaSoni("=FAKT", 100.0, mapOf("FAKT" to null))).isNaN())
        assertTrue(num(kiritmaSoni("=SMETA", null, emptyMap())).isNaN())
        assertTrue(num(kiritmaSoni("=FAKT", 100.0)).isNaN())
    }

    @Test fun formulaErrorReasons() {
        assertEquals(FormulaError.DIVIDE_BY_ZERO, formulaXatosi("=1/0", 1.0)); assertEquals(FormulaError.UNKNOWN_NAME, formulaXatosi("=XYZ", 1.0))
        assertNull(formulaXatosi("=1+1", 1.0)); assertNull(formulaXatosi("5", 1.0))
    }

    @Test fun formulaInThePackage() {
        val kont = (1L..4L).associateWith { kq }
        val p = jurnalPaket(
            mapOf(1L to Kiritma(Rejim.Teng, "=SMETA"), 2L to Kiritma(Rejim.Plus, "=QOLDIQ/2"), 3L to Kiritma(Rejim.Plus, "=1/0"), 4L to Kiritma(Rejim.Teng, "=NOMA")),
            mapOf(1L to 60.0, 2L to 60.0, 3L to 60.0, 4L to 60.0), mapOf<Long, Double?>(1L to 100.0, 2L to 100.0, 3L to 100.0, 4L to 100.0), kont,
        )
        assertEquals(listOf(FaktQatorHajm(1, 40.0), FaktQatorHajm(2, 20.0)), p.qatorlar)
        assertEquals(JurnalXato.FORMULA_XATO, p.xatolar[3]); assertEquals(JurnalXato.FORMULA_XATO, p.xatolar[4]); assertFalse(p.ok)
        val p2 = jurnalPaket(mapOf(1L to Kiritma(Rejim.Teng, "=FAKT-100"), 2L to Kiritma(Rejim.Plus, "=0")), mapOf(1L to 60.0, 2L to 60.0), mapOf<Long, Double?>(1L to 100.0, 2L to 100.0), mapOf(1L to kq, 2L to kq))
        assertEquals(JurnalXato.MANFIY, p2.xatolar[1]); assertEquals(JurnalXato.NOL, p2.xatolar[2])
        assertEquals(JurnalXato.FORMULA_XATO, jurnalPaket(mapOf(1L to Kiritma(Rejim.Teng, "=FAKT")), mapOf(1L to 60.0), mapOf<Long, Double?>(1L to 100.0)).xatolar[1])
        assertEquals(listOf(FaktQatorHajm(1, 10.0), FaktQatorHajm(2, 2.5)), jurnalPaket(mapOf(1L to Kiritma(Rejim.Teng, "70"), 2L to Kiritma(Rejim.Plus, "2,5")), mapOf(1L to 60.0, 2L to 60.0)).qatorlar)
    }

    // ----- fakt-jurnal.son.test.ts -----
    @Test fun numberNotations() {
        val cases = listOf(
            "12,35" to 12.35, "12.35" to 12.35, "1 234,5" to 1234.5, "1.234,5" to 1234.5, "1,234.5" to 1234.5, "1.234.567,5" to 1234567.5,
            "1,234,567" to 1234567.0, "1 234 567" to 1234567.0, "12 м2" to 12.0, "12,35 m²" to 12.35, "12,35м2" to 12.35, "  0,125  " to 0.125,
            "-3,5 кг" to -3.5, "7" to 7.0, "1'234,5" to 1234.5,
        )
        for ((k, v) in cases) assertEquals(k, v, sonOqi(k)!!, 0.0)
        assertNull(sonOqi("  "))
        for (x in listOf("abc", "1e-7", "12,5,5", "1,23.4.5", "12 $", "1.2.3")) assertTrue(x, sonOqi(x)!!.isNaN())
    }

    @Test fun ambiguousThousandsOrDecimalIsNotGuessed() {
        assertTrue(sonTahlil("1.234").noaniq); assertTrue(sonTahlil("1.234").son!!.isNaN()); assertTrue(sonTahlil("1,234 m2").noaniq)
        assertEquals(0.125, sonTahlil("0,125").son!!, 0.0); assertEquals(1234.567, sonTahlil("1234,567").son!!, 0.0)
        val p = jurnalPaket(
            mapOf(1L to Kiritma(Rejim.Plus, "1.234"), 2L to Kiritma(Rejim.Plus, "12,35 m²"), 3L to Kiritma(Rejim.Plus, "abc")),
            mapOf(1L to 0.0, 2L to 0.0, 3L to 0.0), mapOf<Long, Double?>(1L to 100.0, 2L to 100.0, 3L to 100.0),
        )
        assertEquals(JurnalXato.NOANIQ, p.xatolar[1]); assertEquals(JurnalXato.SON_EMAS, p.xatolar[3]); assertEquals(listOf(FaktQatorHajm(2, 12.35)), p.qatorlar)
    }

    // ----- formula/number-formula.test.ts -----
    private fun ok(r: FormulaResult, v: Double, formula: Boolean? = null) { assertTrue(r.toString(), r is FormulaResult.Ok); assertEquals(v, (r as FormulaResult.Ok).value, 0.0); if (formula != null) assertEquals(formula, r.formula) }
    private fun err(r: FormulaResult, e: FormulaError? = null) { assertTrue(r.toString(), r is FormulaResult.Err); if (e != null) assertEquals(e, (r as FormulaResult.Err).error) }

    @Test fun excelStyleFormula() {
        ok(numberFormula("12,5"), 12.5, false); ok(numberFormula("=(10+2)*3/4"), 9.0, true); ok(numberFormula("=0,5+.25"), 0.75); ok(numberFormula("=-(2+3)"), -5.0)
        ok(numberFormula("=FAKT+QOLDIQ*0.25", mapOf("FAKT" to 60.0, "QOLDIQ" to 40.0)), 70.0)
        ok(numberFormula("=smeta-fakt", mapOf("SMETA" to 100.0, "FAKT" to 60.0)), 40.0); ok(numberFormula("=F2_MUMKIN", mapOf("F2_MUMKIN" to 30.0)), 30.0)
    }

    @Test fun failsClosed() {
        err(numberFormula("=SMETA+1", mapOf("SMETA" to null)), FormulaError.MISSING_VALUE); err(numberFormula("=SMETA+1", emptyMap()), FormulaError.UNKNOWN_NAME)
        err(numberFormula("=10/0"), FormulaError.DIVIDE_BY_ZERO); err(numberFormula("=1/(2-2)"), FormulaError.DIVIDE_BY_ZERO)
        err(numberFormula("=")); err(numberFormula("=1+"), FormulaError.SYNTAX); err(numberFormula("=(1+2"), FormulaError.SYNTAX)
        val e = numberFormula(""); err(e); assertFalse(e.formula)
    }

    @Test fun rejectsCodeFunctionsAndPrototypeNames() {
        err(numberFormula("=window.alert(1)")); err(numberFormula("=SMETA.__proto__", mapOf("SMETA" to 1.0)))
        err(numberFormula("=constructor", mapOf("SMETA" to 1.0)), FormulaError.UNKNOWN_NAME); err(numberFormula("=__proto__", mapOf("SMETA" to 1.0)), FormulaError.UNKNOWN_NAME)
        err(numberFormula("=toString", emptyMap()), FormulaError.UNKNOWN_NAME); err(numberFormula("=SUM(1;2)")); err(numberFormula("=SMETA(1)", mapOf("SMETA" to 1.0)), FormulaError.UNKNOWN_NAME); err(numberFormula("=1;2"))
    }

    @Test fun tooLongOrDeep() {
        err(numberFormula("=" + "1+".repeat(200) + "1"), FormulaError.TOO_COMPLEX)
        err(numberFormula("=" + "(".repeat(30) + "1" + ")".repeat(30)), FormulaError.TOO_COMPLEX)
        assertTrue(formulaMi(" =1")); assertFalse(formulaMi("50%"))
    }

    @Test fun openRemainderAndScale() {
        assertEquals(60.0, ochiqQoldiq(QoldiqKirish(100.0, fakt = 40.0))!!, 0.0)
        assertEquals(50.0, ochiqQoldiq(QoldiqKirish(100.0, fakt = 20.0, almashtirilgan = 10.0, bajarilmaydi = 20.0))!!, 0.0)
        assertEquals(70.0, ochiqQoldiq(QoldiqKirish(100.0, f2 = 20.0, almashtirilgan = 10.0, bajarilmaydi = 99.0), QoldiqRejim.F2)!!, 0.0)
        assertEquals(-2.0, ochiqQoldiq(QoldiqKirish(-4.0, fakt = 0.0, almashtirilgan = 2.0))!!, 0.0)   // deduction row: closed volume in the smeta's sign
        assertNull(ochiqQoldiq(QoldiqKirish(null, fakt = 3.0)))
        assertEquals(50.0, hajmMasshtab(100.0, 0.5)!!, 0.0); assertNull(hajmMasshtab(null, 0.5))
        assertNotNull(jsNumberString(2.5))
    }
}
