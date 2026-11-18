package uz.anncorp.smeta.core.data

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class ApiClientTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var tokens: TokenStore
    private lateinit var events: AuthEvents
    private lateinit var api: ApiClient
    private val json = Json { ignoreUnknownKeys = true }
    private val cred = DeviceCredential("00000000-0000-4000-8000-000000000001", "T".repeat(43), 4_000_000_000_000L)

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        tokens = TokenStore(File(tmp.root, "d.bin"), FakeCipher())
        events = AuthEvents()
        api = ApiClient(server.url("/"), tokens, events, json, "0.1.1")
    }

    @After fun tearDown() = server.shutdown()

    @Test fun addsNativeHeadersAndBearer() = runTest {
        tokens.save(cred)
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        val r = api.bff("/api/sessiya")
        assertEquals(200, r.status)
        val req = server.takeRequest()
        assertEquals("Bearer " + cred.token, req.getHeader("Authorization"))
        assertEquals("app://qurai-android", req.getHeader("Origin"))
        assertEquals("0.1.1", req.getHeader("X-Smeta-Desktop-Version"))
        assertEquals("/api/mobil/bff", req.path)
        assertEquals("POST", req.method)
    }

    @Test fun bffEnvelopeCarriesPathMethodAndBody() = runTest {
        tokens.save(cred)
        server.enqueue(MockResponse().setBody("{}"))
        api.bff("/api/sb", "POST", JsonObject(mapOf("amal" to kotlinx.serialization.json.JsonPrimitive("x"))))
        val body = json.parseToJsonElement(server.takeRequest().body.readUtf8()) as JsonObject
        assertEquals("/api/sb", body["path"]!!.jsonPrimitive.content)
        assertEquals("POST", body["method"]!!.jsonPrimitive.content)
        assertNotNull(body["body"])
    }

    @Test fun noTokenMeansNoAuthorizationHeader() = runTest {
        server.enqueue(MockResponse().setBody("{}"))
        api.bff("/api/sessiya")
        assertNull(server.takeRequest().getHeader("Authorization"))
    }

    @Test fun unauthorizedClearsTokenAndEmitsLogout() = runTest {
        tokens.save(cred)
        var logouts = 0
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { events.logout.collect { logouts++ } }
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"code":"DEVICE_AUTH_REQUIRED"}"""))
        val r = api.bff("/api/sessiya")
        assertEquals(401, r.status)
        assertEquals("DEVICE_AUTH_REQUIRED", r.code)
        assertNull(tokens.load())
        assertEquals(1, logouts)
        job.cancel()
    }

    @Test fun unauthorizedWithoutTokenDoesNotEmit() = runTest {
        var logouts = 0
        val job = launch(UnconfinedTestDispatcher(testScheduler)) { events.logout.collect { logouts++ } }
        server.enqueue(MockResponse().setResponseCode(401).setBody("{}"))
        api.bff("/api/sessiya")
        assertEquals(0, logouts)
        job.cancel()
    }

    @Test fun networkFailureIsStatusZero() = runTest {
        tokens.save(cred)
        server.shutdown()
        val r = api.bff("/api/sessiya")
        assertEquals(0, r.status)
        assertFalse(r.ok)
        assertNotNull(tokens.load()) // offline never signs the user out
        server = MockWebServer()
    }

    @Test fun signOutRevokesDeviceAndForgetsToken() = runTest {
        tokens.save(cred)
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.signOut()
        val req = server.takeRequest()
        assertEquals("DELETE", req.method)
        assertEquals("/api/desktop/qurilma", req.path)
        val body = json.parseToJsonElement(req.body.readUtf8()) as JsonObject
        assertEquals(cred.deviceId, body["device_id"]!!.jsonPrimitive.content)
        assertNull(tokens.load())
    }
}
