package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class Call(val path: String, val method: String, val body: JsonElement?)

private class FakeApi(private val answer: (Call) -> ApiResult) : BffApi {
    val calls = mutableListOf<Call>()
    var avatarBytes: ByteArray? = null
    var avatarStatus = 404
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { val c = Call(path, method, body); calls += c; return answer(c) }
    override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null)
    override suspend fun avatarGet() = BytesResult(avatarStatus, avatarBytes, if (avatarBytes != null) "image/jpeg" else null)
    override suspend fun avatarPut(bytes: ByteArray, mime: String): ApiResult { avatarBytes = bytes; avatarStatus = 200; return ApiResult(200, Json.parseToJsonElement("""{"ok":true}""")) }
    override suspend fun avatarDelete(): ApiResult { avatarBytes = null; avatarStatus = 404; return ApiResult(200, Json.parseToJsonElement("""{"ok":true}""")) }
}

private fun ok(s: String) = ApiResult(200, Json.parseToJsonElement(s))
private fun fail(status: Int, code: String) = ApiResult(status, Json.parseToJsonElement("""{"ok":false,"code":"$code"}"""), code)

class SettingsContractTest {
    private val profile = """{"ok":true,"profil":{"id":7,"login":"a@b.uz","email":"a@b.uz","ism":"Ali Valiyev","telefon":"+998901234567","telefon_tasdiqlangan":true,"til":"uz","avatar_rang":"#3563E9"},
        "sessiya":{"boshlangan":"2026-11-14T08:00:00.000Z","tugaydi":"2027-02-12T08:00:00.000Z"}}"""

    @Test fun profileIsParsedWithSessionWindow() = runBlocking {
        val repo = SettingsRepository(FakeApi { ok(profile) })
        val p = (repo.load() as SettingsResult.Ok).value
        assertEquals("Ali Valiyev", p.name); assertEquals("+998901234567", p.phone); assertTrue(p.phoneVerified); assertEquals("#3563E9", p.avatarColor)
        assertTrue(p.sessionEnd!! > p.sessionStart!!)
        assertEquals(p, repo.profile.value)
    }

    @Test fun updateSendsOnlyTheChangedFields() = runBlocking {
        val api = FakeApi { ok(profile) }
        val repo = SettingsRepository(api)
        repo.update(name = "  Vali  ")
        val b = api.calls.last().body!!.jsonObject
        assertEquals("yangila", b["amal"]!!.jsonPrimitive.content); assertEquals("Vali", b["ism"]!!.jsonPrimitive.content)
        assertFalse(b.containsKey("telefon")); assertFalse(b.containsKey("til"))
        repo.update(phone = ""); assertEquals("", api.calls.last().body!!.jsonObject["telefon"]!!.jsonPrimitive.content)
    }

    @Test fun serverCodesMapToErrors() = runBlocking {
        assertEquals(SettingsError.BAD_NAME, (SettingsRepository(FakeApi { fail(400, "ISM_NOTOGRI") }).update(name = "x") as SettingsResult.Err).error)
        assertEquals(SettingsError.BAD_PHONE, (SettingsRepository(FakeApi { fail(400, "TELEFON_NOTOGRI") }).update(phone = "1") as SettingsResult.Err).error)
        assertEquals(SettingsError.NETWORK, (SettingsRepository(FakeApi { ApiResult(0, null) }).load() as SettingsResult.Err).error)
        assertEquals(SettingsError.UNAUTHORIZED, (SettingsRepository(FakeApi { ApiResult(401, null) }).load() as SettingsResult.Err).error)
        assertEquals(SettingsError.RATE_LIMIT, SettingsRepository.errorOf(429, null))
        assertEquals(SettingsError.NOT_DEPLOYED, SettingsRepository.errorOf(404, "SERVER_YANGILANMAGAN"))
    }

    @Test fun phoneRulesMatchTheServer() {
        assertEquals("+998901234567", ProfileRules.phone(" +998 (90) 123-45-67 "))
        assertNull(ProfileRules.phone("   "))
        assertEquals(ProfileRules.INVALID, ProfileRules.phone("12"))
        assertEquals(ProfileRules.INVALID, ProfileRules.phone("abc12345678"))
        assertTrue(ProfileRules.nameOk("Al")); assertFalse(ProfileRules.nameOk(" A ")); assertFalse(ProfileRules.nameOk("x".repeat(81)))
        assertEquals("AV", ProfileRules.initials("ali valiyev")); assertEquals("A", ProfileRules.initials("ali")); assertEquals("?", ProfileRules.initials("  "))
    }

    @Test fun signOutOthersReturnsTheRenewedDeviceOrSignsOut() = runBlocking {
        val renewed = SettingsRepository(FakeApi { ok("""{"ok":true,"qurilma":{"device_id":"d-1","token":"${"T".repeat(43)}","tugaydi":1900000000000}}""") }) { DeviceInfo("Pixel", "Android 14", "0.1.10") }
        val r = (renewed.signOutOthers() as SettingsResult.Ok).value as SignOutOthers.Renewed
        assertEquals("d-1", r.renewal.deviceId); assertEquals(1900000000000, r.renewal.expires)
        val api = FakeApi { ok("""{"ok":true,"qurilma":null,"code":"QAYTA_KIRISH_KERAK"}""") }
        assertEquals(SignOutOthers.SignedOutHere, (SettingsRepository(api) { DeviceInfo("Pixel", "Android 14", "0.1.10") }.signOutOthers() as SettingsResult.Ok).value)
        val b = api.calls.last().body!!.jsonObject
        assertEquals("boshqa_sessiyalar_chiqish", b["amal"]!!.jsonPrimitive.content); assertEquals("Pixel", b["qurilma_nomi"]!!.jsonPrimitive.content); assertEquals("0.1.10", b["ilova_versiya"]!!.jsonPrimitive.content)
    }

    @Test fun avatarLifecycleAndLimits() = runBlocking {
        val api = FakeApi { ok(profile) }
        val repo = SettingsRepository(api)
        repo.refreshAvatar(); assertNull(repo.avatar.value)
        assertEquals(SettingsError.TOO_LARGE, (repo.uploadAvatar(ByteArray(ProfileRules.AVATAR_MAX_BYTES + 1)) as SettingsResult.Err).error)
        assertEquals(SettingsError.TOO_LARGE, (repo.uploadAvatar(ByteArray(0)) as SettingsResult.Err).error)
        val jpeg = byteArrayOf(1, 2, 3)
        assertTrue(repo.uploadAvatar(jpeg) is SettingsResult.Ok); assertEquals(jpeg.toList(), repo.avatar.value!!.toList())
        assertTrue(repo.removeAvatar() is SettingsResult.Ok); assertNull(repo.avatar.value)
    }

    @Test fun telegramPreferencesRoundTrip() = runBlocking {
        val api = FakeApi { c ->
            if (c.method == "POST") ok("""{"ok":true,"sozlangan":true,"ulangan":true,"bildirishnoma":{"topshiriq":true,"f2":true,"signal":false}}""")
            else ok("""{"ok":true,"sozlangan":true,"ulangan":true,"bot":"qurai_bot","bildirishnoma":{"topshiriq":true,"f2":false,"signal":false}}""")
        }
        val repo = SettingsRepository(api)
        val t = (repo.telegram() as SettingsResult.Ok).value
        assertTrue(t.linked); assertEquals("qurai_bot", t.bot); assertFalse(t.f2)
        assertTrue((repo.setTelegram("f2", true) as SettingsResult.Ok).value.f2)
        val b = api.calls.last().body!!.jsonObject
        assertEquals("sozlama", b["amal"]!!.jsonPrimitive.content); assertEquals("true", b["bildirishnoma"]!!.jsonObject["f2"]!!.jsonPrimitive.content)
        assertEquals(t.copy(f2 = true), t.with("f2", true))
    }

    @Test fun mutedNotificationGroupsAreHiddenAndPersisted() {
        assertEquals(NotifGroup.APPROVALS, NotifKind.REJECTED.group()); assertEquals(NotifGroup.DEADLINES, NotifKind.DEADLINE_PASSED.group()); assertEquals(NotifGroup.OTHER, NotifKind.OTHER.group())
        val items = listOf(NotifKind.APPROVED, NotifKind.LETTER, NotifKind.DRAWING, NotifKind.OTHER)
        assertEquals(items, visibleNotifications(items, emptySet()) { it.group() })
        assertEquals(listOf(NotifKind.APPROVED, NotifKind.OTHER), visibleNotifications(items, setOf(NotifGroup.LETTERS, NotifGroup.DRAWINGS)) { it.group() })
        val s = setOf(NotifGroup.LETTERS, NotifGroup.OTHER)
        assertEquals(s, decodeGroups(encodeGroups(s))); assertEquals(emptySet<NotifGroup>(), decodeGroups(null)); assertEquals(emptySet<NotifGroup>(), decodeGroups("NOPE"))
    }

    @Test fun cropMathStaysInsideTheImageAndFollowsThePan() {
        // 1000x500 image in a 200 px viewport: cover scale = 0.4 (height fills); the visible square is 500 px.
        val centered = AvatarCrop.source(1000, 500, 200f, 1f, 0f, 0f)
        assertEquals(500, centered.size); assertEquals(250, centered.left); assertEquals(0, centered.top)
        // Dragging the image right shows the LEFT part; the pan is clamped so the image still covers the viewport.
        val dragged = AvatarCrop.source(1000, 500, 200f, 1f, 9999f, 0f)
        assertEquals(0, dragged.left)
        val other = AvatarCrop.source(1000, 500, 200f, 1f, -9999f, 0f)
        assertEquals(500, other.left)
        // Zoom 2 halves the visible square; always inside the bitmap.
        val z = AvatarCrop.source(1000, 500, 200f, 2f, 0f, 0f)
        assertEquals(250, z.size)
        for (zoom in listOf(0.2f, 1f, 3f, 9f)) for (p in listOf(-5000f, 0f, 5000f)) {
            val s = AvatarCrop.source(640, 480, 260f, zoom, p, -p)
            assertTrue(s.left >= 0 && s.top >= 0 && s.left + s.size <= 640 && s.top + s.size <= 480 && s.size >= 1)
        }
        assertEquals(1, AvatarCrop.sampleSize(1600, 1200)); assertEquals(4, AvatarCrop.sampleSize(6400, 4800))
    }
}

class NazoratContractTest {
    private val inbox = """{"ok":true,"natija":[
      {"id":31,"aloqa_id":5,"resurs":"f2","nom":"F-2 No 4","oy":"2026-10-01","summa":1284000000,"holat":"yuborilgan","kelgan":true,"qarshi_nom":"Pudratchi MChJ","obyekt_id":101,"obyekt_nom":"Korpus A","taqdim_vaqti":"2026-11-14T09:30:00Z"},
      {"id":30,"resurs":"f2","holat":"qabul","qaror_izoh":null},{"resurs":"f2"},{"id":28,"resurs":"aosr","holat":"ko_rilmoqda"}]}"""

    @Test fun inboxParsesPendingAndDecidedAndSkipsBrokenRows() {
        val items = NazoratRepository.parseInbox(Json.parseToJsonElement(inbox).jsonObject)
        assertEquals(listOf(31L, 30L, 28L), items.map { it.id })
        assertTrue(items[0].pending); assertFalse(items[1].pending); assertTrue(items[2].pending)
        assertEquals("Korpus A", items[0].objectName); assertEquals(1284000000.0, items[0].total!!, 0.0)
    }

    @Test fun f2CheckParsesSummaryAndProblems() {
        val c = NazoratRepository.parseCheck(Json.parseToJsonElement("""{"ok":true,"akt_id":8,"xulosa":{"jami_qator":42,"yashirin_qator":6,"akt_tasdiqlangan":4,"akt_kutmoqda":1,"akt_yoq":1,"fakt_korinadi":true,"hajm_oshgan":2,"fakt_yoq":0},
          "muammolar":[{"qator_id":1,"kod":"E1","nom":"Armatura","birlik":"t","f2_hajm":36.1,"fakt_hajm":35.8,"muammo":"akt_yoq"},"junk"]}""").jsonObject)!!
        assertEquals(42, c.rows); assertEquals(6, c.hidden); assertEquals(1, c.actMissing); assertEquals(2, c.overVolume); assertTrue(c.factVisible)
        assertEquals(1, c.problems.size); assertEquals(36.1, c.problems[0].f2Volume!!, 0.0); assertFalse(c.clean)
        assertNull(NazoratRepository.parseCheck(Json.parseToJsonElement("""{"ok":true}""").jsonObject))
    }

    @Test fun decisionNeedsARemarkUnlessItIsAnAcceptance() {
        assertFalse(remarkIssue(NazoratDecision.ACCEPT, ""))
        assertTrue(remarkIssue(NazoratDecision.REJECT, "  ab ")); assertFalse(remarkIssue(NazoratDecision.REJECT, "abc"))
        assertTrue(remarkIssue(NazoratDecision.CORRECT, ""))
    }

    @Test fun decideSendsTheContractEnvelopeAndRefusesWithoutRemark() = runBlocking {
        val api = FakeApi { ok("""{"ok":true,"id":9,"nazorat_turi":"buyurtmachi_xodimi"}""") }
        val repo = NazoratRepository(api) { "op-1" }
        assertEquals(NazoratError.REMARK_REQUIRED, (repo.decide(8, 31, NazoratDecision.REJECT, " ") as NazoratResult.Err).error)
        assertTrue(api.calls.isEmpty())
        assertTrue(repo.decide(8, 31, NazoratDecision.REJECT, "Armatura qadami noto'g'ri") is NazoratResult.Ok)
        val c = api.calls.single(); assertEquals("/api/tomon", c.path); assertEquals("POST", c.method)
        val b = c.body!!.jsonObject
        assertEquals("nazorat_qaror", b["amal"]!!.jsonPrimitive.content); assertEquals("8", b["kompaniya_id"]!!.jsonPrimitive.content)
        assertEquals("31", b["taqdim_id"]!!.jsonPrimitive.content); assertEquals("rad", b["qaror"]!!.jsonPrimitive.content)
        assertEquals("Armatura qadami noto'g'ri", b["izoh"]!!.jsonPrimitive.content); assertEquals("op-1", b["operation_id"]!!.jsonPrimitive.content)
        api.calls.clear(); repo.decide(8, 31, NazoratDecision.ACCEPT, "")
        assertFalse(api.calls.single().body!!.jsonObject.containsKey("izoh"))
    }

    @Test fun inboxAndCheckUseTheAllowListedTomonSections() = runBlocking {
        val api = FakeApi { c -> if (c.path.contains("f2_tekshiruv")) ok("""{"ok":true,"xulosa":{"jami_qator":1},"muammolar":[]}""") else ok(inbox) }
        val repo = NazoratRepository(api)
        repo.inbox(8)
        assertEquals("/api/tomon?bolim=taqdimlar&kompaniya_id=8&yonalish=kelgan&limit=100", api.calls.last().path)
        val item = NazoratRepository.parseInbox(Json.parseToJsonElement(inbox).jsonObject).first()
        assertTrue((repo.check(8, item) as NazoratResult.Ok).value != null)
        assertEquals("/api/tomon?bolim=f2_tekshiruv&kompaniya_id=8&taqdim_id=31", api.calls.last().path)
        val n = api.calls.size
        assertNull((repo.check(8, item.copy(resource = "aosr")) as NazoratResult.Ok).value); assertEquals(n, api.calls.size)
    }

    @Test fun errorCodesMapForTheUi() {
        assertEquals(NazoratError.STEP_UP, NazoratRepository.errorOf(403, "STEP_UP_KERAK"))
        assertEquals(NazoratError.NO_RIGHT, NazoratRepository.errorOf(403, "ROL_YETARLI_EMAS"))
        assertEquals(NazoratError.WRONG_STATE, NazoratRepository.errorOf(200, "HOLAT"))
        assertEquals(NazoratError.REMARK_REQUIRED, NazoratRepository.errorOf(200, "IZOH_KERAK"))
        assertEquals(NazoratError.SERVER, NazoratRepository.errorOf(502, null))
    }

    @Test fun workspaceAndCatalogOpenTheNativeScreen() {
        val action = WsAction("nazorat", "Texnik nazorat", "nazorat", WsTarget(false, "nazorat", "/admin/nazorat"), false)
        assertEquals(WsOpen.Native(NativeTarget.NAZORAT), action.open())
        assertEquals(NativeTarget.NAZORAT, nativeTargetFor("nazorat"))
    }
}
