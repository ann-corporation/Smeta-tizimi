package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult

/** PARITY with the website: fixtures of frontend/src/lib/fakt-qamrov-urinish.test.ts (JQA-04 / JQA-08 / JQA-09). */
class QamrovUrinishParityTest {
    private fun p(id: Long, h: Double) = FaktF2PaketQator(id, h)
    private val paket = listOf(listOf(p(1, 10.0), p(2, 5.0)), listOf(p(3, 1.0)))
    private var n = 0
    private fun yangiId() = "op-${++n}"
    private fun yarat() = urinishYarat(1, 8, "2026-10-25", "Ko‘l", 100.0, paket, ::yangiId)
    private fun asosli() = urinishYarat(1, 8, "2026-10-25", "Ko‘l", 100.0, paket, ::yangiId, faktOl = { id -> if (id == 1L) 2.0 else 0.0 })
    private fun ok(aktId: Long, takror: Boolean = false) = ApiResult(200, Json.parseToJsonElement("""{"ok":true,"akt_id":$aktId${if (takror) ""","takror":true""" else ""}}"""))
    private fun rad(json: String, status: Int = 400) = ApiResult(status, Json.parseToJsonElement(json))

    @Before fun reset() { n = 0; UrinishDokoni.tozala() }

    @Test fun snapshotIsFrozen() {
        val u = yarat()
        assertEquals(listOf("op-1", "op-2"), u.bolaklar.map { it.operationId }); assertEquals("Qamrov 100%: Ko‘l (1/2)", u.bolaklar[0].izoh); assertEquals(paket[0].map { it.qatorId to it.hajm }, u.bolaklar[0].qatorlar.map { it.qatorId to it.hajm })
        assertEquals(UrinishHolat.Kutmoqda, urinishHolati(u)); assertTrue(urinishOchiqmi(u))
        assertEquals("Qamrov 12.5%: X", urinishYarat(1, 8, "d", "X", 12.5, listOf(listOf(p(1, 1.0))), ::yangiId).bolaklar[0].izoh)
    }

    @Test fun answerClassification() {
        assertEquals(BolakHolat.Unknown, javobTasnifi(ApiResult(0, null)))
        assertEquals(BolakHolat.Unknown, javobTasnifi(rad("""{"ok":false,"error":"Server 90 soniyada javob bermadi — amal serverda bajarilgan bo‘lishi mumkin."}""", 408)))
        assertEquals(BolakHolat.Unknown, javobTasnifi(rad("""{"ok":false,"error":"Internet aloqasi uzildi — o‘zgarish serverga yetmadi."}""")))
        assertEquals(BolakHolat.Unknown, javobTasnifi(rad("""{"ok":false,"error":"HTTP 502: yozish so'rovi rad etildi"}""")))
        assertEquals(BolakHolat.Confirmed, javobTasnifi(ok(5, true)))
        assertEquals(BolakHolat.Failed, javobTasnifi(rad("""{"ok":false,"code":"FAKT_LINE_INVALID"}""")))
        assertEquals(BolakHolat.Failed, javobTasnifi(rad("""{"ok":false,"error":"qatorlar bo'sh"}""")))
    }

    @Test fun receiptsAndStatus() {
        var u = yarat()
        u = urinishReceipt(u, 0, ok(11)); u = urinishReceipt(u, 1, null)
        assertEquals(listOf(BolakHolat.Confirmed to 11L, BolakHolat.Unknown to null), u.bolaklar.map { it.holat to it.aktId })
        assertEquals(paket[1].map { it.qatorId }, u.bolaklar[1].qatorlar.map { it.qatorId }); assertEquals(UrinishHolat.Nomalum, urinishHolati(u))
        u = urinishReceipt(u, 1, rad("""{"ok":false,"code":"X"}""")); assertEquals(UrinishHolat.Xato, urinishHolati(u))
        u = urinishReceipt(u, 1, ok(12, true)); assertEquals(UrinishHolat.Toliq, urinishHolati(u)); assertFalse(urinishOchiqmi(u)); assertEquals(listOf(11L, 12L), urinishAktlari(u))
    }

    @Test fun registryKeepsTheAttempt() {
        val u = urinishReceipt(yarat(), 0, null); UrinishDokoni.urinishSaqla(u)
        assertEquals("op-1", UrinishDokoni.urinishOl(1, 8)!!.bolaklar[0].operationId); assertNull(UrinishDokoni.urinishOl(2, 8))
        UrinishDokoni.urinishOchir(1, 8); assertNull(UrinishDokoni.urinishOl(1, 8))
    }

    @Test fun confirmedPartIsNotForgotten() {
        var u = urinishReceipt(asosli(), 0, ok(7)); u = urinishReceipt(u, 1, rad("""{"ok":false,"code":"X"}"""))
        val y = yozilganYasa(u)!!
        assertEquals(listOf(7L), y.aktlar); assertEquals(listOf(Triple(1L, 12.0, 1), Triple(2L, 5.0, 1)), y.tekshir.map { Triple(it.qatorId, it.kutilgan, it.ishora) })
        assertNull(yozilganYasa(urinishReceipt(asosli(), 0, rad("""{"ok":false,"code":"X"}"""))))
    }

    @Test fun tableMustShowTheWrittenFaktBeforeANewPlan() {
        val y = yozilganYasa(urinishReceipt(urinishReceipt(asosli(), 0, ok(7)), 1, ok(8)))!!
        assertFalse(yozilganKorinadimi(y) { id -> mapOf(1L to 2.0, 2L to 0.0, 3L to 0.0)[id] })
        assertFalse(yozilganKorinadimi(y) { id -> mapOf(1L to 12.0, 2L to 5.0)[id] })
        assertTrue(yozilganKorinadimi(y) { id -> mapOf(1L to 12.0, 2L to 5.0, 3L to 1.0)[id] })
        UrinishDokoni.yozilganSaqla(y); assertEquals(listOf(7L, 8L), UrinishDokoni.yozilganOl(1, 8)!!.aktlar); UrinishDokoni.yozilganOchir(1, 8); assertNull(UrinishDokoni.yozilganOl(1, 8))
        assertNotNull(y)
    }
}
