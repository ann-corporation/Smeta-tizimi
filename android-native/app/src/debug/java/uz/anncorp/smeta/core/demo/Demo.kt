package uz.anncorp.smeta.core.demo

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import java.io.File

/**
 * DEBUG BUILDS ONLY (this file lives in src/debug; src/release has an inert stub). Demo mode serves bundled fixtures
 * instead of the network so every screen can be shown without a login. Switched on by an empty file `files/demo.flag`
 * (`adb shell run-as <debug app id> touch files/demo.flag`); `files/offline.flag` additionally forces the offline banner.
 */
object Demo {
    fun enabled(context: Context): Boolean = File(context.filesDir, "demo.flag").exists()
    fun forcedOffline(context: Context): Boolean? = if (enabled(context) && File(context.filesDir, "offline.flag").exists()) true else null
    fun bff(context: Context, json: Json): BffApi? = if (enabled(context)) DemoBff(context, json) else null

    /** Seeds a representative outbox once: two queued, one rejected, one sent with warnings. */
    suspend fun seed(context: Context, db: AppDb) {
        if (!enabled(context)) return
        val dao = db.outbox()
        if (dao.get("00000000-0000-4000-8000-000000000001") != null) return
        val t = System.currentTimeMillis()
        fun e(n: Int, state: String, lines: Int, err: String? = null, info: String? = null) = OutboxEntity(
            "00000000-0000-4000-8000-00000000000$n", "fakt_yoz_v2",
            """{"amal":"fakt_yoz_v2","kompaniya_id":1,"obyekt_id":101,"sana":"2026-11-1$n","qatorlar":[{"qator_id":1002,"hajm":5.5}],"operation_id":"00000000-0000-4000-8000-00000000000$n"}""",
            101, "Demo korpus A", lines, state, 0, err, info, t - (5 - n) * 60_000L,
        )
        dao.insertIgnore(e(1, OutboxState.PENDING, 3))
        dao.insertIgnore(e(2, OutboxState.PENDING, 1))
        dao.insertIgnore(e(3, OutboxState.FAILED, 2, err = "sana YYYY-MM-DD shaklida bo'lishi kerak"))
        dao.insertIgnore(e(4, OutboxState.DONE, 2, info = """{"raqam":"F20261115-01","jami":1234567.89,"over":[{"nom":"Армирование фундаментной плиты","chegara":35.8,"bor":36.1,"qosh":2.0}],"narxsiz":1,"takror":false}"""))
    }
}

private class DemoBff(private val context: Context, private val json: Json) : BffApi {
    private fun asset(name: String): String = context.assets.open("demo/$name").bufferedReader().use { it.readText() }
    private fun ok(text: String, etag: String? = null) = ApiResult(200, json.parseToJsonElement(text), null, etag)

    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val session = json.parseToJsonElement(asset("session.json")).jsonObject
        return when {
            path.startsWith("/api/sessiya") -> ApiResult(200, session["sessiya"])
            path.startsWith("/api/ish-joyi") -> ApiResult(200, session["ish_joyi"])
            path.startsWith("/api/obyekt-paket") -> {
                val id = path.substringAfter("obyekt_id=").toLongOrNull() ?: return ApiResult(400, null)
                if (id == 102L || id == 103L) return ApiResult(403, buildJsonObject { put("ok", false); put("code", "PERMISSION_DENIED") }, "PERMISSION_DENIED")
                if (etag == "demo-etag-$id") return ApiResult(304, null, null, etag)
                val o = json.parseToJsonElement(asset("paket.json")).jsonObject
                ApiResult(200, JsonObject(o + ("obyekt_id" to JsonPrimitive(id))), null, "demo-etag-$id")
            }
            path.startsWith("/api/sb-yoz") -> ok(asset("fakt_ok.json"))
            path.startsWith("/api/sb") -> {
                val jadval = (body as? JsonObject)?.get("jadval")?.let { (it as? JsonPrimitive)?.content }
                if (jadval == "t2_obyekt_jami") ok(asset("objects.json")) else ApiResult(403, buildJsonObject { put("ok", false) }, "PERMISSION_DENIED")
            }
            else -> ApiResult(404, null)
        }
    }
}
