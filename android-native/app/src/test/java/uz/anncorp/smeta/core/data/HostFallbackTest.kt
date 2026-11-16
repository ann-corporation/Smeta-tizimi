package uz.anncorp.smeta.core.data

import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.IOException
import java.net.UnknownHostException
import java.net.SocketTimeoutException

class HostFallbackTest {
    private val bases = listOf("https://qurai.uz".toHttpUrl(), "https://smeta-tizimi.pages.dev".toHttpUrl())

    /** Fake network: hosts in [down] fail with [err]; others answer 200. Records "<host> <Origin>" per attempt. */
    private fun client(down: Set<String>, err: () -> IOException = { UnknownHostException("dns") }, calls: MutableList<String>, clock: () -> Long = { 0L }): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(HostFallbackInterceptor(bases, 1000, clock))
            .addInterceptor { chain ->
                val r = chain.request()
                calls += r.url.host + " " + (r.header("Origin") ?: "-")
                if (r.url.host in down) throw err()
                Response.Builder().request(r).protocol(Protocol.HTTP_1_1).code(200).message("OK").body("{}".toResponseBody()).build()
            }.build()

    @Test fun primaryWorksNoFallback() {
        val calls = mutableListOf<String>()
        client(emptySet(), calls = calls).newCall(Request.Builder().url("https://qurai.uz/api/x").build()).execute().close()
        assertEquals(listOf("qurai.uz -"), calls)
    }

    @Test fun fallsBackToOldHostWhenPrimaryUnreachable() {
        val calls = mutableListOf<String>()
        val r = client(setOf("qurai.uz"), calls = calls)
            .newCall(Request.Builder().url("https://qurai.uz/api/mobil/bff").post("{}".toRequestBody()).header("Origin", "https://qurai.uz").build()).execute()
        assertEquals(200, r.code); r.close()
        assertEquals(listOf("qurai.uz https://qurai.uz", "smeta-tizimi.pages.dev https://smeta-tizimi.pages.dev"), calls)
    }

    @Test fun stickyHostSkipsDeadPrimaryUntilExpiry() {
        val calls = mutableListOf<String>(); var t = 0L
        val c = client(setOf("qurai.uz"), calls = calls, clock = { t })
        c.newCall(Request.Builder().url("https://qurai.uz/a").build()).execute().close()
        calls.clear()
        c.newCall(Request.Builder().url("https://qurai.uz/b").build()).execute().close()
        assertEquals(listOf("smeta-tizimi.pages.dev -"), calls)
        t = 5000; calls.clear()
        c.newCall(Request.Builder().url("https://qurai.uz/c").build()).execute().close()
        assertEquals(listOf("qurai.uz -", "smeta-tizimi.pages.dev -"), calls)
    }

    @Test fun postIsNotReplayedAfterTimeout() {
        val calls = mutableListOf<String>()
        try {
            client(setOf("qurai.uz"), err = { SocketTimeoutException("read") }, calls = calls)
                .newCall(Request.Builder().url("https://qurai.uz/api/x").post("{}".toRequestBody()).build()).execute().close()
            fail("expected timeout")
        } catch (e: SocketTimeoutException) { assertEquals(1, calls.size) }
    }

    @Test fun getIsRetriedAfterTimeoutAndForeignHostsUntouched() {
        val calls = mutableListOf<String>()
        val c = client(setOf("qurai.uz"), err = { SocketTimeoutException("read") }, calls = calls)
        c.newCall(Request.Builder().url("https://qurai.uz/x").build()).execute().close()
        assertEquals(2, calls.size)
        calls.clear()
        c.newCall(Request.Builder().url("https://example.org/x").build()).execute().close()
        assertEquals(listOf("example.org -"), calls)
        assertTrue(true)
    }
}