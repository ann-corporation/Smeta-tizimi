package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.db.QatorEntity

/** Boss panel / F-2 list parsers and the pure helpers behind the visual screens. Money is only ever taken from the server numbers. */
class RahbarVisualsTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(name: String) = checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/$name")) { name }.bufferedReader().readText()

    @Test fun bossRoles() {
        listOf("boss", "rahbar", "direktor", "superadmin", " Direktor ").forEach { assertTrue(it, isBossRole(it)) }
        listOf("prorab", "usta", "pto", "", null).forEach { assertFalse("$it", isBossRole(it)) }
    }

    @Test fun fullPanelParsesCardsObjectsAndAlerts() {
        val d = parseRahbarFull(rahbarNatija(json.parseToJsonElement(res("panel.json"))))!!
        assertEquals(4, d.objectCount)
        // Company totals come as server packages: QQS-inclusive first, both markup variants present.
        val smeta = d.cards.smeta!!
        assertTrue(smeta.qqsBilan > smeta.ustamali && smeta.ustamali > smeta.ustamasiz)
        assertNotNull(d.cards.fact); assertNotNull(d.cards.f2)
        assertEquals(4, d.cards.f2Count)
        assertEquals(4.9, d.cards.f2PercentOfSmeta!!, 0.0)
        assertNull(d.cards.payable)               // unknown stays null, never 0
        assertNull(d.cards.profitPercent)
        assertEquals(30000000.0, d.cards.aging!!.d60plus, 0.0)
        assertEquals(6, d.months.size)
        assertNull(d.months.last().paid)          // month without payment data is null, not 0
        assertEquals(30, d.forecast!!.days)
        val o = d.objects.first { it.id == 101L }
        assertEquals(42.6, o.factPercent!!, 0.0); assertEquals(24.5, o.f2Percent!!, 0.0); assertNull(o.f3Percent)
        assertEquals(1, o.critical); assertEquals(3, o.f2Drafts)
        assertNull(d.objects.first { it.id == 103L }.smeta)   // narxsiz object: no package, shown as a dash
        assertEquals(listOf(101L, 103L), d.problemObjects().map { it.id })
        assertEquals(4, d.attention.size)
        assertEquals(AttentionKind.F2_OVER_FACT, AttentionKind.of(d.attention.first().code))
        assertEquals(AttentionKind.OTHER, AttentionKind.of("something_new"))
        assertEquals(2, d.approvals.size)
    }

    @Test fun panelMoneyMapCarriesServerProgressAndDebt() {
        val m = parseRahbarPanel(json.parseToJsonElement(res("panel.json")))!!.getValue(101L)
        assertEquals(42.6, m.factPct!!, 0.0); assertEquals(24.5, m.f2Pct!!, 0.0)
        assertEquals(186396000.0, m.debt!!, 0.0); assertEquals(2000000000.0, m.contractQqs!!, 0.0)
        assertNull(parseRahbarPanel(json.parseToJsonElement(res("panel.json")))!!.getValue(104L).f2Pct)
    }

    @Test fun malformedPanelIsRejectedAsAWhole() {
        assertNull(rahbarNatija(json.parseToJsonElement("""{"ok":false}""")))
        assertNull(rahbarNatija(json.parseToJsonElement("""{"ok":true,"natija":{"ok":false}}""")))
        assertNull(parseRahbarFull(rahbarNatija(json.parseToJsonElement("""{"ok":true,"natija":{"ok":true}}"""))))
    }

    @Test fun f2ListParsesStatusesAndFlags() {
        val acts = parseF2List(json.parseToJsonElement(res("f2list.json")))!!
        assertEquals(5, acts.size)
        assertEquals(F2Status.DRAFT, acts[0].state); assertEquals(2, acts[0].unpriced)
        assertTrue(acts[1].hasDiff); assertEquals(3, acts[1].negativeRows)
        assertEquals(F2Status.APPROVED, acts[2].state); assertFalse(acts[2].hasDiff)
        assertEquals(F2Status.REJECTED, acts[4].state)
        assertEquals(F2Status.UNKNOWN, F2Status.of("brand_new"))
        assertEquals("10.2026", f2MonthLabel("2026-10-01")); assertEquals("11.2026", f2MonthLabel("2026-11")); assertNull(f2MonthLabel(null))
        assertNull(parseF2List(json.parseToJsonElement("""{"ok":true,"natija":{"ok":false}}""")))
        assertEquals("""{"soro":"akt_reestr_obyekt_v1","obyekt_id":101,"tur":"f2"}""", f2ListRequest(101).toString())
    }

    private fun row(id: Long, bolim: String?, smeta: Double?, fakt: Double, f2: Double, sumS: Double?, sumF: Double, sumF2: Double, kod: String = "K$id") =
        QatorEntity(obyektId = 1, qatorId = id, kod = kod, nom = "Ish $id", birlik = "m3", smetaHajm = smeta, narx = null, smetaSumma = sumS, faktHajm = fakt, faktSumma = sumF, f2Hajm = f2, f2Summa = sumF2, almashtirilgan = 0.0, bolim = bolim)

    @Test fun sectionProgressUsesServerRowAmountsInEstimateOrder() {
        val rows = listOf(
            row(1, "Poydevor", 10.0, 5.0, 2.0, 100.0, 50.0, 20.0), row(2, "Poydevor", 10.0, 0.0, 0.0, 100.0, 0.0, 0.0),
            row(3, "Devor", 4.0, 0.0, 0.0, null, 0.0, 0.0), row(4, null, 1.0, 1.0, 1.0, 10.0, 10.0, 10.0),
        )
        val s = sectionProgress(rows)
        assertEquals(listOf("Poydevor", "Devor", null), s.map { it.name })
        assertEquals(25.0, s[0].factPercent!!, 1e-9); assertEquals(10.0, s[0].f2Percent!!, 1e-9)
        assertNull(s[1].factPercent); assertEquals(1, s[1].unpriced)    // no priced rows: unknown, not 0 %
        assertEquals(100.0, s[2].factPercent!!, 1e-9)
    }

    @Test fun smetaTreeFiltersByCodeOrNameAndDropsEmptySections() {
        val rows = listOf(row(1, "A", 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, kod = "311-01"), row(2, "B", 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, kod = "999-9"))
        assertEquals(2, smetaTree(rows, "").size)
        val t = smetaTree(rows, "311")
        assertEquals(1, t.size); assertEquals("A", t[0].name)
        assertEquals(1, smetaTree(rows, "ish 2").single().rows.size)      // name match, case-insensitive
        assertTrue(smetaTree(rows, "zzz").isEmpty())
        assertEquals(1, smetaTree(rows, "311")[0].progress.rows)           // the section progress always covers the whole section
    }

    @Test fun volumeSplitFractions() {
        val sp = volumeSplit(10.0, 6.0, 2.0)!!
        assertEquals(0.2f, sp.f2, 1e-6f); assertEquals(0.4f, sp.factOnly, 1e-6f); assertEquals(0.4f, sp.open, 1e-6f); assertFalse(sp.over)
        val over = volumeSplit(10.0, 12.0, 4.0)!!
        assertTrue(over.over); assertEquals(0f, over.open, 1e-6f)
        assertNull(volumeSplit(null, 1.0, 0.0)); assertNull(volumeSplit(0.0, 1.0, 0.0))
        val neg = volumeSplit(10.0, -2.0, 0.0)!!                           // negative fact never draws a negative bar
        assertEquals(0f, neg.factOnly, 1e-6f); assertEquals(1f, neg.open, 1e-6f)
    }

    @Test fun draftWarnsWhenNegativeVolumeTakesFactBelowZero() {
        fun d(h: Double, fakt: Double) = uz.anncorp.smeta.core.db.DraftEntity(1, 1, h, null, "n", null, 10.0, fakt, 0.0, 0)
        assertTrue(d(-2.5, 2.0).goesBelowZero)      // 2.0 - 2.5 < 0
        assertFalse(d(-2.0, 2.0).goesBelowZero)     // exactly zero is fine
        assertFalse(d(-0.3, 5.0).goesBelowZero)
        assertFalse(d(3.0, 0.0).goesBelowZero)      // positive never warns this way
    }
}