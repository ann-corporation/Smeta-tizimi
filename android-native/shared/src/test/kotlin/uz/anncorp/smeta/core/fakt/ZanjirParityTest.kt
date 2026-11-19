package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PARITY with the website: lib/zanjir/qadamlar.test.ts rules (the 8-step chain) + lib/pto-markazi/oy.ts + lib/fakt-studio.ts faktYigindiHisobla. */
class ZanjirParityTest {
    private val t: (String, Map<String, Any>) -> String = { k, p -> p.entries.fold(k) { a, e -> a.replace("{${e.key}}", e.value.toString()) } }
    private fun kirish(smetaBor: Boolean? = true, narxsiz: Int? = 0, faktSaq: Int? = 1, faktQor: Int? = 0, f2Oyda: Boolean? = false, f2TasdOyda: Int? = 0, f2Jami: Int? = 0, oy: String = "2026-11") =
        ZanjirKirish(smetaBor, narxsiz, faktSaq, faktQor, f2Oyda, f2TasdOyda, f2Jami, null, null, null, null, oy)
    private fun akt(tur: String, holat: String, oy: String, life: String? = null) = MarkazAkt(tur, holat, life, oy, "2026-11-01", null, null)

    @Test fun unpricedSmetaIsTheCurrentStepAndBlocksNothingUnknown() {
        val n = zanjirHisobla(kirish(narxsiz = 3), t)
        assertEquals(QadamHolat.Current, n.qadamlar[0].holat); assertEquals("3 qator narxsiz", n.qadamlar[0].izoh); assertEquals("smeta", n.keyingi!!.id); assertEquals("Smetani narxlang", n.keyingi!!.amal)
    }

    @Test fun unknownIsNeverDone() {
        val n = zanjirHisobla(kirish(smetaBor = null, narxsiz = null, faktSaq = null, faktQor = null, f2Oyda = null, f2TasdOyda = null, f2Jami = null), t)
        assertTrue(n.qadamlar.take(4).all { it.holat == QadamHolat.Unknown }); assertTrue(!n.tugallandi); assertEquals(false, n.keyingi!!.aniq)
    }

    @Test fun draftFaktAndDraftF2() {
        val n = zanjirHisobla(kirish(faktSaq = 0, faktQor = 26, f2Oyda = true), t)
        assertEquals("26 ta fakt qoralamada", n.qadamlar[1].izoh); assertEquals("2026-11 F2 qoralamada — tasdiqlang", n.qadamlar[3].izoh)
        assertEquals("Avval F2 tasdiqlanishi kerak", n.qadamlar[7].izoh); assertEquals(QadamHolat.Blocked, n.qadamlar[7].holat)
    }

    @Test fun activityMonthAndActRegister() {
        val a = listOf(akt("fakt", "qoralama", "2026-10-15"), akt("f2", "tasdiqlangan", "2026-09-01"), akt("f2", "bekor", "2026-12-01"), akt("aosr", "x", "2027-01-01"))
        assertEquals("2026-10", faolOy(a)); assertNull(faolOy(null)); assertNull(faolOy(emptyList()))
        val m = markazHolati(a, "2026-10")
        assertEquals(1, m.faktQoralama); assertEquals(0, m.faktSaqlangan); assertEquals(1, m.f2Tasdiq); assertEquals(false, m.f2BuOyda); assertEquals("2026-09", m.f2OxirgiOy)
        assertNull(markazHolati(null, "2026-10").faktSaqlangan)
        assertEquals("tasdiqlangan", aktBosqich("yakunlangan", null)); assertEquals("bekor", aktBosqich("x", "cancelled")); assertEquals("jarayonda", aktBosqich("qoralama", "draft"))
    }

    @Test fun parsesTheActRegister() {
        val r = parseAktReestri(kotlinx.serialization.json.Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"qatorlar":[{"tur":"f2","holat":"qoralama","oy":"2026-11-01","yaratildi":"2026-11-02","hujjat_jami":5}]}}"""))!!
        assertEquals(1, r.size); assertEquals(5.0, r[0].hujjatJami!!, 0.0); assertNull(parseAktReestri(kotlinx.serialization.json.Json.parseToJsonElement("""{"ok":false}""")))
    }

    @Test fun yigindiCountsNewWorksAndNotDone() {
        fun q(id: Long, tur: String, ota: Long? = null, kat: String? = null, qosh: Boolean = false) = T2Qator(id = id, otaId = ota, tur = tur, nom = "n", kat = kat, qoshimcha = qosh)
        val rows = listOf(q(1, "rz"), q(10, "bl", 1, qosh = true), q(11, "mat", 10, "МАТ"), q(12, "mat", 1, "МАТ"))
        val st = listOf(JurnalHolat(11, smetaHajm = 5.0, faktHajm = 2.0, faktSumma = 200.0, smetaSumma = 500.0, smetaNarx = 100.0), JurnalHolat(12, smetaHajm = 5.0, faktHajm = 1.0, faktSumma = 100.0, smetaSumma = 500.0, smetaNarx = 100.0))
        val y = faktYigindiHisobla(rows, st, listOf(BajarilmadiYozuv(1, 12, 3.0, "texnik_sabab", "faol", null)))
        assertEquals(1, y.yangiSoni); assertEquals(300.0, y.faktUstamasiz, 0.0); assertEquals(200.0, y.yangiUstamasiz, 0.0)
        assertEquals(1, y.bajarilmadiSoni); assertEquals(300.0, y.bajarilmadiUstamasiz, 0.0); assertEquals(0, y.bajarilmadiNarxsiz)
    }
}
