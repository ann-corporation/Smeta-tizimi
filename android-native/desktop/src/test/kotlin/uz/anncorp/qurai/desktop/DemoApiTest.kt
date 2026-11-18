package uz.anncorp.qurai.desktop

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.core.data.objectsRequest
import uz.anncorp.smeta.core.data.parseRahbarPanel
import uz.anncorp.smeta.core.data.rahbarPanelRequest
import uz.anncorp.smeta.feature.common.parseObjs
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue

class DemoApiTest {
    private val api = DesktopDemoApi(Json { ignoreUnknownKeys = true })

    @Test fun demoServesObjectsAndMoney() { runBlocking {
        val objs = parseObjs(api.bff("/api/sb", "POST", objectsRequest(1)).body)
        assertNotNull(objs); assertTrue(objs!!.isNotEmpty())
        assertNotNull(parseRahbarPanel(api.bff("/api/sb", "POST", rahbarPanelRequest(1)).body))
    } }

    @Test fun demoHasOneWorkplaceAndNoRealSession() { runBlocking {
        val r = api.bff("/api/ish-joyi?bolim=joylarim")
        assertEquals(200, r.status)
        assertTrue(r.body.toString().contains("Demo"))
        assertEquals(403, api.bff("/api/sb", "POST", kotlinx.serialization.json.buildJsonObject { }).status)
    } }
}