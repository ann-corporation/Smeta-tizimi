package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str

class OmborSkladTest {
    private fun j(s: String) = Json.parseToJsonElement(s)
    private val wh = { id: Long -> Warehouse(id, "W$id") }

    @Test fun warehouseChoiceFollowsTheSite() {
        assertEquals(null, pickWarehouse(emptyList(), false, null))
        assertEquals(5L, pickWarehouse(listOf(wh(5)), false, null))            // one warehouse -> itself
        assertEquals(null, pickWarehouse(listOf(wh(5), wh(6)), false, null))   // several -> «Barcha omborlar», never a silent first
        assertEquals(6L, pickWarehouse(listOf(wh(5), wh(6)), false, 6))        // remembered while it exists
        assertEquals(null, pickWarehouse(listOf(wh(5), wh(6)), true, 6))
        assertEquals(null, pickWarehouse(listOf(wh(5), wh(6)), false, 9))
    }

    @Test fun summaryCountsNegativeAndZeroAndLatest() {
        val s = skladSummary(listOf(SkladRow(1, 3.0, "2026-11-10T00:00:00Z"), SkladRow(1, -2.0, "2026-11-12T00:00:00Z"), SkladRow(2, 0.0, null), SkladRow(2, null, "2026-10-01")))
        assertEquals(SkladSummary(4, 1, 1, "2026-11-12T00:00:00Z"), s)
        assertEquals(SkladSummary(0, 0, 0, null), skladSummary(emptyList()))
        val rows = parseSkladRows(listOf(j("""{"obyekt_id":7,"qoldiq":0,"oxirgi_harakat":"2026-11-01"}""") as JsonObject))
        assertEquals(1, rows.size); assertEquals(0, skladSummary(rows).negative)
    }

    @Test fun priceConversionMatchesTheSiteRounding() {
        assertEquals(1383928.57, priceNet(1550000.0, PriceMode.WITH)!!, 0.0)   // 1 550 000 with QQS = 1 383 928,57 without
        assertEquals(100.0, priceNet(100.0, PriceMode.WITHOUT)!!, 0.0)
        assertNull(priceNet(0.0, PriceMode.WITH)); assertNull(priceNet(null, PriceMode.WITH)); assertNull(priceNet(-5.0, PriceMode.WITHOUT))
        assertEquals(112.0, priceGross(100.0)!!, 0.0); assertNull(priceGross(null))
    }

    @Test fun suggestionsParse() {
        val r = parseSuggestResult(j("""{"ok":true,"qqs_foiz":12,"takliflar":[{"nomi":"Sement","birligi":"qop","miqdor_median":10,"narx_oxirgi":50000,"narx_oxirgi_qqs":56000,"kontragent":"Ali","qoldiq":4}],"kontragentlar":[{"nomi":"Ali","materiallar":[]}]}"""))!!
        assertEquals(1, r.items.size); assertEquals(56000.0, r.items[0].priceLastGross!!, 0.0); assertEquals("Ali", r.suppliers[0].name); assertEquals(12.0, r.vat, 0.0)
        assertNull(parseSuggestResult(j("""{"ok":false}""")))
        val b = suggestRequest(8, 3, " sem ", "chiqim", "Ali"); assertEquals("chiqim", b["tur"].str()); assertEquals("Ali", b["yetkazuvchi"].str()); assertEquals(6.0, b["limit"].num()!!, 0.0)
    }

    @Test fun writeBodyAndChecks() {
        val b = yozBody(8, 3, KirimInput("prixod", " Sement ", "qop", "10", "50000", PriceMode.WITH, "2026-11-19", "Ali", "op-1"))
        assertEquals("yoz", b["amal"].str()); assertEquals("prixod", b["operatsiya"].str()); assertEquals("Sement", b["nomi"].str()); assertEquals("bilan", b["narx_rejim"].str()); assertEquals("op-1", b["operation_id"].str())
        val c = yozBody(8, 3, KirimInput("chiqim", "Mix", "kg", "2", "99", PriceMode.WITH, "2026-11-19", null, "op-2"))
        assertNull(c["narx"]); assertNull(c["kontragent"])                      // a price never goes with a chiqim
        assertEquals(KirimIssue.REQUIRED, checkKirim("", "qop", "1", "")); assertEquals(KirimIssue.REQUIRED, checkKirim("a", "qop", "0", "")); assertEquals(KirimIssue.PRICE, checkKirim("a", "qop", "1", "-3"))
        assertNull(checkKirim("a", "qop", "1,5", "1 200")); assertNull(checkKirim("a", "qop", "1", ""))
        assertNull(omborCode(ApiResult(200, j("""{"ok":true,"harakat_id":4}"""))))
        assertEquals("QOLDIQ_YETMAYDI", omborCode(ApiResult(409, j("""{"ok":false,"code":"QOLDIQ_YETMAYDI"}"""))))
        assertEquals("NETWORK", omborCode(ApiResult(0, null)))
    }

    @Test fun berdimQuantityAndIdempotency() {
        assertEquals("2.5", berdimQty("2,5")!!.toPlainString()); assertNull(berdimQty("0")); assertNull(berdimQty("-1")); assertNull(berdimQty("abc")); assertNull(berdimQty(""))
        var n = 0; val op = BerdimOp { "id${++n}" }
        val a = op.idFor(8, 3, 101, "Sement", "qop", "2", "2026-11-19", "Ali"); val b = op.idFor(8, 3, 101, "Sement", "qop", "2", "2026-11-19", " Ali ")
        assertEquals(a, b)                                                       // same data = same id: a second tap cannot write twice
        assertTrue(op.idFor(8, 3, 101, "Sement", "qop", "3", "2026-11-19", "Ali") != a)   // changed data = new id
        op.done(); assertTrue(op.idFor(8, 3, 101, "Sement", "qop", "3", "2026-11-19", "Ali") != a)
    }
}
