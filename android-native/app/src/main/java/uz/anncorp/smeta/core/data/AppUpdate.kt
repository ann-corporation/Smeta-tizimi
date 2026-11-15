package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Update check. The public manifest `<server base>/mobile-release.json` (written by frontend/scripts/generate-mobile-release.mjs) names the newest
 * Android release; the download link is built from the manifest fields on the SAME host, exactly like the website
 * (`androidReleaseLinks`: /android/<version>/<sha256>/<file>). A manifest that does not validate is ignored (no banner, never a crash).
 */
data class AppRelease(val version: String, val file: String, val sha256: String)

private val VERSION = Regex("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,6}$")
private val SHA = Regex("^[0-9a-f]{64}$")
private val SAFE_FILE = Regex("^[A-Za-z0-9._-]{1,120}$")

fun parseAndroidRelease(manifest: String?, json: Json): AppRelease? {
    val android = runCatching { json.parseToJsonElement(manifest ?: return null).jsonObject["android"] as? JsonObject }.getOrNull() ?: return null
    val v = android["version"].str()?.trim() ?: return null
    val f = android["file"].str()?.trim() ?: return null
    val h = android["sha256"].str()?.trim()?.lowercase() ?: return null
    if (!VERSION.matches(v) || !SAFE_FILE.matches(f) || !f.endsWith(".apk") || !SHA.matches(h)) return null
    return AppRelease(v, f, h)
}

/** Numeric dotted-version comparison (0.1.10 > 0.1.9). Unparsable input is never "newer". */
fun isNewerVersion(remote: String, installed: String): Boolean {
    if (!VERSION.matches(remote) || !VERSION.matches(installed.substringBefore('-'))) return false
    val a = remote.split('.').map { it.toInt() }
    val b = installed.substringBefore('-').split('.').map { it.toInt() }
    for (i in 0 until 3) if (a[i] != b[i]) return a[i] > b[i]
    return false
}

fun releaseDownloadUrl(base: HttpUrl, r: AppRelease): String =
    base.newBuilder().encodedPath("/android/${r.version}/${r.sha256}/${java.net.URLEncoder.encode(r.file, "UTF-8")}").build().toString()

class UpdateChecker(private val fetch: suspend () -> String?, private val installed: String, private val base: HttpUrl, private val json: Json) {
    /** The newer release, or null (up to date / offline / bad manifest). */
    suspend fun newer(): AppRelease? = parseAndroidRelease(runCatching { fetch() }.getOrNull(), json)?.takeIf { isNewerVersion(it.version, installed) }
    fun url(r: AppRelease): String = releaseDownloadUrl(base, r)

    companion object {
        /** Plain GET of the public manifest (no credentials, no cookies), same host as the API. */
        fun network(client: OkHttpClient, base: HttpUrl): suspend () -> String? = {
            withContext(Dispatchers.IO) {
                runCatching {
                    client.newCall(Request.Builder().url(base.resolve("/mobile-release.json")!!).header("Cache-Control", "no-cache").build()).execute().use { r ->
                        if (r.isSuccessful) r.body?.source()?.let { s -> s.request(65_536); s.buffer.readUtf8(minOf(s.buffer.size, 65_536L)) } else null
                    }
                }.getOrNull()
            }
        }
    }
}