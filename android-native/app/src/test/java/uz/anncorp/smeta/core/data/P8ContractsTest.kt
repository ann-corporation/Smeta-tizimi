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

class P8ContractsTest {
    private fun el(s: String) = Json.parseToJsonElement(s)
    private fun obj(s: String): JsonObject = el(s).jsonObject

    private val registry = """{"ok":true,"natija":{"ok":true,"qatorlar":[
      {"id":3,"obyekt_id":1,"obyekt":"A","raqam":"3","oy":"2026-11-01","lifecycle_status":"draft","narxsiz_qator":2,"farq":0},
      {"id":2,"obyekt_id":1,"obyekt":"A","raqam":"2","oy":"2026-10-01","lifecycle_status":"submitted","narxsiz_qator":0,"farq":9},
      {"id":1,"obyekt_id":1,"obyekt":"A","raqam":"1","oy":"2026-09-01","lifecycle_status":"approved"},
      {"id":9,"obyekt_id":1,"obyekt":"A","raqam":"0","oy":"2026-08-01","lifecycle_status":"cancelled"},
      {"id":5,"obyekt_id":2,"raqam":"5","oy":"2026-10-01","lifecycle_status":"approved"}]}}"""

    @Test fun registryCountsAndFilters() {
        val acts = parseRegistry(el(registry))!!
        val rows = buildRegistry(acts, mapOf(2L to "B"))
        assertEquals(2, rows.size)
        val a = rows.first { it.objectId == 1L }
        assertEquals(1, a.approved); assertEquals(1, a.draft); assertEquals(1, a.inFlow); assertEquals(0, a.rejected)
        assertEquals("2026-09", a.lastApprovedMonth)
        assertEquals(2, a.unpriced); assertTrue(a.hasDiff)
        assertEquals("B", rows.first { it.objectId == 2L }.name)
        assertEquals("A", rows.first().name)   // open work first
        assertEquals(listOf(1L), filterRegistry(rows, RegistryFilter.WITH_DRAFT, "").map { it.objectId })
        assertEquals(listOf(2L), filterRegistry(rows, RegistryFilter.ALL, "b").map { it.objectId })
        assertEquals(listOf(1L), filterRegistry(rows, RegistryFilter.PROBLEMS, "").map { it.objectId })
        assertEquals(2, registryTotals(rows).approved)
        assertNull(parseRegistry(el("""{"ok":false}""")))
    }

    @Test fun nakopView() {
        val gen = listOf(
            GenItem("nakopitelniy:2026-10", "nakopitelniy", "t", "x", null, mapOf("oy_son" to 202610L), listOf("xlsx", "pdf")),
            GenItem("slichitelniy", "slichitelniy", "s", "x", null, emptyMap(), listOf("xlsx")),
            GenItem("f2:1", "f2", "f", "x", null, emptyMap(), listOf("pdf")),
        )
        val acts = listOf(F2Act(1, 1, "13", "2026-10-01", "approved", 1, 0, 0, false), F2Act(2, 1, "14", "2026-11-01", "draft", 1, 0, 0, false))
        val v = buildNakopView(gen, acts)
        assertEquals(listOf("2026-11", "2026-10"), v.months.map { it.month })
        assertNull(v.months[0].doc); assertNotNull(v.months[1].doc)
        assertEquals("13", v.months[1].actNumber)
        assertEquals(1, v.others.size)
        assertEquals("10.2026", nakopMonthLabel("2026-10"))
    }

    @Test fun qabulBatchingAndDecision() {
        val rows = listOf(
            obj("""{"id":1,"obyekt_id":5,"qator_id":10,"sana":"2026-11-16","hajm":-2.5,"holat":"qoralama","created_at":"2026-11-10T09:00:00+00:00"}"""),
            obj("""{"id":2,"obyekt_id":5,"qator_id":11,"sana":"2026-11-16","hajm":4,"holat":"qoralama"}"""),
            obj("""{"id":3,"obyekt_id":6,"qator_id":12,"sana":"2026-11-15","hajm":1,"holat":"tasdiqlangan"}"""),
        )
        val p = parsePending(rows)
        assertEquals(2, p.size)
        val b = batchPending(p)
        assertEquals(1, b.size); assertEquals(listOf(1L, 2L), b[0].ids)
        assertEquals(-2.5, p[0].qty, 0.0)
        assertFalse(remarkValid(QabulDecision.REJECT, " a "))
        assertTrue(remarkValid(QabulDecision.REJECT, "xato hajm"))
        assertTrue(remarkValid(QabulDecision.ACCEPT, ""))
        val body = decisionBody(3, listOf(1, 2), QabulDecision.REJECT, " sabab ", "op")
        assertEquals("usta_fakt_qaror_v1", body["amal"].toString().trim('"'))
        assertEquals("rad", body["qaror"].toString().trim('"'))
        assertEquals("sabab", body["izoh"].toString().trim('"'))
        assertEquals(10, waitingDays("2026-11-01T00:00:00+00:00", java.time.Instant.parse("2026-11-11T12:00:00Z")))
    }

    @Test fun qabulResultMapping() {
        assertTrue(qabulResult(ApiResult(200, el("""{"ok":true,"natija":{"ok":true,"qator_soni":2}}"""), null)) is QabulResult.Done)
        assertTrue(qabulResult(ApiResult(200, el("""{"ok":true,"qator_soni":0}"""), null)) is QabulResult.Changed)
        assertTrue(qabulResult(ApiResult(403, el("""{"ok":false}"""), "PERMISSION_DENIED")) is QabulResult.Forbidden)
        assertTrue(qabulResult(ApiResult(0, null, null)) is QabulResult.Offline)
    }

    @Test fun debtsFilterAndTotal() {
        val body = el("""{"ok":true,"natija":{"ok":true,"qatorlar":[
          {"shartnoma_id":1,"yonalish":"debitor","kontragent":"Alfa","qarz":300,"tolangan":10,"f3_sotuv":50,"obyektlar":[{"id":1,"nom":"A"}]},
          {"shartnoma_id":2,"yonalish":"debitor","kontragent":"Beta","qarz":0,"tolangan":5,"f3_sotuv":5,"obyektlar":[]},
          {"shartnoma_id":3,"yonalish":"debitor","kontragent":"Gama","qarz":null,"obyektlar":[]},
          {"shartnoma_id":4,"yonalish":"kreditor","kontragent":"X","qarz":9,"obyektlar":[]}]}}""")
        val l = parseDebts(body)!!
        assertEquals(3, l.size)
        assertEquals(listOf(1L), filterDebts(l, DebtFilter.OWED, "").map { it.contractId })
        assertEquals(listOf(1L, 2L, 3L), filterDebts(l, DebtFilter.ALL, "").map { it.contractId })   // unknown debt last
        val t = debtTotal(l)
        assertEquals(300.0, t.value!!, 0.0); assertEquals(1, t.unknown)
        assertNull(debtTotal(listOf(l[2])).value)
    }

    @Test fun resourceStatementMatchesWebGrouping() {
        val rows = listOf(
            obj("""{"tur":"mat","kat":"\u041C\u0410\u0422","kod":"1","nom":"Sement","birlik":"t","smeta_hajm":24,"smeta_summa":100,"f2_hajm":10,"f2_summa":40,"qoldiq_hajm":14,"qoldiq_summa":60}"""),
            obj("""{"tur":"mat","kat":"\u041C\u0410\u0422","kod":null,"nom":"Sement","birlik":"t","smeta_hajm":6,"smeta_summa":null,"f2_hajm":6,"f2_summa":0,"qoldiq_hajm":0,"qoldiq_summa":0}"""),
            obj("""{"tur":"rs","kat":"\u0427\u0415\u041B","kod":"2","nom":"Betonchi","birlik":"soat","smeta_hajm":8,"smeta_summa":16,"f2_hajm":0,"f2_summa":0,"qoldiq_hajm":8,"qoldiq_summa":16}"""),
            obj("""{"tur":"rs","kat":"\u041C\u0410\u0428","nom":"\u0417\u0410\u0422\u0420\u0410\u0422\u042B \u0422\u0420\u0423\u0414\u0410 \u041C\u0410\u0428\u0418\u041D\u0418\u0421\u0422\u041E\u0412","birlik":"soat","smeta_hajm":1,"smeta_summa":null}"""),
            obj("""{"tur":"bl","kat":"\u041C\u0410\u0422","nom":"Ish","birlik":"m3","smeta_hajm":99,"smeta_summa":99}"""),
        )
        val c = buildResourceStatement(rows)
        assertEquals(listOf("\u0427\u0415\u041B", "\u041C\u0410\u0428", "\u041C\u0410\u0422"), c.map { it.cat })   // labour, machines, materials
        val mat = c.last()
        assertEquals(1, mat.lines.size)                                   // same name+unit -> one line
        val s = mat.lines[0]
        assertEquals(30.0, s.estQty, 0.0); assertEquals(100.0, s.estSum, 0.0); assertEquals(16.0, s.f2Qty, 0.0); assertEquals(14.0, s.leftQty, 0.0)
        assertEquals(2, s.rowCount); assertEquals(1, s.unpricedRows)
        assertEquals(0, c[1].lines[0].unpricedRows)                       // operator labour is never "unpriced"
        assertEquals(1, openResources(c).first { it.cat == "\u041C\u0410\u0422" }.lines.size)
        assertEquals(1, filterResources(c, "sement").size)
    }
}