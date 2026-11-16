package uz.anncorp.smeta.feature.m29

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.time.LocalDate

class M29ContractTest {
    private val op = "11111111-1111-4111-8111-111111111111"
    private fun line(n: String, q: String) = M29Line(n, "t", BigDecimal(q))

    @Test fun payloadMatchesWebCommand() {
        val p = m29Payload(17, 5, "2026-11", listOf(M29Line(" Sement ", "", BigDecimal("2.50")), line("Qum", "10")), op)
        assertEquals("m29_bajar_v1", p["amal"]!!.jsonPrimitive.content)
        assertEquals("2026-11", p["davr"]!!.jsonPrimitive.content)
        val q = p["qatorlar"]!!.jsonArray
        assertEquals("Sement", q[0].jsonObject["nomi"]!!.jsonPrimitive.content)
        assertEquals("null", q[0].jsonObject["birligi"]!!.toString())
        assertEquals("2.5", q[0].jsonObject["miqdor"]!!.jsonPrimitive.content)
        assertEquals(op, p["operation_id"]!!.jsonPrimitive.content)
        assertEquals("false", p["manfiyga_ruxsat"]!!.toString())
        assertEquals("false", p["trigger_bekor"]!!.toString())
    }

    @Test fun validation() {
        assertNull(validateM29(5, "2026-11", listOf(line("A", "1"))))
        assertEquals("obyekt", validateM29(null, "2026-11", listOf(line("A", "1"))))
        assertEquals("davr", validateM29(5, "2026-13", listOf(line("A", "1"))))
        assertEquals("qator", validateM29(5, "2026-11", emptyList()))
        assertEquals("nom", validateM29(5, "2026-11", listOf(line(" ", "1"))))
        assertEquals("miqdor", validateM29(5, "2026-11", listOf(line("A", "0"))))
        assertEquals("miqdor", validateM29(5, "2026-11", listOf(line("A", "-2"))))
    }

    @Test fun periodMath() {
        assertEquals("2026-11", currentPeriod(LocalDate.of(2026, 11, 16)))
        assertEquals("2027-01", shiftPeriod("2026-12", 1))
        assertEquals("2025-12", shiftPeriod("2026-01", -1))
        assertEquals("bad", shiftPeriod("bad", 1))
    }

    @Test fun roles() {
        assertTrue(canExecuteM29("prorab")); assertTrue(canExecuteM29("PTO")); assertFalse(canExecuteM29("omborchi")); assertFalse(canExecuteM29(null))
    }

    @Test fun parsesDocsAndFilters() {
        val rows = Json.parseToJsonElement("""[{"id":3,"obyekt_id":5,"davr":"2026-10","holat":"bajarildi","qator_soni":4,"trigger_bekor_soni":2,"manfiy_qoldiq":true,"bajarildi":"2026-11-02T10:00:00Z"},
            {"id":2,"obyekt_id":6,"davr":"2026-09","holat":"bekor"},{"obyekt_id":1}]""").let { (it as kotlinx.serialization.json.JsonArray).map { e -> e as JsonObject } }
        val d = parseM29Docs(rows)
        assertEquals(2, d.size)
        assertTrue(d[0].manfiyQoldiq); assertEquals(2, d[0].triggerBekor); assertNull(d[1].qatorSoni)
        assertEquals(listOf(3L), filterDocs(d, "active", null).map { it.id })
        assertEquals(listOf(2L), filterDocs(d, "cancelled", null).map { it.id })
        assertEquals(listOf(2L), filterDocs(d, "all", 6L).map { it.id })
    }

    @Test fun problemsAndFailInfo() {
        assertEquals(M29Problem.STOCK_SHORT, problemOf("QOLDIQ_YETMAYDI"))
        assertEquals(M29Problem.OTHER, problemOf("X"))
        val i = parseFailInfo("""{"kod":"QOLDIQ_YETMAYDI","yetmaydi":[{"nomi":"Sement","birligi":"t","kerak":5,"bor":-1.5}]}""")!!
        assertEquals("QOLDIQ_YETMAYDI", i.code)
        assertEquals(-1.5, i.shortages[0].bor!!, 0.0) // the minus keeps its sign
        assertNull(parseFailInfo(null))
    }

    @Test fun resubmitKeepsLinesAddsConsentAndNewOperation() {
        val old = m29Payload(17, 5, "2026-11", listOf(line("A", "2")), op).toString()
        val p = flaggedPayload(old, "22222222-2222-4222-8222-222222222222", allowNegative = true, cancelTrigger = false)!!
        assertEquals("22222222-2222-4222-8222-222222222222", p["operation_id"]!!.jsonPrimitive.content)
        assertEquals("true", p["manfiyga_ruxsat"]!!.toString()); assertEquals("false", p["trigger_bekor"]!!.toString())
        assertEquals(1, p["qatorlar"]!!.jsonArray.size)
        // consent already given stays given
        val again = flaggedPayload(p.toString(), "33333333-3333-4333-8333-333333333333", false, true)!!
        assertEquals("true", again["manfiyga_ruxsat"]!!.toString()); assertEquals("true", again["trigger_bekor"]!!.toString())
        assertNull(flaggedPayload("""{"amal":"fakt_yoz_v2"}""", op, true, true))
        assertNotNull(summarizeM29(old)); assertEquals(1, summarizeM29(old)!!.lineCount)
    }

    @Test fun cancelBody() {
        val p = m29CancelPayload(17, 9, "  xato  ")
        assertEquals("m29_bekor_v1", p["amal"]!!.jsonPrimitive.content); assertEquals("xato", p["sabab"]!!.jsonPrimitive.content)
    }
}
