package uz.anncorp.smeta.core.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Owner rule: every sum shown both without and with markup, object value QQS-inclusive first, unknown never 0, no client-side arithmetic. */
class MoneyTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(name: String) = checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/$name")) { name }.bufferedReader().readText()

    @Test fun packRequiresAllThreeNumbers() {
        assertEquals(SumPack(112.0, 100.0, 90.0), parseSumPack(json.parseToJsonElement("""{"qqs_bilan":112,"ustamali":"100","ustamasiz":90.0}""")))
        assertNull(parseSumPack(json.parseToJsonElement("""{"qqs_bilan":112,"ustamali":100}""")))
        assertNull(parseSumPack(json.parseToJsonElement("""{"qqs_bilan":null,"ustamali":100,"ustamasiz":90}""")))
        assertNull(parseSumPack(json.parseToJsonElement("""null""")))
    }

    @Test fun panelGivesPerObjectPackages() {
        val m = parseRahbarPanel(json.parseToJsonElement(res("panel.json")))!!
        val o = m.getValue(101L)
        assertEquals(1232381500.0, o.smeta!!.ustamasiz, 0.0)
        assertTrue(o.smeta!!.ustamali > o.smeta!!.ustamasiz)          // markup package is taken from the server, not computed here
        assertTrue(o.smeta!!.qqsBilan > o.smeta!!.ustamali)
        assertNotNull(o.fakt); assertNotNull(o.f2)
        assertEquals(3, o.f2DraftCount)
        assertNull(m.getValue(102L).fakt)                              // not started: unknown, never a fake zero
    }

    @Test fun panelRejectsRefusedOrBrokenAnswers() {
        assertNull(parseRahbarPanel(json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseRahbarPanel(json.parseToJsonElement("""{"ok":true,"natija":{"ok":false,"code":"PERMISSION_DENIED"}}""")))
        assertNull(parseRahbarPanel(json.parseToJsonElement("""{"ok":true,"natija":{"ok":true}}""")))
    }

    @Test fun requestShape() {
        assertEquals("""{"soro":"rahbar_panel_v1","kompaniya_id":8}""", rahbarPanelRequest(8).toString())
        assertEquals("""{"soro":"rahbar_panel_v1","kompaniya_id":8,"obyekt_id":21}""", rahbarPanelRequest(8, 21).toString())
    }

    @Test fun dualDisplayWithServerPackage() {
        val d = displayMoney(SumPack(1120.0, 1000.0, 850.0), 850.0)
        assertTrue(d.fromServer)
        assertEquals(1120.0, d.vatIncl!!, 0.0)       // QQS-inclusive first
        assertEquals(1000.0, d.withMarkup!!, 0.0)     // with markup
        assertEquals(850.0, d.withoutMarkup!!, 0.0)   // without markup
    }

    @Test fun dualDisplayWithoutPackageNeverInventsNumbers() {
        val d = displayMoney(null, 850.0)
        assertFalse(d.fromServer)
        assertNull(d.vatIncl); assertNull(d.withMarkup)   // unknown, shown as a dash
        assertEquals(850.0, d.withoutMarkup!!, 0.0)
        val none = displayMoney(null, null)
        assertNull(none.withoutMarkup)                    // null stays null (0 would be a lie)
        assertEquals("—", formatMoney(none.withMarkup))
    }

    @Test fun objectMoneyRoundTripsThroughTheCache() {
        val m = ObjectMoney(SumPack(3.0, 2.0, 1.0), null, SumPack(6.0, 5.0, 4.0), 2)
        val back = json.decodeFromString<ObjectMoney>(json.encodeToString(m))
        assertEquals(m, back)
        assertTrue(back.any); assertFalse(ObjectMoney().any)
    }
}
