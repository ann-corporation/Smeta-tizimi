package uz.anncorp.smeta.core.security

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import uz.anncorp.smeta.core.data.ApiClient
import uz.anncorp.smeta.core.data.AuthEvents
import uz.anncorp.smeta.core.data.DeviceCredential
import uz.anncorp.smeta.core.data.FakeCipher
import uz.anncorp.smeta.core.data.TokenStore
import java.io.File

/** Step-up at the network layer: 403 STEP_UP_KERAK -> handler -> replay with the `tasdiq` envelope field. */
@OptIn(ExperimentalCoroutinesApi::class)
class StepUpApiTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient
    private val tasdiq = TasdiqStore()
    private val json = Json { ignoreUnknownKeys = true }
    private val stepUpBody = """{"ok":false,"code":"STEP_UP_KERAK","usullar":["pin","qurilma"]}"""

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        val tokens = TokenStore(File(tmp.root, "d.bin"), FakeCipher())
        tokens.save(DeviceCredential("00000000-0000-4000-8000-000000000001", "T".repeat(43), 4_000_000_000_000L))
        api = ApiClient(server.url("/"), tokens, AuthEvents(), json, "0.1.1", tasdiq = tasdiq)
    }
    @After fun tearDown() = server.shutdown()

    @Test fun confirmedStepUpReplaysWithToken() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody(stepUpBody))
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        var asked: List<String>? = null
        api.stepUp = object : StepUpHandler { override suspend fun request(methods: List<String>): Boolean { asked = methods; tasdiq.set("TOK"); return true } }
        val r = api.bff("/api/sb-yoz", "POST", json.parseToJsonElement("""{"amal":"tolov_yoz"}"""))
        assertEquals(200, r.status)
        assertEquals(listOf("pin", "qurilma"), asked)
        val first = json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        val second = json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertNull(first["tasdiq"])
        assertEquals("TOK", second["tasdiq"]!!.jsonPrimitive.content)
        assertEquals("/api/sb-yoz", second["path"]!!.jsonPrimitive.content)
    }

    @Test fun declinedStepUpReturnsTheOriginal403AndDoesNotReplay() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody(stepUpBody))
        api.stepUp = object : StepUpHandler { override suspend fun request(methods: List<String>) = false }
        val r = api.bff("/api/sb-yoz", "POST", json.parseToJsonElement("""{"amal":"tolov_yoz"}"""))
        assertEquals(403, r.status); assertEquals("STEP_UP_KERAK", r.code)
        assertEquals(1, server.requestCount)
    }

    @Test fun otherForbiddenCodesDoNotTriggerStepUp() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"ok":false,"code":"PERMISSION_DENIED"}"""))
        var called = false
        api.stepUp = object : StepUpHandler { override suspend fun request(methods: List<String>): Boolean { called = true; return true } }
        assertEquals(403, api.bff("/api/sb-yoz", "POST", json.parseToJsonElement("{}")).status)
        assertTrue(!called)
    }

    @Test fun freshTokenIsAttachedToEveryBffCall() = runTest {
        tasdiq.set("TOK")
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.bff("/api/sessiya")
        assertEquals("TOK", json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject["tasdiq"]!!.jsonPrimitive.content)
    }

    @Test fun noHandlerMeansPlain403() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody(stepUpBody))
        assertEquals(403, api.bff("/api/sb-yoz", "POST", json.parseToJsonElement("{}")).status)
    }
}