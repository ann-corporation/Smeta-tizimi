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

    @Test fun demoF2DraftFlowReadsPreviewsAndConfirms() { runBlocking {
        val repo = uz.anncorp.smeta.feature.f2draft.F2DraftRepository(api)
        val sheet = (repo.sheet(1, 503) as uz.anncorp.smeta.feature.f2draft.F2Out.Ok).value
        assertTrue(sheet.act.editable); assertTrue(sheet.rows.any { it.minus }); assertTrue(sheet.rows.any { it.narx == null })
        val body = uz.anncorp.smeta.feature.f2draft.editBody(1, 503, sheet.act.versiya, listOf(uz.anncorp.smeta.feature.f2draft.RowEdit(11, hajm = -2.5)), listOf(20))
        val p = (repo.preview(body) as uz.anncorp.smeta.feature.f2draft.F2Out.Ok).value
        assertEquals(2, p.rows.size); assertTrue(p.rows.any { it.removed }); assertNotNull(p.after)
        assertTrue(repo.confirm(1, p.token!!) is uz.anncorp.smeta.feature.f2draft.F2Out.Ok)
        assertEquals(2, uz.anncorp.smeta.feature.f2draft.TakliflarRepository(api).list(1, 503).size)
    } }
}