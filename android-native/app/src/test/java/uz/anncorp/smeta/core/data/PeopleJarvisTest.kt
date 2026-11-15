package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class PeopleRecorder(private val answer: (String, JsonObject?) -> ApiResult) : BffApi {
    val calls = mutableListOf<Triple<String, String, JsonObject?>>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        calls += Triple(path, method, body as? JsonObject); return answer(path, body as? JsonObject)
    }
    override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
}

private fun pres(text: String, status: Int = 200, code: String? = null) = ApiResult(status, Json.parseToJsonElement(text), code)

class UsernameRulesTest {
    @Test fun normStripsAtTrimsAndLowercases() {
        assertEquals("ali_valiyev", UsernameRules.norm("  @Ali_Valiyev "))
        assertNull(UsernameRules.norm("   "))
        assertNull(UsernameRules.norm("@"))
    }

    @Test fun issuesFollowTheContract() {
        assertEquals(UsernameIssue.TOO_SHORT, UsernameRules.issue("abcd"))
        assertEquals(UsernameIssue.TOO_LONG, UsernameRules.issue("a".repeat(33)))
        assertEquals(UsernameIssue.FORMAT, UsernameRules.issue("ali-valiyev"))
        assertEquals(UsernameIssue.START, UsernameRules.issue("1abcdef"))
        assertEquals(UsernameIssue.START, UsernameRules.issue("_abcdef"))
        assertEquals(UsernameIssue.UNDERSCORE, UsernameRules.issue("ali__valiyev"))
        assertEquals(UsernameIssue.UNDERSCORE, UsernameRules.issue("alivaliyev_"))
        assertNull(UsernameRules.issue("ali_valiyev"))
        assertNull(UsernameRules.issue("a".repeat(32)))
    }

    @Test fun suggestionsAreValidDistinctAndBounded() {
        val s = UsernameRules.suggestions("Ali Valiyev")
        assertTrue(s.containsAll(listOf("ali_valiyev", "alivaliyev", "a_valiyev", "ali_v")))
        assertTrue(s.all { UsernameRules.issue(it) == null })
        assertEquals(s.distinct(), s)
        assertTrue(s.size <= 10)
        // Cyrillic names are transliterated; a single word gets a suffix because "ali" alone is too short.
        assertTrue(UsernameRules.suggestions("Сардор Каримов").contains("sardor_karimov"))
        assertTrue(UsernameRules.suggestions("Ali").all { it.length >= UsernameRules.MIN })
        assertTrue(UsernameRules.suggestions("   ").isEmpty())
    }

    @Test fun verdictIsInstantAndOnlyAsksTheServerForAChangedValidName() {
        assertEquals(UsernameVerdict.Empty, usernameVerdict("", null))
        assertEquals(UsernameVerdict.Invalid(UsernameIssue.TOO_SHORT), usernameVerdict("ab", null))
        assertEquals(UsernameVerdict.Same, usernameVerdict("@Ali_Valiyev", "ali_valiyev"))
        assertEquals(UsernameVerdict.Ask, usernameVerdict("ali_valiyev2", "ali_valiyev"))
    }
}

class LookupTest {
    @Test fun kindIsDetectedFromOneField() {
        assertEquals(LookupKind.USERNAME, Lookup.kind("@ali_valiyev"))
        assertEquals(LookupKind.USERNAME, Lookup.kind("ali_valiyev"))
        assertEquals(LookupKind.EMAIL, Lookup.kind("ali@example.com"))
        assertEquals(LookupKind.PHONE, Lookup.kind("+998 90 123-45-67"))
        assertEquals(LookupKind.PHONE, Lookup.kind("901234567"))
        assertNull(Lookup.kind(""))
        assertNull(Lookup.kind("ab"))
        assertNull(Lookup.kind("hello world"))
    }

    @Test fun valueIsNormalizedLikeTheServer() {
        assertEquals("@ali_valiyev", Lookup.value("Ali_Valiyev"))
        assertEquals("+998901234567", Lookup.value("90 123 45 67"))
        assertEquals("+998901234567", Lookup.value("+998-90-123-45-67"))
        assertEquals("ali@example.com", Lookup.value(" Ali@Example.com "))
        assertNull(Lookup.value("???"))
    }
}

class PeopleRepositoryTest {
    @Test fun usernameCheckSendsVariantsAndParsesTheAnswer() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"yaroqli":true,"sabab":null,"bosh":false,"band":true,"variantlar":["ali_v","a_valiyev"]}""") }
        val r = PeopleRepository(api).check("ali_valiyev", listOf("ali_v", "a_valiyev", "ali_valiyev2")) as PeopleResult.Ok
        assertEquals(UsernameCheck(true, false, true, null, listOf("ali_v", "a_valiyev")), r.value)
        val (path, method, body) = api.calls.single()
        assertEquals("/api/profil", path); assertEquals("POST", method)
        assertEquals("username_tekshir", body!!["amal"]!!.jsonPrimitive.content)
        assertEquals(3, body["variantlar"]!!.jsonArray.size)
    }

    @Test fun setAndRemoveUseOperationIdAndNullClears() = runBlocking {
        val api = PeopleRecorder { _, b -> pres("""{"ok":true,"username":${if (b!!["username"] is kotlinx.serialization.json.JsonNull) "null" else "\"ali_valiyev\""}}""") }
        val repo = PeopleRepository(api) { "op-7" }
        assertEquals("ali_valiyev", (repo.set("ali_valiyev") as PeopleResult.Ok).value)
        assertNull((repo.set(null) as PeopleResult.Ok).value)
        assertEquals("op-7", api.calls[0].third!!["operation_id"]!!.jsonPrimitive.content)
        assertTrue(api.calls[1].third!!["username"] is kotlinx.serialization.json.JsonNull)
    }

    @Test fun mineParsesPrivacyAndRemainingChanges() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"username":"ali_valiyev","ism":"Ali","telefon_qidiruv":"kompaniyadosh","bugun_qoldi":3}""") }
        assertEquals(MyUsername("ali_valiyev", "Ali", PhoneSearch.COWORKERS, 3), (PeopleRepository(api).mine() as PeopleResult.Ok).value)
    }

    @Test fun coworkerSearchNeedsTwoCharsAndNeverCallsTheServerBelowThat() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"royxat":[{"id":31,"ism":"Sardor","username":"sardor_k","avatar_rang":"#fff"},{"id":32,"ism":"Dilnoza","username":null}]}""") }
        val repo = PeopleRepository(api)
        assertEquals(emptyList<PersonProfile>(), (repo.coworkers("s", 5) as PeopleResult.Ok).value)
        assertTrue(api.calls.isEmpty())
        val list = (repo.coworkers(" sa ", 5) as PeopleResult.Ok).value
        assertEquals(listOf(PersonProfile(31, "Sardor", "sardor_k", "#fff"), PersonProfile(32, "Dilnoza", null)), list)
        assertEquals("sa", api.calls.single().third!!["prefiks"]!!.jsonPrimitive.content)
        assertEquals("5", api.calls.single().third!!["kompaniya_id"]!!.jsonPrimitive.content)
    }

    @Test fun inviteGoesToCompanyMemberInviteWithTheAutoDetectedValue() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"taklif_id":55,"holat":"kutmoqda","profil":{"id":31,"ism":"Sardor","username":"sardor_k"}}""") }
        val repo = PeopleRepository(api)
        val sent = (repo.invite(8, "Sardor_K", "pto") as PeopleResult.Ok).value
        assertEquals(55L, sent.id); assertEquals("sardor_k", sent.profile!!.username)
        val (path, _, body) = api.calls.single()
        assertEquals("/api/company", path)
        assertEquals("member_invite", body!!["action"]!!.jsonPrimitive.content)
        assertEquals("@sardor_k", body["qiymat"]!!.jsonPrimitive.content)
        assertEquals("pto", body["rol"]!!.jsonPrimitive.content)
        assertEquals(PeopleResult.Err(PeopleError.BAD_VALUE), repo.invite(8, "???", "pto"))
        assertEquals(1, api.calls.size)
    }

    @Test fun notFoundCarriesThePhoneFallback() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":false,"code":"TOPILMADI","tur":"telefon","telefon_taklif":true,"telefon":"+998901234567"}""", 404, "TOPILMADI") }
        val e = PeopleRepository(api).invite(8, "+998901234567", "pto") as PeopleResult.Err
        assertEquals(PeopleError.NOT_FOUND, e.error); assertTrue(e.phoneInvite); assertEquals("+998901234567", e.phone)
    }

    @Test fun phoneInviteUsesKirishTaklifYarat() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"kod":"48213907","havola":"https://x.test/taklif/T"}""") }
        val c = (PeopleRepository(api).phoneInvite(8, " Ali ", "+998901234567", "prorab") as PeopleResult.Ok).value
        assertEquals(PhoneInviteCode("48213907", "https://x.test/taklif/T"), c)
        val (path, _, body) = api.calls.single()
        assertEquals("/api/kirish-taklif", path)
        assertEquals("yarat", body!!["amal"]!!.jsonPrimitive.content)
        assertEquals("Ali", body["ism"]!!.jsonPrimitive.content)
    }

    @Test fun incomingInvitesAndAnswers() = runBlocking {
        val api = PeopleRecorder { _, b ->
            if (b!!["amal"]!!.jsonPrimitive.content == "taklif_royxat")
                pres("""{"ok":true,"royxat":[{"id":71,"kompaniya_id":9,"kompaniya_nom":"Demo","rol":"prorab","tugaydi":1900000000000,"taklif_qiluvchi":{"id":31,"ism":"Sardor","username":"sardor_k"}}]}""")
            else pres("""{"ok":true,"holat":"qabul","kompaniya_id":9,"rol":"prorab"}""")
        }
        val repo = PeopleRepository(api) { "op-9" }
        val inv = (repo.invites() as PeopleResult.Ok).value.single()
        assertEquals(CompanyInvite(71, 9, "Demo", "prorab", 1900000000000L, PersonProfile(31, "Sardor", "sardor_k")), inv)
        assertEquals(InviteAnswer(true, 9, "prorab"), (repo.answer(71, true) as PeopleResult.Ok).value)
        val b = api.calls.last().third!!
        assertEquals("71", b["taklif_id"]!!.jsonPrimitive.content); assertEquals("true", b["qabul"]!!.jsonPrimitive.content)
    }

    @Test fun usernamesForMemberListsIgnoreFailures() = runBlocking {
        val ok = PeopleRepository(PeopleRecorder { _, _ -> pres("""{"ok":true,"username":{"31":"sardor_k","x":"bad"}}""") })
        assertEquals(mapOf(31L to "sardor_k"), ok.usernames(listOf(31, 32)))
        assertEquals(emptyMap<Long, String>(), PeopleRepository(PeopleRecorder { _, _ -> ApiResult(0, null) }).usernames(listOf(1)))
        assertEquals(emptyMap<Long, String>(), ok.usernames(emptyList()))
    }

    @Test fun errorCodesMapToKinds() {
        fun e(code: String?, status: Int) = PeopleRepository.errorOf(ApiResult(status, code?.let { Json.parseToJsonElement("""{"ok":false,"code":"$it"}""") }, code))
        assertEquals(PeopleResult.Err(PeopleError.FORMAT, UsernameIssue.TOO_SHORT), e("USERNAME_QISQA", 400))
        assertEquals(PeopleResult.Err(PeopleError.FORMAT, UsernameIssue.RESERVED), e("USERNAME_BAND_SOZ", 400))
        assertEquals(PeopleError.TAKEN, e("USERNAME_BAND", 409).error)
        assertEquals(PeopleError.LIMIT, e("USERNAME_LIMIT", 429).error)
        assertEquals(PeopleError.LIMIT, e("LIMIT", 429).error)
        assertEquals(PeopleError.ALREADY_MEMBER, e("ALREADY_MEMBER", 409).error)
        assertEquals(PeopleError.NO_RIGHT, e("AUTHORIZATION_DENIED", 403).error)
        assertEquals(PeopleError.INVITE_EXPIRED, e("TAKLIF_MUDDATI_OTGAN", 400).error)
        assertEquals(PeopleError.INVITE_INVALID, e("TAKLIF_YAROQSIZ", 400).error)
        assertEquals(PeopleError.INVITE_GONE, e("TAKLIF_TOPILMADI", 404).error)
        assertEquals(PeopleError.NOT_DEPLOYED, e("SERVER_YANGILANMAGAN", 404).error)
        // An undeployed endpoint (unknown action, no known code) and a hard 5xx are told apart.
        assertEquals(PeopleError.NOT_DEPLOYED, e(null, 400).error)
        assertEquals(PeopleError.SERVER, e(null, 500).error)
    }

    @Test fun networkAndUnauthorizedAreReported() = runBlocking {
        assertEquals(PeopleResult.Err(PeopleError.NETWORK), PeopleRepository(PeopleRecorder { _, _ -> ApiResult(0, null) }).mine())
        assertEquals(PeopleResult.Err(PeopleError.UNAUTHORIZED), PeopleRepository(PeopleRecorder { _, _ -> ApiResult(401, null) }).invites())
    }

    @Test fun featureFlagIsOffByDefault() = assertFalse(Features.USERNAME)
}

class JarvisRepositoryTest {
    @Test fun answerIsTakenFromJavobAndLocalIsFlagged() {
        assertEquals(JarvisResult.Answer("Salom", false), JarvisRepository.map(pres("""{"ok":true,"javob":" Salom ","provider":"openrouter"}""")))
        assertEquals(JarvisResult.Answer("Salom", true), JarvisRepository.map(pres("""{"ok":true,"javob":"Salom","provider":"local"}""")))
        assertTrue(JarvisRepository.map(pres("""{"ok":true,"javob":""}""")) is JarvisResult.Server)
    }

    @Test fun budgetErrorIs402AndKeepsTheServerMessage() {
        assertEquals(JarvisResult.Budget("Tokenlar tugadi"), JarvisRepository.map(pres("""{"ok":false,"xabar":"Tokenlar tugadi","code":"X"}""", 402, "X")))
        assertEquals(JarvisResult.Budget(null), JarvisRepository.map(ApiResult(402, null)))
    }

    @Test fun otherFailuresAreDistinct() {
        assertEquals(JarvisResult.Network, JarvisRepository.map(ApiResult(0, null)))
        assertEquals(JarvisResult.Context("Kompaniyani tanlang"), JarvisRepository.map(pres("""{"ok":false,"xabar":"Kompaniyani tanlang"}""", 422)))
        assertEquals(JarvisResult.Context(null), JarvisRepository.map(ApiResult(403, null)))
        assertEquals(JarvisResult.Server("Xato"), JarvisRepository.map(pres("""{"ok":false,"xabar":"Xato"}""", 500)))
    }

    @Test fun askUsesTheAgentIshChatWithHistoryAndObject() = runBlocking {
        val api = PeopleRecorder { _, _ -> pres("""{"ok":true,"javob":"Ha"}""") }
        val repo = JarvisRepository(api)
        val hist = listOf(ChatMsg(true, "amfiteatr obyektim haqida malumot ber"), ChatMsg(false, "Smeta: ..."))
        assertEquals(JarvisResult.Answer("Ha", false), repo.ask("  nakrutka va QQS bilan qancha  ", 8, hist, 42))
        val (path, method, body) = api.calls.single()
        assertEquals("/api/agent-ish", path); assertEquals("POST", method)
        assertEquals("kasb_savol", body!!["amal"]!!.jsonPrimitive.content)
        assertEquals("nakrutka va QQS bilan qancha", body["savol"]!!.jsonPrimitive.content)
        assertEquals("8", body["kompaniya_id"]!!.jsonPrimitive.content)
        assertEquals("42", body["obyekt_id"]!!.jsonPrimitive.content)
        val tarix = body["tarix"]!!.jsonArray
        assertEquals(2, tarix.size)
        assertEquals("user", tarix[0].jsonObject["rol"]!!.jsonPrimitive.content)
        assertEquals("assistant", tarix[1].jsonObject["rol"]!!.jsonPrimitive.content)
        assertTrue(repo.ask("   ", 8) is JarvisResult.Context)
        assertEquals(1, api.calls.size)
        repo.ask("x".repeat(5000), null)
        val last = api.calls.last().third!!
        assertEquals(JarvisRepository.MAX_QUESTION, last["savol"]!!.jsonPrimitive.content.length)
        assertFalse(last.containsKey("kompaniya_id")); assertFalse(last.containsKey("obyekt_id")); assertFalse(last.containsKey("tarix"))
    }

    @Test fun historyIsLimitedToTheLastSixNonBlankTurns() {
        val h = (1..10).map { ChatMsg(it % 2 == 1, "m$it") } + ChatMsg(true, "   ")
        val j = JarvisRepository.historyJson(h)
        assertEquals(6, j.size)
        assertEquals("m5", j.first().jsonObject["matn"]!!.jsonPrimitive.content)
        assertEquals("m10", j.last().jsonObject["matn"]!!.jsonPrimitive.content)
    }

    @Test fun localModelMarkerAndAgentIshErrorTextAreRecognised() {
        assertEquals(JarvisResult.Answer("Summa", true), JarvisRepository.map(pres("""{"ok":true,"javob":"Summa","model":"local"}""")))
        assertEquals(JarvisResult.Budget("Limit"), JarvisRepository.map(pres("""{"ok":false,"error":"Limit"}""", 402)))
        assertEquals(JarvisResult.Context("Kompaniyani tanlang"), JarvisRepository.map(pres("""{"ok":false,"error":"Kompaniyani tanlang"}""", 422)))
    }

    @Test fun serverChatsAreListedOpenedAndSavedLikeTheWeb() = runBlocking {
        val api = PeopleRecorder { _, body ->
            when (body!!["amal"]!!.jsonPrimitive.content) {
                "suhbat_royxat" -> pres("""{"ok":true,"royxat":[{"id":"a1","sarlavha":"Birinchi","yangilandi":"2026-11-15T10:00:00+00:00","toliq":true}]}""")
                "suhbat_ol" -> pres("""{"ok":true,"sarlavha":"Birinchi","xabarlar":[{"r":"user","m":"salom"},{"r":"ai","m":"Salom!"}]}""")
                else -> pres("""{"ok":true}""")
            }
        }
        val repo = JarvisRepository(api)
        assertEquals(listOf(ChatInfo("a1", "Birinchi", "2026-11-15T10:00:00+00:00")), repo.chats(8))
        assertEquals(listOf(ChatMsg(true, "salom"), ChatMsg(false, "Salom!")), repo.openChat(8, "a1"))
        assertEquals("a1", api.calls[1].third!!["klient_id"]!!.jsonPrimitive.content)
        assertTrue(repo.saveChat(8, "a1", listOf(ChatMsg(true, "  salom \n dunyo "), ChatMsg(false, "Salom!"))))
        val save = api.calls.last().third!!
        assertEquals("suhbat_saqla", save["amal"]!!.jsonPrimitive.content)
        assertEquals("salom dunyo", save["sarlavha"]!!.jsonPrimitive.content)
        assertEquals("user", save["xabarlar"]!!.jsonArray[0].jsonObject["r"]!!.jsonPrimitive.content)
        assertEquals("ai", save["xabarlar"]!!.jsonArray[1].jsonObject["r"]!!.jsonPrimitive.content)
        assertFalse(repo.saveChat(8, "a1", listOf(ChatMsg(false, "faqat javob"))))   // nothing to title the chat with
    }

    @Test fun chatFailuresAreNullNotEmpty() {
        assertNull(JarvisRepository.parseChats(ApiResult(500, null)))
        assertNull(JarvisRepository.parseChats(pres("""{"ok":false}""")))
        assertNull(JarvisRepository.parseMessages(ApiResult(0, null)))
        assertEquals(listOf(ChatMsg(false, "Qisqa")), JarvisRepository.parseMessages(pres("""{"ok":true,"qisqartma":"Qisqa","xabarlar":null}""")))
    }
}
class JarvisModuleTest {
    @Test fun hubListsJarvisWithCompanyReadAndHidesItOtherwise() {
        assertTrue(ModuleCatalog.visible(setOf("company.read"), emptySet()).any { it.code == "jarvis" && it.target == NativeTarget.JARVIS })
        assertFalse(ModuleCatalog.visible(setOf("fakt.read"), emptySet()).any { it.code == "jarvis" })
    }
}
