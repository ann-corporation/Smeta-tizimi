package uz.anncorp.smeta.feature.ombor

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.DrainResult
import uz.anncorp.smeta.core.data.FakeOutboxDao
import uz.anncorp.smeta.core.data.OutboxProcessor
import uz.anncorp.smeta.core.data.SendVerdict
import uz.anncorp.smeta.core.data.judge
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import java.math.BigDecimal

class OmborContractTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun obj(s: String) = json.parseToJsonElement(s).jsonObject

    @Test fun quantityAcceptsCommaAndDotAndGrouping() {
        assertEquals(BigDecimal("12.5"), parseQuantity("12,5"))
        assertEquals(BigDecimal("12.5"), parseQuantity("12.5"))
        assertEquals(BigDecimal("1234.5"), parseQuantity("1 234,5"))
        assertEquals(BigDecimal("1234"), parseQuantity("1 234"))
        assertEquals(BigDecimal("0.5"), parseQuantity(",5"))
        assertEquals(BigDecimal("0.123456"), parseQuantity("0,123456"))
    }

    @Test fun quantityRejectsAmbiguousOrNonPositive() {
        for (bad in listOf("", " ", "0", "0,0", "-1", "+1", "1,234.5", "1.2.3", "1e3", "abc", "12,", ".", "0,1234567", "١٢"))
            assertNull("«$bad» must be rejected", parseQuantity(bad))
    }

    @Test fun wireFormIsPlainDecimal() {
        assertEquals("12.5", parseQuantity("12,50")!!.wire())
        assertEquals("10", parseQuantity("10")!!.wire())
        assertEquals("100", parseQuantity("100,000")!!.wire())   // never «1E+2»
        assertEquals("0.000001", parseQuantity("0,000001")!!.wire())
    }

    @Test fun displayFormat() {
        assertEquals("1 234,5", formatQty(1234.5))
        assertEquals("240", formatQty(240.0))
        assertEquals("—", formatQty(null))
        assertEquals("-3", formatQty(-3.0))
    }

    @Test fun searchMatchesBothScriptsAndAllTokens() {
        assertTrue(matchesQuery("Цемент М400 (мешок 50 кг)", "sement"))
        assertTrue(matchesQuery("Цемент М400 (мешок 50 кг)", "цемент 400"))
        assertTrue(matchesQuery("Sement M400", "цемент"))
        assertTrue(matchesQuery("Qum yuvilgan", ""))
        assertFalse(matchesQuery("Qum yuvilgan", "sement"))
        assertFalse(matchesQuery("Цемент М400", "sement armatura"))
        assertTrue(matchesQuery("O'rta qum", "orta"))
    }

    @Test fun scanOnlyFillsSearch() {
        assertEquals("4780001234567", scanToQuery(" 4780001234567\n"))
        assertEquals("a b", scanToQuery("a \u0000  b"))
        assertEquals(60, scanToQuery("x".repeat(200)).length)
    }

    @Test fun roleGating() {
        assertEquals(OmborAccess(true, true), OmborAccess.forRole("prorab"))
        assertEquals(OmborAccess(true, true), OmborAccess.forRole("PTO"))
        assertEquals(OmborAccess(true, true), OmborAccess.forRole("admin"))
        // omborchi has warehouse.write; the server accepts warehouse.write OR document.write for both write commands
        assertEquals(OmborAccess(true, true), OmborAccess.forRole("omborchi"))
        // read-only roles
        assertEquals(OmborAccess(true, false), OmborAccess.forRole("rahbar"))
        assertEquals(OmborAccess(true, false), OmborAccess.forRole("taminotchi"))
        for (r in listOf("usta", "brigadir", "haydovchi", "inspektor", "kadr", "buyurtmachi", "", "xyz")) assertEquals(OmborAccess.None, OmborAccess.forRole(r))
        assertEquals(OmborAccess.None, OmborAccess.forRole(null))
    }

    @Test fun mapsObjectStockAndHidesZero() {
        val rows = parseObjectStock(listOf(
            obj("""{"obyekt_id":101,"nomi":"Sement","birligi":"qop","qoldiq":"240.5","oxirgi_harakat":"2026-11-13T09:30:00.123+00:00"}"""),
            obj("""{"obyekt_id":101,"nomi":"Nol","birligi":"t","qoldiq":0}"""),
            obj("""{"obyekt_id":102,"nomi":"Noma'lum","birligi":"t","qoldiq":null}"""),
            obj("""{"obyekt_id":102,"nomi":"  ","birligi":"t","qoldiq":5}"""),
            obj("""{"obyekt_id":103,"nomi":"Minus","birligi":"m","qoldiq":-2}"""),
        ))
        assertEquals(listOf("Sement", "Noma'lum", "Minus"), rows.map { it.nomi })
        assertEquals(240.5, rows[0].qoldiq!!, 0.0)
        assertNull(rows[1].qoldiq)   // unknown stays unknown, never 0
        assertEquals("13.11.2026", formatMovement(rows[0].oxirgi))
        assertNull(formatMovement(null)); assertNull(formatMovement("garbage"))
        assertEquals("05.01.2026", formatMovement("2026-01-05"))
    }

    @Test fun mapsCentralStockAndWarehouses() {
        val rows = parseCentralStock(json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"qatorlar":[{"nomi":"A","birligi":"t","qoldiq":3},{"birligi":"x"}]}}"""))
        assertEquals(1, rows!!.size); assertEquals(3.0, rows[0].qoldiq!!, 0.0); assertNull(rows[0].obyektId)
        assertNull(parseCentralStock(json.parseToJsonElement("""{"ok":true,"natija":{"ok":false,"code":"WAREHOUSE_SCOPE_MISMATCH"}}""")))
        assertNull(parseCentralStock(json.parseToJsonElement("""{"ok":false}""")))
        assertEquals(listOf(Warehouse(7, "Markaz", null)), parseWarehouses(listOf(obj("""{"id":7,"nomi":"Markaz"}"""), obj("""{"nomi":"id yo'q"}"""))))
    }

    @Test fun readRequests() {
        assertEquals("kompaniya_id=eq.5", objectStockRequest(5)["filtr"]!!.jsonPrimitive.content)
        assertEquals("t2_sklad_qoldiq", objectStockRequest(5)["jadval"]!!.jsonPrimitive.content)
        assertEquals("sklad_markaziy_qoldiq_v1", centralStockRequest(5, 7)["soro"]!!.jsonPrimitive.content)
        assertEquals("7", centralStockRequest(5, 7)["sklad_id"]!!.jsonPrimitive.content)
    }

    @Test fun scopeFilterAndOrder() {
        val rows = listOf(StockRow(1, "Zirh", "t", 1.0), StockRow(2, "Armatura", "t", 2.0), StockRow(1, "Armatura", "t", 3.0))
        assertEquals(listOf(1L, 2L), filterStock(rows, OmborScope.AllObjects, "armatura").map { it.obyektId })
        assertEquals(listOf("Armatura", "Zirh"), filterStock(rows, OmborScope.Obyekt(1, "A"), "").map { it.nomi })
    }

    @Test fun receivePayloadMatchesWebShape() {
        val p = receivePayload(5, 101, " Sement ", "qop", BigDecimal("12.50"), "2026-11-15", "  ", "hujjat 7", "op-1")
        assertEquals("skladga_yozish", p["amal"]!!.jsonPrimitive.content)
        assertEquals("prixod", p["operatsiya"]!!.jsonPrimitive.content)
        assertEquals("Sement", p["nomi"]!!.jsonPrimitive.content)
        assertEquals("12.5", p["obyomi"]!!.jsonPrimitive.content)
        assertFalse(p.containsKey("postavshik"))   // blank optional -> omitted, not ""
        assertEquals("op-1", p["operation_id"]!!.jsonPrimitive.content)
    }

    @Test fun issueAndTransferPayloads() {
        val i = issueFromObjectPayload(5, 101, "Sement", "qop", BigDecimal("3"), "2026-11-15", "Karim", "usta", null, "op-2")
        assertEquals("rasxod", i["operatsiya"]!!.jsonPrimitive.content)
        assertEquals("usta", i["qabul_turi"]!!.jsonPrimitive.content)
        assertFalse(issueFromObjectPayload(5, 101, "S", "q", BigDecimal.ONE, "2026-11-15", null, "hacker", null, "o").containsKey("qabul_turi"))
        val t = transferPayload(5, 7, 101, "Sement", "qop", BigDecimal("100.000"), "2026-11-15", null, null, "op-3")
        assertEquals("sklad_berdim_v1", t["amal"]!!.jsonPrimitive.content)
        assertEquals("100", t["miqdor"]!!.jsonPrimitive.content)   // string, dot, no exponent: the gateway's regex
        assertTrue(Regex("^[0-9]+(\\.[0-9]{1,6})?$").matches(t["miqdor"]!!.jsonPrimitive.content))
        assertTrue(t["miqdor"]!!.jsonPrimitive.isString)
    }

    @Test fun validation() {
        val s = OmborScope.Obyekt(1, "A"); val c = OmborScope.Central(7, "M")
        assertTrue(validateEntry(OmborOp.RECEIVE, "S", "q", "1,5", "2026-11-15", null, 101).isEmpty())
        assertEquals(listOf(EntryError.TARGET), validateEntry(OmborOp.RECEIVE, "S", "q", "1", "2026-11-15", null, null))
        assertEquals(
            listOf(EntryError.NAME, EntryError.UNIT, EntryError.QUANTITY, EntryError.DATE, EntryError.SOURCE),
            validateEntry(OmborOp.ISSUE, "", " ", "0", "15.11.2026", OmborScope.AllObjects, null),
        )
        assertTrue(validateEntry(OmborOp.ISSUE, "S", "q", "1", "2026-11-15", s, null).isEmpty())          // object -> person: no target object
        assertEquals(listOf(EntryError.TARGET), validateEntry(OmborOp.ISSUE, "S", "q", "1", "2026-11-15", c, null))
        assertTrue(validateEntry(OmborOp.ISSUE, "S", "q", "1", "2026-11-15", c, 101).isEmpty())
        assertEquals(listOf(EntryError.DATE), validateEntry(OmborOp.RECEIVE, "S", "q", "1", "2026-02-30", null, 1))
    }

    @Test fun overStockIsOnlyAWarning() {
        assertTrue(exceedsStock(BigDecimal("5"), 4.0)); assertFalse(exceedsStock(BigDecimal("4"), 4.0)); assertFalse(exceedsStock(BigDecimal("5"), null))
    }

    // ----- outbox kind -----

    @Test fun outboxKinds() {
        assertTrue(isOmborKind(AMAL_OMBOR_OBYEKT)); assertTrue(isOmborKind(AMAL_OMBOR_BERDIM)); assertFalse(isOmborKind("fakt_yoz_v2"))
    }

    @Test fun summaryReadsBackFromPayload() {
        val r = summarizePayload(receivePayload(5, 1, "Sement", "qop", BigDecimal("12.5"), "2026-11-15", null, null, "o").toString())!!
        assertEquals(OmborSummary("prixod", "Sement", "12.5", "qop"), r)
        assertEquals("rasxod", summarizePayload(issueFromObjectPayload(5, 1, "S", "q", BigDecimal.ONE, "2026-11-15", null, null, null, "o").toString())!!.op)
        assertEquals(OmborSummary("berdim", "S", "7", "q"), summarizePayload(transferPayload(5, 7, 1, "S", "q", BigDecimal("7"), "2026-11-15", null, null, "o").toString()))
        assertNull(summarizePayload("""{"amal":"fakt_yoz_v2"}""")); assertNull(summarizePayload("not json"))
    }

    private fun entry(kind: String, payload: JsonObject, id: String, t: Long) =
        OutboxEntity(id, kind, payload.toString(), 1, "Obj", 1, OutboxState.PENDING, 0, null, null, System.currentTimeMillis() + t)

    @Test fun queuedThroughSharedOutboxAndIdempotent() = runBlocking {
        val dao = FakeOutboxDao()
        val id = "11111111-1111-4111-8111-111111111111"
        val e = entry(AMAL_OMBOR_OBYEKT, receivePayload(5, 1, "S", "q", BigDecimal.ONE, "2026-11-15", null, null, id), id, 1)
        assertTrue(dao.insertIgnore(e) != -1L)
        assertEquals(-1L, dao.insertIgnore(e))   // double tap with the same operation id creates nothing
        val sent = mutableListOf<String>()
        val res = OutboxProcessor(dao, { x -> sent += x.payloadJson; ApiResult(200, json.parseToJsonElement("""{"ok":true,"takror":false}""")) }, json).drain()
        assertEquals(DrainResult.IDLE, res)
        assertEquals(1, sent.size)
        assertEquals(id, obj(sent[0])["operation_id"]!!.jsonPrimitive.content)
        assertEquals(OutboxState.DONE, dao.get(id)!!.state)
    }

    @Test fun serverRejectionOfWarehouseWriteStaysVisible() = runBlocking {
        val dao = FakeOutboxDao(); val id = "22222222-2222-4222-8222-222222222222"
        dao.insertIgnore(entry(AMAL_OMBOR_BERDIM, transferPayload(5, 7, 1, "S", "q", BigDecimal.TEN, "2026-11-15", null, null, id), id, 1))
        val rejected = ApiResult(200, json.parseToJsonElement("""{"ok":false,"code":"QOLDIQ_YETMAYDI","qoldiq":3}"""), "QOLDIQ_YETMAYDI")
        assertEquals(SendVerdict.REJECTED, judge(rejected))
        OutboxProcessor(dao, { rejected }, json).drain()
        val e = dao.get(id)!!
        assertEquals(OutboxState.FAILED, e.state); assertNotNull(e.lastError)
    }
}
