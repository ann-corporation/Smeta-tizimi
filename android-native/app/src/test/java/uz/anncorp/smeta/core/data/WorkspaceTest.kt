package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.feature.hub.renderable

private val J = Json { ignoreUnknownKeys = true }

private fun ws(sections: String, actions: String = ACTIONS, extra: String = "", cabinets: String = CABINETS) =
    """{"ok":true,"versiya":1,"joriy":"1:prorab","kompaniya_id":1,"tomon":"prorab","tomon_nom":"Prorab / usta (dala)","rejim":"dala",
      "dala":{"katta_tugma":true,"oflayn":true,"ovoz":true,"foto":true},"kabinetlar":[$cabinets],"amallar":[$actions],"bolimlar":[$sections],"birlamchi_amal":"fakt_yoz"$extra}"""

private const val ACTIONS = """{"id":"fakt_yoz","nom":"Fakt yozish","ikonka":"fakt","maqsad":{"tur":"native","kod":"fakt"},"birlamchi":true},
  {"id":"material_sorov","nom":"Material so'rovi","ikonka":"zayavka","maqsad":{"tur":"web","kod":"zayavka","yol":"/admin/zayavka"}},
  {"id":"yangi","nom":"Kelajak","ikonka":"x","maqsad":{"tur":"native","kod":"xarita3d"}}"""
private const val CABINETS = """{"id":"1:prorab","kompaniya_id":1,"nom":"Sinov MChJ","tomon":"prorab","tomon_nom":"Prorab","manba":"azolik","joriy":true},
  {"id":"1:texnadzor","kompaniya_id":1,"nom":"Sinov MChJ","tomon":"texnadzor","tomon_nom":"Texnadzor","manba":"aloqa","joriy":false}"""

private class Fake(private val answer: () -> ApiResult) : BffApi {
    val paths = mutableListOf<String>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { paths += path; return answer() }
    override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
}
private class MemCache : WorkspaceCache {
    val m = mutableMapOf<Long, String>()
    override fun workspaceGet(companyId: Long) = m[companyId]
    override fun workspacePut(companyId: Long, raw: String) { m[companyId] = raw }
}

class WorkspaceParseTest {
    private val sections = """{"id":"dala","tur":"amallar","nom":"Dalada","katta":true,"amallar":["fakt_yoz","yoq","material_sorov"]},
      {"id":"x","tur":"xarita3d","nom":"Kelajak turi"},
      {"id":"bugun","tur":"royxat","nom":"Bugun","manba":"bugun.ishlar","guruh":"joy","amal":"fakt_yoz"},
      {"id":"matn","tur":"matn","nom":"Boshlash","matn":"Salom"}"""

    @Test fun parsesAndSkipsUnknownSectionTypesAndActionRefs() {
        val w = parseWorkspace(J.parseToJsonElement(ws(sections)))!!
        assertEquals(listOf("dala", "bugun", "matn"), w.sections.map { it.id })
        assertEquals(listOf("fakt_yoz", "material_sorov"), w.sections[0].actionIds)
        assertTrue(w.sections[0].big); assertTrue(w.sections[1].groupByPlace); assertEquals("fakt_yoz", w.sections[1].openAction)
        assertTrue(w.fieldMode); assertEquals(true, w.field?.offline)
        assertEquals("fakt_yoz", w.primaryAction); assertEquals(2, w.cabinets.size); assertEquals("1:prorab", w.cabinets.single { it.current }.id)
    }

    @Test fun brokenSkeletonIsNullNotACrash() {
        assertNull(parseWorkspace(null))
        assertNull(parseWorkspace(J.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseWorkspace(J.parseToJsonElement("""{"ok":true,"amallar":[],"bolimlar":[]}""")))
    }

    @Test fun actionsOpenExistingScreensOrWebPagesOrNothing() {
        val w = parseWorkspace(J.parseToJsonElement(ws(sections)))!!
        assertEquals(WsOpen.Native(NativeTarget.FAKT), w.action("fakt_yoz")!!.open())
        assertEquals(WsOpen.Web("/admin/zayavka"), w.action("material_sorov")!!.open())
        assertNull(w.action("yangi")!!.open()) // unknown native code, no web path: hidden, never a dead button
    }

    @Test fun rendererOnlyKeepsSectionsItCanDraw() {
        val w = parseWorkspace(J.parseToJsonElement(ws(sections, actions = ACTIONS)))!!
        assertEquals(listOf("dala", "bugun", "matn"), renderable(w).map { it.id })
        val onlyUnknown = parseWorkspace(J.parseToJsonElement(ws("""{"id":"d","tur":"amallar","nom":"D","amallar":["yangi"]},{"id":"t","tur":"matn","nom":"T"}""")))!!
        assertTrue(renderable(onlyUnknown).isEmpty()) // an actions section with no openable action and a text section without text are skipped
    }
}

class WorkspaceRepositoryTest {
    private val good = ws("""{"id":"dala","tur":"amallar","nom":"Dalada","amallar":["fakt_yoz"]}""")

    @Test fun asksForTheChosenCabinetAndCachesTheAnswer() = runBlocking {
        val api = Fake { ApiResult(200, J.parseToJsonElement(good)) }
        val cache = MemCache()
        val repo = WorkspaceRepository(api, J, cache)
        repo.choose("1:texnadzor")
        assertNotNull(repo.refresh(1))
        assertEquals("/api/ish-joyi?bolim=ish_stoli&kompaniya_id=1&kabinet=1:texnadzor", api.paths.single())
        assertTrue(cache.m.containsKey(1L))
        assertEquals("1:prorab", repo.current.value?.current)
        // The server's pick becomes the remembered cabinet; another company's cabinet id is never sent.
        repo.refresh(2)
        assertFalse(api.paths.last().contains("kabinet="))
    }

    @Test fun offlineFallsBackToTheCachedCopyAndNeverShowsAnotherCompany() = runBlocking {
        val cache = MemCache().also { it.workspacePut(1, good) }
        val repo = WorkspaceRepository(Fake { ApiResult(0, null) }, J, cache)
        assertEquals("1:prorab", repo.refresh(1)?.current)
        assertNull(repo.refresh(7)) // company 7 has no cache: nothing (the plain launcher is shown), not company 1's workspace
    }
}