package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: fixtures of frontend/src/lib/xotira-fakt/xotira-fakt.test.ts (lugat, parse, moslash, savat). */
class XotiraParityTest {
    @Test fun dictionaryAndTransliteration() {
        assertEquals("БЕТОН", sozniOgir("beton")); assertEquals("КИРПИЧ", sozniOgir("g'isht")); assertEquals("ДНО", sozniOgir("tubiga")); assertEquals("БЕТОН", sozniOgir("betonni"))
        assertEquals("ГЕОМЕМБРАНА", sozniOgir("geomembrana")); assertEquals("ЩЕБЕНЬ", sozniOgir("shcheben")); assertEquals("В25", sozniOgir("b25")); assertEquals("БЕТОН", sozniOgir("БЕТОН"))
        assertEquals(listOf("КАНАЛ", "ДНО", "БЕТОН"), xotiraSozlari("kanal tubiga beton")); assertEquals(listOf("УСТРОЙСТВО", "БЕТОНА"), xotiraSozlari("устройство для бетона"))
    }

    @Test fun russianWordFormsOfOneStem() {
        assertTrue(sozMos("ГЕОМЕМБРАНА", "ГЕОМЕМБРАНЫ")); assertTrue(sozMos("БЕТОН", "БЕТОНА")); assertTrue(sozMos("БЕТОН", "БЕТОННОЙ")); assertFalse(sozMos("ГРУНТ", "ГРАНИТ")); assertFalse(sozMos("В25", "В15"))
    }

    @Test fun textToLines() {
        val q = qatorlarniOqi("kanal tubiga beton 120 m3\ngeomembrana 3500 m2\n1. poydevor 50%\narmatura hammasi\n12,5 kg sim\nnoma'lum ish")
        assertEquals(
            listOf("kanal tubiga beton|Son|120.0|М3", "geomembrana|Son|3500.0|М2", "poydevor|Foiz|50.0|null", "armatura|Hammasi|null|null", "sim|Son|12.5|КГ", "noma'lum ish|Yoq|null|null"),
            q.map { "${it.nom}|${it.turi}|${it.qiymat}|${it.birlik}" },
        )
        assertEquals(Miqdor(MiqdorTuri.Son, 120.0).let { it.turi to it.qiymat }, miqdorOqi("120").let { it.turi to it.qiymat }); assertEquals(12.5, miqdorOqi("12,5").qiymat!!, 0.0)
        assertEquals(MiqdorTuri.Foiz, miqdorOqi("50%").turi); assertEquals(MiqdorTuri.Hammasi, miqdorOqi("qoldiq hammasi").turi); assertEquals(MiqdorTuri.Yoq, miqdorOqi("").turi)
        val b = birlikTahlil("100М3")!!; assertEquals(100.0, b.koef, 0.0); assertEquals("М3", b.baza)
    }

    // ---- synthetic estimate (same shape as the site test) ----
    private var nextId = 0L
    private val rows = ArrayList<T2Qator>()
    private val sums = HashMap<Long, Double>()
    private fun q(tur: String, nom: String, ota: Long? = null, kod: String? = null, birlik: String? = null, hajm: Double? = null, narx: Double? = null, summa: Double? = null, kat: String? = null): Long {
        val id = ++nextId; rows.add(T2Qator(id = id, otaId = ota, tur = tur, nom = nom, kod = kod, birlik = birlik, hajm = hajm, narx = narx, kat = kat)); if (summa != null) sums[id] = summa; return id
    }
    private val r0 = q("rz", "РАЗДЕЛ: КОНСТРУКТИВНАЯ ЧАСТЬ-ОЗЕРА")
    private val rz = q("rz", "ЗЕМЛЯНЫЕ РАБОТЫ", r0)
    private val grunt = q("bl", "РАЗРАБОТКА ГРУНТА ЭКСКАВАТОРАМИ", rz, "E1-1-1", "1000М3", 12.0)
    private val rk = q("rz", "КАНАЛ", r0)
    private val bp = q("bl", "УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ ПОД КАНАЛ", rk, "E6-1-24-4", "М3", 300.0)
    private val beton = q("mat", "БЕТОН ТЯЖЕЛЫЙ В7,5", bp, "12-575-1", "М3", 306.0, 500000.0, 153000000.0, "МАТ")
    private val rsIsh = q("rs", "ЗАТРАТЫ ТРУДА РАБОЧИХ", bp, null, "ЧЕЛ-Ч", 900.0, 20000.0, 18000000.0, "ЧЕЛ")
    private val rg = q("rz", "ГИДРОИЗОЛЯЦИЯ", r0)
    private val geo = q("bl", "УКЛАДКА ГЕОМЕМБРАНЫ HDPE", rg, "E11-2-1", "М2", 5000.0)
    private val geoMat = q("mat", "ГЕОМЕМБРАНА HDPE 1,5 ММ", geo, null, "М2", 5250.0, 40000.0, 210000000.0, "МАТ")
    private val okl = q("bl", "УСТРОЙСТВО ОКЛЕЕЧНОЙ ГИДРОИЗОЛЯЦИИ", rg, "E11-2-2", "М2", 800.0)
    private val podp = q("rz", "ПОДПОРНАЯ СТЕНА", r0)
    private val stena = q("bl", "УСТРОЙСТВО СТЕН ПОДПОРНЫХ ИЗ БЕТОНА В15", podp, null, "100М3", 40.0)
    private fun h(id: Long, smeta: Double, fakt: Double, f2: Double) = JurnalHolat(qatorId = id, smetaHajm = smeta, faktHajm = fakt, f2Hajm = f2)
    private val states = listOf(h(grunt, 12.0, 2.0, 1.0), h(bp, 300.0, 100.0, 80.0), h(geo, 5000.0, 0.0, 0.0), h(okl, 800.0, 800.0, 800.0), h(stena, 40.0, 0.0, 0.0))
    private val ind = xotiraIndeks(rows, states)
    private val summa: (Long) -> Double? = { sums[it] }

    @Test fun textMatchesTheEstimateRow() {
        val n = xotiraMosla(qatorlarniOqi("kanal tubiga beton 120 m3"), ind)[0]; val a = n.nomzodlar[0]
        assertEquals(bp, a.qatorId); assertTrue(a.yol.contains("КАНАЛ")); assertEquals(300.0, a.smetaHajm!!, 0.0); assertEquals(100.0, a.faktHajm, 0.0); assertEquals(80.0, a.f2Hajm, 0.0); assertEquals(200.0, a.qoldiq!!, 0.0)
        assertEquals(true, a.birlikMos); assertEquals(120.0, a.miqdor!!, 0.0); assertEquals(true, a.sigadi); assertTrue(n.holat == XotiraHolatTuri.Aniq || n.holat == XotiraHolatTuri.Taklif)
        val g = xotiraMosla(qatorlarniOqi("geomembrana 3500 m2"), ind)[0].nomzodlar[0]; assertEquals(geo, g.qatorId); assertEquals(5000.0, g.qoldiq!!, 0.0); assertEquals(true, g.sigadi)
        val s = xotiraMosla(qatorlarniOqi("tayanch devor beton b15 9000 m3"), ind)[0].nomzodlar.first { it.qatorId == stena }
        assertEquals(90.0, s.miqdor!!, 1e-9); assertEquals(false, s.sigadi)
        val none = xotiraMosla(qatorlarniOqi("samolyot dvigateli 2 dona"), ind)[0]; assertEquals(XotiraHolatTuri.Topilmadi, none.holat); assertEquals(0, none.nomzodlar.size)
    }

    @Test fun searchByNameCodeAndSection() {
        assertEquals(grunt, xotiraQidiruv(ind, "grunt")[0].qatorId); assertEquals(okl, xotiraQidiruv(ind, "E11-2-2")[0].qatorId)
        val gidro = xotiraQidiruv(ind, "gidroizolyatsiya"); assertTrue(gidro.map { it.qatorId }.contains(okl)); assertEquals(0.0, gidro.first { it.qatorId == okl }.qoldiq!!, 0.0); assertTrue(xotiraQidiruv(ind, "x").isEmpty())
    }

    private val mosBP get() = xotiraMosla(qatorlarniOqi("beton tayyorlash kanal 120 m3"), ind)[0].nomzodlar.first { it.qatorId == bp }

    @Test fun quantityKinds() {
        val n = mosBP
        assertEquals(120.0, hajmniHisobla(MiqdorTuri.Son, 120.0, n.qoldiq, n.miqdor)!!, 0.0); assertEquals(100.0, hajmniHisobla(MiqdorTuri.Foiz, 50.0, n.qoldiq, n.miqdor)!!, 0.0)
        assertEquals(200.0, hajmniHisobla(MiqdorTuri.Hammasi, null, n.qoldiq, n.miqdor)!!, 0.0); assertNull(hajmniHisobla(MiqdorTuri.Yoq, null, n.qoldiq, n.miqdor))
    }

    @Test fun basketGroupsResourcesAndFollowsTheWork() {
        var s = savatgaQosh(emptyList(), rows, mosBP, 120.0, "matn", summa)
        assertEquals(listOf(bp to 120.0, beton to 122.4), s.map { it.qatorId to it.hajm }); assertEquals(listOf(null, bp), s.map { it.guruh })
        s = savatHajmi(s, rows, bp, 150.0); assertEquals(153.0, s.first { it.qatorId == beton }.hajm, 0.0)
        s = savatHajmi(s, rows, beton, 160.0); s = savatHajmi(s, rows, bp, 100.0)
        assertEquals(160.0, s.first { it.qatorId == beton }.hajm, 0.0)
        assertEquals(listOf(bp to 100.0, beton to 160.0), savatPaketi(s).map { it.qatorId to it.hajm }); assertTrue(savatdanOlish(s, bp).isEmpty())
    }

    @Test fun sameRowTwiceSumsAndOvershootIsAMark() {
        var s = savatgaQosh(emptyList(), rows, mosBP, 120.0, "matn", summa); s = savatgaQosh(s, rows, mosBP, 100.0, "qidiruv", summa)
        val x = s.first { it.qatorId == bp }; assertEquals(220.0, x.hajm, 0.0); assertTrue(x.oshdi)
    }

    @Test fun totalsByResourcesAndMarkup() {
        val s = savatgaQosh(emptyList(), rows, mosBP, 100.0, "matn", summa)
        assertEquals((153000000.0 + 18000000.0) / 300, birlikKatSummalari(rows, bp, summa).narx!!, 1e-6)
        val nk = mapOf("ПРОЧИЕ_ПОДРЯДЧИК" to 18.0, "СТРАХОВАНИЕ" to 0.32, "РИСК" to 0.0, "НДС" to 12.0, "ТРАНСПОРТ_МАТЕРИАЛ" to 0.0, "СКЛАДСКИЕ_МАТЕРИАЛ" to 0.0, "СКЛАДСКИЕ_МК" to 0.0, "ТРАНСПОРТ_КАБЕЛЬ" to 0.0, "ТРАНСПОРТ_ОБОРУД" to 0.0, "ЗАГОТ_СКЛАД_ОБОРУД" to 0.0)
        val j0 = savatJami(s, null); assertEquals((153000000.0 + 18000000.0) / 3, j0.asos, 1.0); assertNull(j0.ustamali)
        val j = savatJami(s, nk); assertNotNull(j.ustamali); assertTrue(j.ustamali!! > j.asos); assertEquals(0, j.narxsiz)
        assertEquals("120", miqdorBoshlang(qatorlarniOqi("beton 120 m3")[0])); assertEquals("50%", miqdorBoshlang(qatorlarniOqi("poydevor 50%")[0]))
        assertEquals(60.0, nomzodHajmi(qatorlarniOqi("beton 120 m3")[0], mosBP, "60")!!, 0.0)
    }
}