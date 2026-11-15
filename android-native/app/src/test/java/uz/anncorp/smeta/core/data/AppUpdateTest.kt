package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val sha = "a".repeat(64)
    private fun manifest(v: String, file: String = "qurai-$v-native-release.apk", h: String = sha) =
        """{"android":{"version":"$v","file":"$file","sha256":"$h","signed":true},"ios":{"mode":"pwa"}}"""

    @Test fun versionOrderIsNumeric() {
        assertTrue(isNewerVersion("0.1.10", "0.1.9")); assertTrue(isNewerVersion("0.2.0", "0.1.99")); assertTrue(isNewerVersion("1.0.0", "0.9.9"))
        assertFalse(isNewerVersion("0.1.5", "0.1.5")); assertFalse(isNewerVersion("0.1.4", "0.1.5")); assertFalse(isNewerVersion("garbage", "0.1.5")); assertFalse(isNewerVersion("0.1.6", "x"))
        assertTrue(isNewerVersion("0.1.6", "0.1.5-debug"))
    }

    @Test fun manifestIsValidated() {
        assertEquals(AppRelease("0.1.6", "qurai-0.1.6-native-release.apk", sha), parseAndroidRelease(manifest("0.1.6"), json))
        assertNull(parseAndroidRelease(manifest("0.1"), json))
        assertNull(parseAndroidRelease(manifest("0.1.6", file = "../evil.apk"), json))
        assertNull(parseAndroidRelease(manifest("0.1.6", file = "a.exe"), json))
        assertNull(parseAndroidRelease(manifest("0.1.6", h = "zz"), json))
        assertNull(parseAndroidRelease("not json", json)); assertNull(parseAndroidRelease(null, json)); assertNull(parseAndroidRelease("""{"ios":{}}""", json))
    }

    @Test fun downloadLinkStaysOnTheApiHost() {
        val r = AppRelease("0.1.6", "qurai-0.1.6-native-release.apk", sha)
        assertEquals("https://smeta-tizimi.pages.dev/android/0.1.6/$sha/qurai-0.1.6-native-release.apk", releaseDownloadUrl("https://smeta-tizimi.pages.dev".toHttpUrl(), r))
    }

    @Test fun checkerReportsOnlyNewerAndSurvivesFailures() = kotlinx.coroutines.runBlocking {
        val base = "https://smeta-tizimi.pages.dev".toHttpUrl()
        assertEquals("0.1.6", UpdateChecker({ manifest("0.1.6") }, "0.1.5", base, json).newer()?.version)
        assertNull(UpdateChecker({ manifest("0.1.5") }, "0.1.5", base, json).newer())
        assertNull(UpdateChecker({ throw java.io.IOException("offline") }, "0.1.5", base, json).newer())
        assertNull(UpdateChecker({ null }, "0.1.5", base, json).newer())
    }
}