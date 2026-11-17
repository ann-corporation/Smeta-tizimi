package uz.anncorp.smeta.feature.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InAppBrowserTest {
    @Test fun httpsStaysAndHttpIsUpgraded() {
        assertEquals("https://example.org/a?b=1", foreignWebUrl("https://example.org/a?b=1"))
        assertEquals("https://example.org/a", foreignWebUrl("http://example.org/a"))
    }

    @Test fun nonWebSchemesAreRefused() {
        assertNull(foreignWebUrl("intent://x#Intent;end"))
        assertNull(foreignWebUrl("javascript:alert(1)"))
        assertNull(foreignWebUrl("mailto:a@b.c"))
        assertNull(foreignWebUrl("file:///etc/hosts"))
    }
}