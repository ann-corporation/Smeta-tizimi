package uz.anncorp.smeta.feature.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebLogicTest {
    private val base = "https://qurai.example"

    @Test fun onlyOwnHttpsHostStaysInTheContainer() {
        assertTrue(isOwnHost("https://qurai.example/admin/fakt", base))
        assertTrue(isOwnHost("https://QURAI.example/admin", base))
        assertFalse(isOwnHost("http://qurai.example/admin", base))
        assertFalse(isOwnHost("https://qurai.example.evil.com/admin", base))
        assertFalse(isOwnHost("https://evil.com/?u=https://qurai.example", base))
        assertFalse(isOwnHost("javascript:alert(1)", base))
        assertFalse(isOwnHost("not a url", base))
    }

    @Test fun navigationActions() {
        assertEquals(NavAction.STAY, navAction("https://qurai.example/admin/x", base))
        assertEquals(NavAction.EXTERNAL, navAction("https://example.org/a", base))
        assertEquals(NavAction.EXTERNAL, navAction("mailto:a@b.uz", base))
        assertEquals(NavAction.EXTERNAL, navAction("tel:+998901234567", base))
        assertEquals(NavAction.BLOCK, navAction("intent://scan/#Intent;scheme=zxing;end", base))
        assertEquals(NavAction.BLOCK, navAction("file:///data/data/x", base))
        assertEquals(NavAction.BLOCK, navAction("javascript:alert(1)", base))
    }

    @Test fun renewKeepsThePageTheUserIsOn() {
        val fb = "/admin/smeta-studio?app=android&k=7&tema=dark"
        assertEquals(
            "/admin/buxgalteriya?app=android&k=7&tema=dark",
            ticketPathFor("https://qurai.example/admin/buxgalteriya?app=android&k=7&tema=dark", fb, 7, true, base),
        )
        // The SPA dropped the hints from the address: they are added again.
        assertEquals("/admin/f2-reestr?app=android&k=7&tema=light", ticketPathFor("https://qurai.example/admin/f2-reestr", fb, 7, false, base))
        // Not our page / not /admin / not whitelisted -> start page.
        assertEquals(fb, ticketPathFor("https://evil.com/admin/x", fb, 7, true, base))
        assertEquals(fb, ticketPathFor("https://qurai.example/", fb, 7, true, base))
        assertEquals(fb, ticketPathFor("https://qurai.example/admin/a%20b", fb, 7, true, base))
        assertEquals(fb, ticketPathFor(null, fb, 7, true, base))
    }

    @Test fun sessionExpiryIsOnlyOurApi401() {
        assertTrue(isSessionExpired(401, "https://qurai.example/api/sessiya", base))
        assertFalse(isSessionExpired(403, "https://qurai.example/api/sessiya", base))
        assertFalse(isSessionExpired(401, "https://cdn.example.com/api/x", base))
        assertFalse(isSessionExpired(401, "https://qurai.example/assets/app.js", base))
        assertFalse(isSessionExpired(401, "https://qurai.example/api/mobil/web-kirish?b=x", base))
    }

    @Test fun renewIsThrottled() {
        assertTrue(mayRenew(0L, 5_000))
        assertFalse(mayRenew(10_000, 20_000))
        assertTrue(mayRenew(10_000, 30_001))
    }

    @Test fun blobFileNames() {
        assertEquals("F-2 hisobot.xlsx", blobFileName("F-2 hisobot.xlsx", "application/octet-stream"))
        assertEquals("hujjat.pdf", blobFileName(null, "application/pdf"))
        assertEquals("hisobot.xlsx", blobFileName("hisobot", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        assertEquals("passwd", blobFileName("../../etc/passwd", "text/plain").substringBefore('.'))
        assertEquals("hujjat.bin", blobFileName("", "application/x-unknown"))
    }
}
