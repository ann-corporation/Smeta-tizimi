package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.RequestBody
import org.junit.Test

class UnitsAccessTest {
    @Test fun unitsFoldToOneCyrillicSpelling() {
        assertEquals("\u043c3", displayUnit("m3"))
        assertEquals("\u043c3", displayUnit("\u043c3"))
        assertEquals("\u043c3", displayUnit("M\u00b3"))
        assertEquals("\u043a\u0433", displayUnit("kg"))
        assertEquals("", displayUnit(null))
        assertEquals("noma", displayUnit("noma"))
    }

    private class PermApi(private val body: String, private val ok: Boolean = true) : BffApi {
        var calls = 0
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { calls++; return if (ok) ApiResult(200, Json.parseToJsonElement(this.body)) else ApiResult(0, null) }
        override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
    }
    private fun me(vararg perms: String) = """{"ok":true,"context_kompaniyalar":[{"kompaniya_id":7,"permissions":[${perms.joinToString(",") { "\"$it\"" }}]}]}"""

    /** Windows and Android use the SAME rule: f2.read shows the act amount, its absence hides it, unknown (offline) allows. Loaded once per company. */
    @Test fun actAmountAccessIsOneRuleForBothApps() = runBlocking {
        val with = PermApi(me("f2.read", "fakt.read")); val acc = ActAmountAccess(with)
        assertTrue(acc.canSee(7)); assertTrue(acc.canSee(7)); assertEquals(1, with.calls)
        assertFalse(ActAmountAccess(PermApi(me("fakt.read"))).canSee(7))
        assertTrue(ActAmountAccess(PermApi(me("fakt.read"))).canSee(99))   // company not listed: unknown = allowed, the server decides
        assertTrue(ActAmountAccess(PermApi("{}", ok = false)).canSee(7))
        assertEquals(setOf("f2.read"), permissionsFrom(Json.parseToJsonElement(me("f2.read")), 7))
    }

    @Test fun amountsNeedF2Read() {
        assertTrue(canSeeActAmounts(null))
        assertTrue(canSeeActAmounts(setOf("f2.read")))
        assertFalse(canSeeActAmounts(setOf("fakt.read")))
        assertEquals(null, aktSummaUnknownText("PERMISSION_DENIED"))
        assertEquals(null, aktSummaUnknownText("HIDDEN"))
    }
}