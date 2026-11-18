package uz.anncorp.smeta.feature.disk

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.BytesResult

class DiskContractTest {
    @Test fun paths() {
        assertEquals("/api/hujjat-maydoni?amal=royxat", diskListPath(DiskTab.MINE, 5))
        assertEquals("/api/hujjat-maydoni?amal=royxat&kompaniya_id=5&papka_id=9", diskListPath(DiskTab.COMPANY, 5, 9))
        assertEquals("/api/hujjat-maydoni?amal=royxat&savat=1&kompaniya_id=5", diskListPath(DiskTab.TRASH, 5))
        assertEquals("/api/hujjat-maydoni?amal=ulashilgan", diskListPath(DiskTab.SHARED, 5))
    }

    @Test fun parsesListing() {
        val l = parseDiskListing(Json.parseToJsonElement("""{"ok":true,"daraja":3,"shaxsiy":true,"yol":[{"id":1,"nom":"A"}],"papkalar":[{"id":2,"nom":"P","tizim":false}],"fayllar":[{"id":3,"nom":"f.pdf","bayt":2048,"versiya":2,"yangilandi":"2026-11-14T08:00:00+00:00","savatda":null,"izohlar":1}]}"""))
        assertNotNull(l)
        val rows = l!!.toRows()
        assertEquals(listOf("p2", "f3"), rows.map { it.key })
        assertEquals("14.11.2026", rows[1].meta)
        assertEquals("2,0 KB  \u00b7  v2", rows[1].sub)
    }

    @Test fun sharedAndBytes() {
        val s = parseDiskShared(Json.parseToJsonElement("""{"ok":true,"royxat":[{"turi":"fayl","id":7,"nom":"x","bergan":"Ali"}]}"""))
        assertEquals(1, s!!.size)
        assertEquals("", formatBytes(null))
        assertEquals("512 B", formatBytes(512))
    }

    // ---------- A6: file card (open / download / versions / "Tizimda ochish") ----------

    private val sys = """{"ok":true,"daraja":4,"kompaniya_id":1,"shaxsiy":false,"yol":[],"papkalar":[],"fayllar":[
        {"id":41,"nom":"F-2 5","mime":"application/pdf","bayt":2048,"versiya":3,"yangilandi":"2026-11-17T10:30:00+00:00","savatda":null,"izohlar":0,"tizim_hujjat":true,"manba_turi":"f2","manba_id":41,"hujjat_kalit":"f2:41","obyekt_id":80,"shartnoma_id":5},
        {"id":42,"nom":"mening.txt","mime":"text/plain","bayt":10,"versiya":1,"yangilandi":"2026-11-17T10:30:00+00:00","savatda":null,"izohlar":0}]}"""

    @Test fun listingKeepsSource() {
        val f = parseDiskListing(Json.parseToJsonElement(sys))!!.files
        assertTrue(f[0].system); assertEquals("f2", f[0].sourceType); assertEquals(41L, f[0].sourceId); assertEquals(80L, f[0].objectId); assertEquals("f2:41", f[0].key)
        assertFalse(f[1].system); assertNull(f[1].sourceType)
    }

    @Test fun filePathsAndVersions() {
        assertEquals("/api/hujjat-maydoni-ol?id=7", diskFilePath(7))
        assertEquals("/api/hujjat-maydoni-ol?id=7&v=2&korish=1", diskFilePath(7, 2, true))
        assertEquals("/api/hujjat-maydoni?amal=versiyalar&fayl_id=7", diskVersionsPath(7))
        val v = parseDiskVersions(Json.parseToJsonElement("""{"ok":true,"versiyalar":[{"raqam":3,"bayt":2048,"yaratildi":"2026-11-17T10:30:00+00:00","kim":"Sardor","joriy":true},{"raqam":2,"bayt":1024,"joriy":false}]}"""))!!
        assertEquals(listOf(3, 2), v.map { it.number }); assertTrue(v[0].current); assertEquals("2,0 KB  \u00b7  17.11.2026  \u00b7  Sardor", v[0].label())
        assertNull(parseDiskVersions(Json.parseToJsonElement("""{"ok":false}""")))
    }

    @Test fun systemTargetFollowsTheWebRules() {
        fun f(t: String?, id: Long? = null, o: Long? = null, k: String? = null) = DiskFile(1, "x", null, null, null, null, false, 0, null, system = t != null, sourceType = t, sourceId = id, objectId = o, key = k)
        assertEquals(DiskSystemTarget("f2", "/admin/f2-tayyorlash?obyekt=80&akt=41", 80), diskSystemTarget(f("f2", 41, 80)))
        assertEquals("/admin/f2-tarix", diskSystemTarget(f("f2", 41, null))!!.webPath)
        assertEquals("nakop", diskSystemTarget(f("nakopitelniy", 80, 80))!!.module)
        assertEquals("/admin/nakopitelniy?obyekt=80&f3=shartnoma", diskSystemTarget(f("forma3", 9, 80))!!.webPath)
        assertEquals("/admin/nakopitelniy?obyekt=80&f3=1&davr=2026-08", diskSystemTarget(f("forma3", null, 80, "tmp:f3:5:2026-08"))!!.webPath)
        assertEquals("/admin/holat/80#slichitelniy", diskSystemTarget(f("slichitelniy", 80, 80))!!.webPath)
        assertNull(diskSystemTarget(f("aosr", 1, 80))!!.module)   // no AOSR screen in the apps: the website page
        assertNull(diskSystemTarget(f(null)))                      // user file
        assertNull(diskSystemTarget(f("nashr", 1, 80)))            // publication: nothing to open
    }

    @Test fun bytesAnswersAreMappedOnce() {
        fun r(status: Int, b: ByteArray? = null) = diskBytesResult(status, b, "application/pdf", null, "a.pdf", null)
        assertEquals(DiskNotice.OFFLINE, (r(0) as DiskBytes.Failed).notice); assertEquals(DiskNotice.PAYMENT, (r(402) as DiskBytes.Failed).notice)
        assertEquals(DiskNotice.TOO_LARGE, (r(413) as DiskBytes.Failed).notice); assertEquals(DiskNotice.FORBIDDEN, (r(403) as DiskBytes.Failed).notice)
        assertEquals(DiskNotice.MISSING, (r(404) as DiskBytes.Failed).notice); assertEquals(DiskNotice.FAILED, (r(200, ByteArray(0)) as DiskBytes.Failed).notice)
        val ok = r(200, byteArrayOf(1, 2)) as DiskBytes.Ready
        assertEquals("a.pdf", ok.name); assertEquals("application/pdf", ok.mime)
    }

    private class FakeApi(val bytes: BytesResult) : BffApi {
        val asked = mutableListOf<String>()
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            asked += path
            return when {
                path.contains("amal=versiyalar") -> ApiResult(200, Json.parseToJsonElement("""{"ok":true,"versiyalar":[{"raqam":3,"bayt":2048,"joriy":true}]}"""))
                else -> ApiResult(200, Json.parseToJsonElement(DiskContractTestData.listing))
            }
        }
        override suspend fun bffBytes(path: String, maxBytes: Long): BytesResult { asked += path; return bytes }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null)
    }

    private class FakeHost(override val modules: Set<String>) : DiskHost {
        val delivered = mutableListOf<Triple<String, Boolean, Int>>(); val modulesOpened = mutableListOf<Pair<String, Long?>>(); val web = mutableListOf<String>()
        override fun deliver(name: String, mime: String, bytes: ByteArray, open: Boolean) { delivered += Triple(name, open, bytes.size) }
        override fun openModule(module: String, objectId: Long?) { modulesOpened += module to objectId }
        override fun openWeb(path: String) { web += path }
    }

    private fun controller(api: FakeApi, host: FakeHost): DiskController {
        val c = DiskController(DiskRepository(api), CoroutineScope(Dispatchers.Unconfined)) { 1L }
        c.host = host
        return c
    }

    private fun <T> eventually(block: () -> T?): T = runBlocking { withTimeout(5_000) { var v = block(); while (v == null) { kotlinx.coroutines.delay(10); v = block() }; v } }

    @Test fun fileCardLoadsVersionsAndDelivers() {
        val api = FakeApi(BytesResult(200, byteArrayOf(1, 2, 3), "application/pdf", "F-2 5.pdf")); val host = FakeHost(setOf("f2"))
        val c = controller(api, host)
        c.select(DiskTab.COMPANY)
        eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.showFile("f41")
        val d = eventually { c.state.value.detail?.takeIf { it.versions != null } }
        assertEquals(listOf(3), d.versions!!.map { it.number })
        c.deliver(null, true)
        eventually { c.state.value.detail?.takeIf { !it.busy && host.delivered.isNotEmpty() } }
        assertEquals(Triple("F-2 5.pdf", true, 3), host.delivered[0]); assertNull(c.state.value.detail!!.notice)
        c.deliver(2, false)
        eventually { c.state.value.detail?.takeIf { !it.busy && host.delivered.size == 2 && it.notice == DiskNotice.SAVED } }
        assertTrue(api.asked.contains("/api/hujjat-maydoni-ol?id=41&v=2"))
        // the screen that made it: this app has "f2" -> in-app; a module the app lacks -> website page
        c.openInSystem()
        assertEquals(listOf("f2" to 80L), host.modulesOpened); assertTrue(host.web.isEmpty())
        val noScreens = FakeHost(emptySet()); c.host = noScreens; c.openInSystem()
        assertEquals(listOf("/admin/f2-tayyorlash?obyekt=80&akt=41"), noScreens.web)
        c.closeFile(); assertNull(c.state.value.detail)
    }

    @Test fun refusalShowsInTheCardAndUserFileHasNoSystemButton() {
        val api = FakeApi(BytesResult(403, null)); val host = FakeHost(setOf("f2"))
        val c = controller(api, host)
        c.select(DiskTab.COMPANY); eventually { c.state.value.takeIf { it.status == DiskController.Status.READY } }
        c.showFile("f42")
        assertNull(c.systemTarget())
        c.deliver(null, true)
        val d = eventually { c.state.value.detail?.takeIf { !it.busy && it.notice != null } }
        assertEquals(DiskNotice.FORBIDDEN, d.notice); assertTrue(host.delivered.isEmpty())
    }

    @Test fun demoFixturesMatchTheServerShape() {
        fun res(n: String) = Json.parseToJsonElement(javaClass.getResourceAsStream("/demo/$n")!!.bufferedReader().readText())
        val l = parseDiskListing(res("disk_company_papka.json"))!!
        assertEquals(2, l.files.size); assertTrue(l.files.all { it.system && diskSystemTarget(it) != null })
        assertEquals(1, parseDiskListing(res("disk_company.json"))!!.folders.count { it.name == "Kompaniya hujjatlari" })
        assertEquals(3, parseDiskVersions(res("disk_versiyalar.json"))!!.size)
        assertEquals(1, parseDiskShared(res("disk_ulashilgan.json"))!!.size)
        assertNotNull(parseDiskListing(res("disk_mine.json"))); assertNotNull(parseDiskListing(res("disk_savat.json")))
    }
}

internal object DiskContractTestData {
    val listing = """{"ok":true,"daraja":4,"kompaniya_id":1,"shaxsiy":false,"yol":[],"papkalar":[],"fayllar":[
        {"id":41,"nom":"F-2 5","mime":"application/pdf","bayt":2048,"versiya":3,"yangilandi":"2026-11-17T10:30:00+00:00","savatda":null,"izohlar":0,"tizim_hujjat":true,"manba_turi":"f2","manba_id":41,"hujjat_kalit":"f2:41","obyekt_id":80,"shartnoma_id":5},
        {"id":42,"nom":"mening.txt","mime":"text/plain","bayt":10,"versiya":1,"yangilandi":"2026-11-17T10:30:00+00:00","savatda":null,"izohlar":0}]}"""
}