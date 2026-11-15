package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApprovalsTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(name: String) = checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/$name")) { name }.bufferedReader().readText()
    private fun parse(s: String) = json.parseToJsonElement(s)

    @Test fun inboxMapsTheWebShape() {
        val items = parseInbox(parse(res("inbox.json")))!!
        assertEquals(2, items.size)
        assertEquals(7L, items[0].id); assertEquals("f2", items[0].tur); assertFalse(items[0].kechikkan)
        assertTrue(items[1].kechikkan)
        assertEquals(2, inboxCount(parse(res("inbox.json"))))
    }

    @Test fun inboxAcceptsTheWrappedFormAndRejectsErrors() {
        assertEquals(1, parseInbox(parse("""{"ok":true,"natija":{"zanjirlar":[{"id":3,"hujjat_turi":"f2","sarlavha":"S"}],"sanoq":{"zanjir":1}}}"""))!!.size)
        assertNull(parseInbox(parse("""{"ok":false,"code":"AZO_EMAS"}""")))
        assertNull(parseInbox(parse("""{"ok":true}""")))
    }

    @Test fun detailKnowsMyTurnAndStepToken() {
        val d = parseZanjir(parse(res("zanjir7.json")))!!
        assertEquals("t2_akt", d.manbaJadval); assertEquals(501L, d.manbaId); assertEquals(101L, d.obyektId)
        assertTrue(d.myTurn); assertEquals(2, d.myStep!!.tartib); assertEquals("1-2", d.stepToken)
        val finished = d.copy(holat = "tasdiqlandi")
        assertFalse(finished.myTurn); assertNull(finished.stepToken)       // a closed chain can never be decided
    }

    @Test fun decisionPayloadsSendCommentsOnlyWhenGiven() {
        assertEquals("""{"amal":"zanjir_qaror","kompaniya_id":8,"zanjir_id":7,"qaror":"tasdiqlash"}""", decisionPayload(8, 7, Decision.APPROVE, null).toString())
        assertEquals("""{"amal":"zanjir_qaror","kompaniya_id":8,"zanjir_id":7,"qaror":"rad","izoh":"hajm noto'g'ri"}""", decisionPayload(8, 7, Decision.REJECT, "  hajm noto'g'ri ").toString())
        assertEquals("qaytarish", decisionPayload(8, 7, Decision.RETURN, "x")["qaror"].str())
        assertTrue(Decision.REJECT.needsComment && Decision.RETURN.needsComment && !Decision.APPROVE.needsComment)
    }

    private fun r(status: Int, body: String? = null, code: String? = null) = ApiResult(status, body?.let { parse(it) }, code)

    @Test fun serverAnswersMapToClearOutcomes() {
        assertEquals(DecisionResult.Done, decisionResult(r(200, """{"ok":true,"holat":"tasdiqlandi"}""")))
        assertEquals(DecisionResult.Error(DecisionError.NOT_YOUR_TURN, "NAVBAT_EMAS"), decisionResult(r(200, """{"ok":false,"code":"NAVBAT_EMAS"}""", "NAVBAT_EMAS")))
        assertEquals(DecisionError.ROLE, (decisionResult(r(403, """{"ok":false,"code":"ROL_YETARLI_EMAS"}""", "ROL_YETARLI_EMAS")) as DecisionResult.Error).kind)
        assertEquals(DecisionError.FORBIDDEN, (decisionResult(r(403, """{"ok":false,"code":"AZO_EMAS"}""", "AZO_EMAS")) as DecisionResult.Error).kind)
        assertEquals(DecisionError.FORBIDDEN, (decisionResult(r(403, null)) as DecisionResult.Error).kind)
        assertEquals(DecisionError.OFFLINE, (decisionResult(ApiResult(0, null)) as DecisionResult.Error).kind)
        assertEquals(DecisionError.FAILED, (decisionResult(r(200, """{"ok":false,"code":"X"}""", "X")) as DecisionResult.Error).kind)
        assertEquals(DecisionError.FAILED, (decisionResult(r(502, null)) as DecisionResult.Error).kind)
    }

    private class FakeApi(private val chain: () -> String) : BffApi {
        val posts = mutableListOf<JsonObject>(); var answer: ApiResult = ApiResult(200, buildJsonObject { put("ok", true) })
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            if (method == "POST") { posts += body as JsonObject; return answer }
            return ApiResult(200, Json.parseToJsonElement(chain()))
        }
        override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
    }

    @Test fun decidingRereadsTheChainAndNeverSendsWhenItChanged() = runBlocking {
        val api = FakeApi { res("zanjir7.json") }
        val repo = ApprovalsRepository(api)
        assertEquals(DecisionResult.Done, repo.decide(8, 7, "1-2", Decision.APPROVE, null))
        assertEquals(1, api.posts.size)
        // someone resubmitted: the step the person saw is no longer the open one
        assertEquals(DecisionResult.Error(DecisionError.CHANGED), repo.decide(8, 7, "1-9", Decision.APPROVE, null))
        assertEquals(1, api.posts.size)
        // chain closed or not my turn
        val closed = FakeApi { res("zanjir7.json").replace("\"jarayonda\"", "\"tasdiqlandi\"") }
        assertEquals(DecisionResult.Error(DecisionError.NOT_YOUR_TURN), ApprovalsRepository(closed).decide(8, 7, "1-2", Decision.REJECT, "x"))
        assertTrue(closed.posts.isEmpty())
    }

    @Test fun raceLostAtTheServerShowsTheClearMessage() = runBlocking {
        val api = FakeApi { res("zanjir7.json") }
        api.answer = ApiResult(200, buildJsonObject { put("ok", false); put("code", "NAVBAT_EMAS") }, "NAVBAT_EMAS")
        assertEquals(DecisionError.NOT_YOUR_TURN, (ApprovalsRepository(api).decide(8, 7, "1-2", Decision.APPROVE, null) as DecisionResult.Error).kind)
    }

    @Test fun detailCombinesChainDocumentAndObjectName() = runBlocking {
        val api = object : BffApi {
            override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult = when {
                path.contains("bolim=zanjir") -> ApiResult(200, parse(res("zanjir7.json")))
                else -> ApiResult(200, parse(res("akt501.json")))
            }
            override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
        }
        val (r, d, doc) = ApprovalsRepository(api) { "Demo korpus A" }.detail(8, 7)
        assertEquals(SyncResult.Ok, r); assertEquals(7L, d!!.id)
        assertEquals("f2", doc!!.tur); assertEquals("F2-0012", doc.raqam); assertEquals("Demo korpus A", doc.obyekt); assertEquals("2026-10", doc.sana)
        assertEquals(396396000.0, doc.jami!!, 0.0)
    }

    @Test fun notificationsAndMarkRead() {
        val n = parseNotifications(parse(res("notes.json")))!!
        assertEquals(5, n.items.size); assertEquals(2, n.unread)
        assertFalse(n.items[0].oqildi); assertTrue(n.items[2].oqildi)
        assertEquals(NotifKind.APPROVAL_WAITING, notifKind(n.items[0].mavzu))
        assertEquals(NotifKind.OTHER, notifKind("yangi.mavzu"))
        assertEquals("""{"amal":"bildirishnoma_oqildi","idlar":[31,30]}""", markReadPayload(listOf(31, 30)).toString())
    }

    @Test fun todayIsRoleAware() = runBlocking {
        val seen = mutableListOf<String>()
        val api = object : BffApi {
            override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
                seen += if (path.startsWith("/api/sb")) "sb:" + (body as JsonObject)["filtr"].str() else path
                return when {
                    path.contains("kiruvchi") -> ApiResult(200, parse(res("inbox.json")))
                    path.contains("bildirishnomalar") -> ApiResult(200, parse(res("notes.json")))
                    (body as? JsonObject)?.get("filtr").str()!!.contains("tur=eq.f2") -> ApiResult(200, parse("""{"ok":true,"soni":1,"jamiServerda":3,"qatorlar":[]}"""))
                    else -> ApiResult(200, parse("""{"ok":true,"soni":5,"qatorlar":[]}"""))
                }
            }
            override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
        }
        val exec = TodayRepository(api).load(8, "pto")
        assertEquals(2, exec.approvals); assertEquals(3, exec.f2Drafts); assertEquals(5, exec.faktDrafts); assertEquals(2, exec.unread); assertEquals(5, exec.notifications.size)
        seen.clear()
        val field = TodayRepository(api).load(8, "usta")
        assertNull(field.f2Drafts); assertNull(field.faktDrafts)            // same as the bot: draft counters are for executive roles only
        assertTrue(seen.none { it.startsWith("sb:") })
        assertTrue(isExecutive("ADMIN")); assertFalse(isExecutive("usta"))
    }
}
