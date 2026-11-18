package uz.anncorp.smeta.core

import uz.anncorp.smeta.core.ui.QuraiTokens
import org.junit.Test
import org.junit.Assert.assertEquals

class QuraiTokensTest {
    @Test fun darkMatchesWebFiruza() {
        assertEquals(0xFF0E1113, QuraiTokens.dark.bg)
        assertEquals(0xFF2EC4B6, QuraiTokens.dark.accent)
        assertEquals(0xFFE8ECEA, QuraiTokens.dark.text)
    }
    @Test fun lightMatchesWebGanch() {
        assertEquals(0xFFF5F4F0, QuraiTokens.light.bg)
        assertEquals(0xFF0B7A72, QuraiTokens.light.accent)
    }
    @Test fun brandMatchesFavicon() { assertEquals(0xFF14213D, QuraiTokens.BRAND_NAVY); assertEquals(0xFFB08D57, QuraiTokens.BRAND_GOLD) }
}

