package uz.anncorp.qurai.ui

import org.junit.Test
import uz.anncorp.qurai.ui.nav.QNav
import uz.anncorp.smeta.core.ui.DesignTokens
import uz.anncorp.smeta.core.ui.QuraiTokens
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** design/tokens.json is the single source: the apps' navigation, palette and status wording must equal it. */
class DesignTokensTest {
    @Test fun navigationMatchesTokens() {
        val fromUi = QNav.sections.map { s -> Triple(s.id, s.title, s.items.map { it.id to it.title }) }
        val fromTokens = DesignTokens.nav.map { s -> Triple(s.id, s.title, s.items.map { it.id to it.title }) }
        assertEquals(fromTokens, fromUi)
    }

    @Test fun quraiTokensDelegateToGenerated() {
        assertEquals(DesignTokens.dark, QuraiTokens.dark)
        assertEquals(DesignTokens.CONTROL_MD, QuraiTokens.CONTROL_MD)
        assertEquals(DesignTokens.CONTROL_TOUCH, QuraiTokens.TOUCH_TARGET)
    }

    @Test fun f2StatusLabelsAreTheSiteLabels() {
        val f2 = DesignTokens.status.getValue("f2")
        assertEquals("Tasdiqlangan", f2.getValue("approved").label)
        assertEquals("Tekshirishga yuborilgan", f2.getValue("submitted").label)
        assertEquals("ok", f2.getValue("approved").tone)
        assertEquals("danger", f2.getValue("rejected").tone)
        assertTrue(f2.keys.containsAll(listOf("draft", "checked", "cancelled", "superseded")))
    }

    @Test fun softFillsFollowTokens() {
        assertEquals(0x1F62C97A, DesignTokens.dark.okSoft)
        assertEquals(0x14236A34, DesignTokens.light.okSoft)
    }
}
