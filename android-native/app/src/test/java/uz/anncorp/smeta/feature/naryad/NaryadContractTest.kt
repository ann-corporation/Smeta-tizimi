package uz.anncorp.smeta.feature.naryad

import kotlinx.serialization.json.Json
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

class NaryadContractTest {
    private val list = Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"naryadlar":[
        {"id":5,"obyekt_id":1,"raqam":"N-5","usta_nom":"Aziz","holat":"berildi","versiya":3,"qator_soni":2,"reja_summa":"1500000.50","narxsiz_soni":1,"xarajat_summa":null},
        {"id":4,"obyekt_id":2,"raqam":"N-4","usta_nom":"Bobur","brigada":"B1","holat":"hisoblandi","versiya":9,"qator_soni":1,"xarajat_summa":-200000,"fakt_holat":"yozildi"},{"raqam":"x"}]}}""")
    private val one = Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"naryad":{"id":5,"obyekt_id":1,"obyekt_nom":"Korpus A","raqam":"N-5","holat":"bajarildi","versiya":3,"usta_nom":"Aziz","fakt_operation_id":"x",
        "qatorlar":[{"id":11,"qator_id":301,"nom":"Beton","birlik":"m3","hajm":"100","bajarilgan_hajm":40,"qabul_hajm":30,"usta_birlik":"kvadrat","koef":"10","usta_narx_birlik":"45000"},
                    {"id":12,"nom":"Armatura","birlik":"t","hajm":2,"usta_narx":null}]}}}""")

    @Test fun listKeepsNullMoneyAndSign() {
        val r = parseNaryadList(list)!!
        assertEquals(2, r.size)
        assertEquals(1500000.5, r[0].rejaSumma!!, 0.0); assertNull(r[0].xarajatSumma); assertEquals(1, r[0].narxsizSoni)
        assertEquals(-200000.0, r[1].xarajatSumma!!, 0.0); assertTrue(r[1].faktYozildi); assertEquals("B1", r[1].brigada)
        assertNull(parseNaryadList(Json.parseToJsonElement("""{"ok":false}""")))
    }

    @Test fun groupsFilterAndCounts() {
        val r = parseNaryadList(list)!!
        assertEquals(NaryadGroup.OPEN, naryadGroup("bajarildi")); assertEquals(NaryadGroup.PAID, naryadGroup("hisoblandi"))
        assertEquals(listOf(5L), filterNaryad(r, NaryadGroup.OPEN, null, "").map { it.id })
        assertEquals(listOf(4L), filterNaryad(r, NaryadGroup.ALL, 2L, "").map { it.id })
        assertEquals(listOf(4L), filterNaryad(r, NaryadGroup.ALL, null, "bobur").map { it.id })
        assertEquals(2, naryadCounts(r)[NaryadGroup.ALL])
    }

    @Test fun detailConvertsToWorkerUnit() {
        val d = parseNaryadDetail(one)!!
        assertEquals("Korpus A", d.obyektNom); assertTrue(d.canReport)
        val l = d.lines[0]
        assertEquals("kvadrat", l.birlik); assertEquals(10.0, l.hajm, 1e-9); assertEquals(4.0, l.bajarilgan!!, 1e-9); assertEquals(3.0, l.qabul!!, 1e-9)
        assertEquals(6.0, l.qolgan, 1e-9); assertTrue(l.kamQabul); assertEquals(45000.0, l.narxBirlik!!, 0.0)
        val m = d.lines[1]
        assertEquals("t", m.birlik); assertNull(m.narxBirlik); assertNull(m.bajarilgan) // unknown price stays null, not 0
    }

    @Test fun reportPayloadMultipliesByKoefOnlyEditedLine() {
        val d = parseNaryadDetail(one)!!
        val p = reportPayload(17, 5, 3, d.lines[0], BigDecimal("2.5"), " izoh ", false, "11111111-1111-4111-8111-111111111111")
        assertEquals("naryad_usta_bajarildi_v1", p["amal"]!!.jsonPrimitive.content); assertEquals("bajarildi", p["naryad_amal"]!!.jsonPrimitive.content)
        assertEquals("3", p["kutilgan_versiya"]!!.jsonPrimitive.content)
        val q = p["qatorlar"]!!.jsonArray
        assertEquals(1, q.size); assertEquals("11", q[0].jsonObject["id"]!!.jsonPrimitive.content); assertEquals("25.0", q[0].jsonObject["bajarilgan_hajm"]!!.jsonPrimitive.content)
        assertEquals("izoh", p["izoh"]!!.jsonPrimitive.content); assertEquals("false", p["tugadi"]!!.toString())
    }

    @Test fun validationRejectsZeroAndMinus() {
        assertNull(validateReport(BigDecimal("0.5"))); assertEquals("hajm", validateReport(null)); assertEquals("hajm", validateReport(BigDecimal.ZERO)); assertEquals("hajm", validateReport(BigDecimal("-1")))
    }

    @Test fun lastLineGoesToForeman() {
        val d = parseNaryadDetail(one)!!
        assertEquals(1, othersUnreported(d.lines, 11)) // line 12 has nothing reported yet
        assertEquals(0, othersUnreported(d.lines.map { it.copy(bajarilgan = 1.0) }, 11))
    }

    @Test fun rolesAndSteps() {
        assertTrue(canReportNaryad("usta")); assertTrue(canReportNaryad("prorab")); assertFalse(canReportNaryad("omborchi")); assertFalse(canReportNaryad(null))
        assertEquals(listOf("berildi" to 1, "bajarildi" to 0, "qabul" to -1, "hisoblandi" to -1), naryadSteps("bajarildi"))
        assertEquals("bekor", naryadSteps("bekor").last().first)
        assertNotNull(summarizeReport("""{"amal":"naryad_usta_bajarildi_v1","naryad_id":5}"""))
    }
}
