package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The same fixtures as the website (frontend/src/dizayn/yagona-dizayn.test.ts): design/fixtures/format.json. */
class FormatFixtureTest {
    private val fixtures: JsonObject by lazy {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        while (dir != null && !File(dir, "design/fixtures/format.json").exists()) dir = dir.parentFile
        checkNotNull(dir) { "design/fixtures/format.json not found above ${System.getProperty("user.dir")}" }
        Json.parseToJsonElement(File(dir, "design/fixtures/format.json").readText(Charsets.UTF_8)).jsonObject
    }

    private fun cases(key: String): List<Pair<Double?, String>> = (fixtures[key] as JsonArray).map {
        val o = it.jsonObject
        val v = o["in"]
        (if (v == null || v is JsonNull) null else (v as JsonPrimitive).double) to (o["out"] as JsonPrimitive).content
    }

    @Test fun money() = cases("money").forEach { (v, out) -> assertEquals("money $v", out, formatMoney(v)) }
    @Test fun volume() = cases("volume").forEach { (v, out) -> assertEquals("volume $v", out, formatVolume(v)) }
    @Test fun percent() = cases("percent").forEach { (v, out) -> assertEquals("percent $v", out, formatPercent(v)) }
}
