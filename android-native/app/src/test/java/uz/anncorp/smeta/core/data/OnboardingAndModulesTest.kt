package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.feature.signup.SignUpRules

private class Recorder(private val answer: (String, String) -> ApiResult) : BffApi {
    val calls = mutableListOf<Triple<String, String, JsonElement?>>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { calls += Triple(path, method, body); return answer(path, method) }
    override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
}

private fun res(text: String, status: Int = 200, code: String? = null) = ApiResult(status, Json.parseToJsonElement(text), code)

class OnboardingTest {
    @Test fun inviteCodeAcceptsLinkOrBareCodeLikeTheWebsite() {
        assertEquals("AB12-CD", parseInviteCode("  ab12-cd "))
        assertEquals("XYZ789", parseInviteCode("https://smeta-tizimi.pages.dev/qoshil/xyz789?utm=1"))
        assertEquals("ABC123", parseInviteCode("abc 123!"))
    }

    @Test fun inviteTokenOnlyFromTaklifLinks() {
        val t = "A".repeat(24)
        assertEquals(t, parseInviteToken("https://x.test/taklif/$t"))
        assertNull(parseInviteToken("https://x.test/taklif/short"))
        assertNull(parseInviteToken("12345678"))
    }

    @Test fun createSendsOziOchWithOperationIdAndOptionalInn() = runBlocking {
        val api = Recorder { _, _ -> res("""{"ok":true,"kompaniya_id":42}""") }
        val r = CompanyRepository(api) { "op-1" }.create("  Test Qurilish  ", "")
        assertEquals(OnboardResult.Done(42), r)
        val (path, method, body) = api.calls.single()
        assertEquals("/api/company", path); assertEquals("POST", method)
        val o = body as JsonObject
        assertEquals("ozi_och", o["action"]!!.jsonPrimitive.content)
        assertEquals("Test Qurilish", o["nom"]!!.jsonPrimitive.content)
        assertEquals("op-1", o["operation_id"]!!.jsonPrimitive.content)
        assertFalse(o.containsKey("inn"))
    }

    @Test fun createMapsServerCodesAndRejectsShortNamesLocally() = runBlocking {
        fun repo(code: String, status: Int = 409) = CompanyRepository(Recorder { _, _ -> res("""{"ok":false,"code":"$code"}""", status, code) })
        assertEquals(OnboardResult.Failed(OnboardError.NAME_SHORT), CompanyRepository(Recorder { _, _ -> error("no call") }).create("A", null))
        assertEquals(OnboardResult.Failed(OnboardError.INN_TAKEN), repo("INN_BAND").create("Test", "123456789"))
        assertEquals(OnboardResult.Failed(OnboardError.ALREADY_OWN), repo("OZI_OCHILGAN").create("Test", null))
        assertEquals(OnboardResult.Failed(OnboardError.INN_INVALID), repo("INN_INVALID", 400).create("Test", "12"))
        assertEquals(OnboardResult.Failed(OnboardError.NETWORK), CompanyRepository(Recorder { _, _ -> ApiResult(0, null) }).create("Test", null))
    }

    @Test fun joinSendsNormalisedCodeAndMapsFailures() = runBlocking {
        val api = Recorder { _, _ -> res("""{"ok":true,"kompaniya_id":7}""") }
        assertEquals(OnboardResult.Done(7), CompanyRepository(api) { "op-2" }.join("https://x.test/qoshil/abc-123"))
        val b = api.calls.single().third as JsonObject
        assertEquals("qoshil", b["amal"]!!.jsonPrimitive.content); assertEquals("ABC-123", b["kod"]!!.jsonPrimitive.content)
        fun failing(code: String) = CompanyRepository(Recorder { _, _ -> res("""{"ok":false,"code":"$code"}""", 400, code) })
        assertEquals(OnboardResult.Failed(OnboardError.CODE_INVALID), failing("TAKLIF_YAROQSIZ").join("ABCD"))
        assertEquals(OnboardResult.Failed(OnboardError.CODE_EXPIRED), failing("TAKLIF_MUDDATI_OTGAN").join("ABCD"))
        assertEquals(OnboardResult.Failed(OnboardError.CODE_FULL), failing("TAKLIF_TOLDI").join("ABCD"))
        assertEquals(OnboardResult.Failed(OnboardError.CODE_INVALID), CompanyRepository(Recorder { _, _ -> error("no call") }).join("ab"))
    }

    @Test fun signUpRulesMirrorTheServer() {
        assertTrue(SignUpRules.emailOk("a@b.uz")); assertFalse(SignUpRules.emailOk("a@b"))
        assertTrue(SignUpRules.codeOk("123456")); assertFalse(SignUpRules.codeOk("12345"))
        assertTrue(SignUpRules.passwordOk("12345678")); assertFalse(SignUpRules.passwordOk("1234567"))
        assertTrue(SignUpRules.inviteCodeOk("1234 5678")); assertFalse(SignUpRules.inviteCodeOk("1234567"))
    }

    @Test fun signUpErrorsMapTheSharedServerCodes() {
        assertEquals(AuthError.ACCOUNT_EXISTS, signUpError(400, "EMAIL_BAND"))
        assertEquals(AuthError.CODE_WRONG, signUpError(400, "KOD_NOTOGRI"))
        assertEquals(AuthError.RATE_LIMITED, signUpError(400, "KOD_URINISH_LIMITI"))
        assertEquals(AuthError.WEAK_PASSWORD, signUpError(400, "PAROL_OSON"))
        assertEquals(AuthError.INVITE_BAD, signUpError(400, "TAKLIF_RAD"))
        assertEquals(AuthError.INVITE_ACCOUNT_EXISTS, signUpError(409, "HISOB_BOR"))
        assertEquals(AuthError.EMAIL_OFF, signUpError(503, "EMAIL_XIZMATI_SOZLANMAGAN"))
        assertEquals(AuthError.NETWORK, signUpError(0, null))
    }
}

class ModulesTest {
    private fun codes(l: List<ModuleDef>) = l.map { it.code }

    @Test fun unknownPermissionsShowEverythingExceptFlaggedOffModules() {
        val all = ModuleCatalog.visible(null, emptySet())
        assertFalse("warehouse is behind a feature flag", "ombor" in codes(all))
        assertTrue("fakt" in codes(all) && "moliya" in codes(all))
    }

    @Test fun permissionsGateModulesLikeTheWebsite() {
        val worker = ModuleCatalog.visible(setOf("company.read", "fakt.read", "smeta.read"), emptySet())
        assertTrue("fakt" in codes(worker) && "foto" in codes(worker) && "obyektlar" in codes(worker) && "tasdiq" in codes(worker))
        assertFalse("moliya" in codes(worker)); assertFalse("buxgalteriya" in codes(worker)); assertFalse("f2" in codes(worker))
        val boss = ModuleCatalog.visible(setOf("control.company.read"), emptySet())
        assertTrue("moliya" in codes(boss) && "kompaniya" in codes(boss) && "hisobot" in codes(boss))
    }

    @Test fun companySwitchedOffModulesDisappear() {
        val boss = setOf("control.company.read")
        assertTrue("hr" in codes(ModuleCatalog.visible(boss, emptySet())))
        assertFalse("hr" in codes(ModuleCatalog.visible(boss, setOf("module.hr"))))
        assertFalse("buxgalteriya" in codes(ModuleCatalog.visible(boss, setOf("module.moliya"))))
    }

    @Test fun moduleCodesAreValidForTheServerAndUnique() {
        val re = Regex("^[a-z0-9_.]{2,40}$")
        assertTrue(ModuleCatalog.all.all { re.matches(it.code) })
        assertEquals(ModuleCatalog.all.size, ModuleCatalog.all.map { it.code }.toSet().size)
        assertTrue(ModuleCatalog.all.filter { it.kind == ModuleKind.WEB }.all { it.webPath!!.startsWith("/admin") })
    }

    @Test fun pinsOrderAndMoveWork() {
        var p = Picks().toggle("fakt").toggle("foto").toggle("f2")
        assertEquals(listOf("fakt", "foto", "f2"), p.pinned)
        p = p.move("f2", -1)
        val vis = ModuleCatalog.all.filter { it.code in setOf("obyektlar", "fakt", "foto", "f2") }
        val a = arrange(vis, p, "") { it.code }
        assertEquals(listOf("fakt", "f2", "foto"), a.pinned.map { it.code })
        assertEquals(listOf("obyektlar"), a.others.map { it.code })
        assertEquals(p, p.move("fakt", -1)) // already first
        assertEquals(listOf("fakt", "foto"), p.toggle("f2").pinned.filter { it != "f2" })
    }

    @Test fun searchFiltersByLocalizedTitle() {
        val vis = ModuleCatalog.all.filter { it.code in setOf("obyektlar", "fakt", "foto") }
        val titles = mapOf("obyektlar" to "Obyektlar", "fakt" to "Fakt", "foto" to "Foto")
        val a = arrange(vis, Picks(listOf("foto")), "fa") { titles[it.code]!! }
        assertEquals(emptyList<String>(), a.pinned.map { it.code })
        assertEquals(listOf("fakt"), a.others.map { it.code })
    }

    @Test fun permissionsAndOffModulesParseFromServerShapes() {
        val me = Json.parseToJsonElement("""{"ok":true,"context_kompaniyalar":[{"kompaniya_id":5,"permissions":["a","b"]},{"kompaniya_id":8,"permissions":["c"]}]}""")
        assertEquals(setOf("c"), ModulesRepository.permissionsFrom(me, 8))
        assertNull(ModulesRepository.permissionsFrom(me, 99))
        val off = Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"modullar":[{"kod":"module.hr","holat":"off"},{"kod":"module.moliya","holat":"on"}]}}""")
        assertEquals(setOf("module.hr"), ModulesRepository.offModulesFrom(off))
    }

    private class Store : PicksStore { val m = mutableMapOf<Long, Picks>(); override fun get(companyId: Long) = m[companyId]; override fun put(companyId: Long, picks: Picks) { m[companyId] = picks } }

    @Test fun picksFallBackToLocalWhenTheServerEndpointIsMissing() = runBlocking {
        val store = Store().also { it.put(3, Picks(listOf("fakt"), listOf("fakt"), 2)) }
        val repo = ModulesRepository(Recorder { _, _ -> ApiResult(404, null) }, Json, store)
        assertEquals(listOf("fakt"), repo.picks(3).pinned)
    }

    @Test fun picksSyncFromServerAndSaveRetriesOnceOnStaleVersion() = runBlocking {
        var posts = 0
        val api = Recorder { _, method ->
            if (method == "GET") res("""{"ok":true,"tanlangan":["foto"],"tartib":["foto"],"versiya":4}""")
            else if (posts++ == 0) res("""{"ok":false,"code":"STALE_VERSION","versiya":6}""", 409, "STALE_VERSION") else res("""{"ok":true,"versiya":7}""")
        }
        val store = Store(); val repo = ModulesRepository(api, Json, store)
        val got = repo.picks(3)
        assertEquals(4, got.version); assertEquals(got, store.get(3))
        val saved = repo.save(3, got.toggle("fakt"))
        assertEquals(7, saved.version)
        val bodies = api.calls.filter { it.second == "POST" }.map { (it.third as JsonObject) }
        assertEquals(4, bodies[0]["expected_version"]!!.jsonPrimitive.content.toInt())
        assertEquals(6, bodies[1]["expected_version"]!!.jsonPrimitive.content.toInt())
        assertEquals(listOf("foto", "fakt"), bodies[1]["tanlangan"]!!.jsonArray.map { it.jsonPrimitive.content })
    }

    @Test fun picksSurviveOfflineSaveLocally() = runBlocking {
        val store = Store(); val repo = ModulesRepository(Recorder { _, _ -> ApiResult(0, null) }, Json, store)
        repo.save(3, Picks(listOf("fakt")))
        assertEquals(listOf("fakt"), store.get(3)!!.pinned)
    }

    @Test fun picksAndRecentEncodingRoundTrips() {
        val p = Picks(listOf("a1", "b2"), listOf("b2", "a1"), 3)
        assertEquals(p, decodePicks(encodePicks(p)))
        assertEquals(Picks(), decodePicks(encodePicks(Picks())))
        assertEquals(listOf(5L, 1L, 2L), pushRecentId(listOf(1L, 2L), 5L))
        assertEquals(listOf(3L, 1L, 2L), pushRecentId(listOf(1, 2, 3), 3))
        assertEquals(5, pushRecentId(listOf(1, 2, 3, 4, 5), 9).size)
        assertEquals(listOf(1L, 2L), decodeIds("1,2,x"))
    }
}
