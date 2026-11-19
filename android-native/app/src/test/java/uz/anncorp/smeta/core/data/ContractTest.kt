package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Parses fixtures shaped like the web tests' fixtures (sb rows, column-oriented object packet, FaktNatija). */
class ContractTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(name: String) = checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/$name")) { name }.bufferedReader().readText()

    @Test fun sbObjectsRows() {
        val sb = parseSb(json.parseToJsonElement(res("objects.json")))!!
        assertTrue(sb.complete)
        val objs = parseObjects(sb.rows, 1)
        assertEquals(13, objs.size) // 4 original demo objects + 9 for the Loyiha > Shartnoma > Obyekt hierarchy demo
        assertEquals(1232381500.0, objs[0].jami!!, 0.0)
        assertEquals(null, objs[2].jami)             // NULL stays unknown, never 0
        assertEquals(233, objs[2].narxsiz)
        assertEquals(1L, objs[0].companyId)
    }

    @Test fun sbRejectsNotOkAndWrongShape() {
        assertNull(parseSb(json.parseToJsonElement("""{"ok":false,"error":"x"}""")))
        assertNull(parseSb(json.parseToJsonElement("""{"ok":true}""")))
        assertNull(parseSb(json.parseToJsonElement("""[1,2]""")))
        assertFalse(parseSb(json.parseToJsonElement("""{"ok":true,"qatorlar":[],"toliq":false}"""))!!.complete)
    }

    @Test fun numericStringsFromPostgres() {
        val rows = parseSb(json.parseToJsonElement("""{"ok":true,"qatorlar":[{"qator_id":"7","tur":"bl","nom":"X","fakt_hajm":"1.5","fakt_summa":null,"smeta_hajm":"10"}]}"""))!!.rows
        val q = parseHolatRows(5, rows).single()
        assertEquals(7L, q.qatorId); assertEquals(1.5, q.faktHajm, 0.0); assertEquals(0.0, q.faktSumma, 0.0); assertEquals(8.5, q.qoldiq!!, 1e-9)
    }

    @Test fun holatRowsKeepOnlyWorkRows() {
        val rows = parseSb(json.parseToJsonElement("""{"ok":true,"qatorlar":[{"qator_id":1,"tur":"rz","nom":"R"},{"qator_id":2,"tur":"bl","nom":"B"},{"qator_id":3,"nom":"no tur"}]}"""))!!.rows
        assertEquals(listOf(2L, 3L), parseHolatRows(9, rows).map { it.qatorId })
    }

    @Test fun packetDecodesWorkRows() {
        val p = parsePaket(json.parseToJsonElement(res("paket.json")))!!
        assertEquals(101L, p.obyektId)
        assertEquals(8, p.rows.size)                 // 10 packet rows, 2 are sections (rz)
        val r = p.rows.first { it.qatorId == 1003L }
        assertEquals("311-02", r.kod); assertEquals("т", r.birlik); assertEquals(35.8, r.smetaHajm!!, 0.0)
        assertEquals(36.1, r.faktHajm, 0.0); assertEquals(-0.3, r.qoldiq!!, 1e-9)   // over the estimate -> negative remainder
        assertNull(p.rows.first { it.qatorId == 1005L }.narx)                       // unpriced stays null
    }

    @Test fun packetSmetaVolumeOverrideAndReplaced() {
        val o = json.parseToJsonElement(res("paket.json")).jsonObject
        val h = o["h"]!!.jsonObject
        val patched = JsonObject(o + ("h" to JsonObject(h + ("smeta_hajm" to json.parseToJsonElement("""{"1002":100}""")) + ("almashtirilgan_hajm" to json.parseToJsonElement("""{"1002":10}""")))))
        val r = parsePaket(patched)!!.rows.first { it.qatorId == 1002L }
        assertEquals(100.0, r.smetaHajm!!, 0.0)
        assertEquals(100.0 - 40.25 - 10.0, r.qoldiq!!, 1e-9)
    }

    @Test fun packetBadShapeIsNullNotHalfData() {
        assertNull(parsePaket(json.parseToJsonElement("""{"format":"other"}""")))
        val o = json.parseToJsonElement(res("paket.json")).jsonObject
        assertNull(parsePaket(JsonObject(o + ("soni" to json.parseToJsonElement("11")))))
    }

    @Test fun totalsFromRows() {
        val t = computeTotals(parsePaket(json.parseToJsonElement(res("paket.json")))!!.rows)
        assertEquals(1232381500.0, t.smeta!!, 0.0)
        assertEquals(525127000.0, t.fakt!!, 0.0)
        assertEquals(302500000.0, t.f2!!, 0.0)
        assertEquals(1, t.unpriced)
        assertEquals("42,6%", formatPercent(t.faktPercent))
        assertEquals(null, computeTotals(emptyList()).smeta)
    }

    @Test fun faktPayloadShape() {
        val p = faktPayload(AMAL_FAKT, 17, 5, "2026-11-12", listOf(FaktLine(301, 1.5), FaktLine(302, 2.0)), "00000000-0000-4000-8000-000000000009")
        assertEquals("fakt_yoz_v2", p["amal"].str()); assertEquals(5.0, p["obyekt_id"].num()!!, 0.0); assertEquals("2026-11-12", p["sana"].str())
        assertEquals("00000000-0000-4000-8000-000000000009", p["operation_id"].str())
        assertEquals(2, p["qatorlar"].arr()!!.size)
        assertEquals(302.0, p["qatorlar"].arr()!![1].obj()!!["qator_id"].num()!!, 0.0)
        assertEquals(listOf(FaktLine(301, 1.5), FaktLine(302, 2.0)), parseFaktPayload(p.toString()))
        // The server's UUID rule (version nibble 1-5, variant 8-b) accepts the ids we generate.
        val re = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
        assertTrue(re.matches(java.util.UUID.randomUUID().toString()))
    }

    @Test fun faktResultWarnings() {
        val fr = parseFaktResult(json.parseToJsonElement(res("fakt_ok.json")))!!
        assertTrue(fr.ok); assertEquals("F20261115-01", fr.raqam); assertEquals(1234567.89, fr.jami!!, 0.0)
        assertEquals(1, fr.over.size); assertEquals(35.8, fr.over[0].chegara!!, 0.0)
        assertEquals(1, fr.unpricedCount); assertTrue(fr.hasWarnings); assertFalse(fr.replay)
    }

    @Test fun faktResultError() {
        val fr = parseFaktResult(json.parseToJsonElement("""{"ok":false,"error":"qatorlar bo'sh"}"""))!!
        assertFalse(fr.ok); assertEquals("qatorlar bo'sh", fr.error); assertFalse(fr.hasWarnings)
        assertNotNull(parseFaktResult(json.parseToJsonElement("""{"ok":true,"takror":true}""")))
        assertTrue(parseFaktResult(json.parseToJsonElement("""{"ok":true,"takror":true}"""))!!.replay)
    }

    @Test fun requestsTargetAllowListedTables() {
        assertEquals("kompaniya_id=eq.17", objectsRequest(17)["filtr"].str())
        assertEquals("t2_obyekt_jami", objectsRequest(17)["jadval"].str())
        assertEquals("obyekt_id=eq.5&tur=eq.bl", holatRequest(5)["filtr"].str())
    }
}
