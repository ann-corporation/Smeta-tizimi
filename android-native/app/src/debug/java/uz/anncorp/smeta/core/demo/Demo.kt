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
    private fun demoParty(path: String): String {
        val asked = path.substringAfter("kabinet=", "").substringBefore('&').substringAfter(':')
        val flag = File(context.filesDir, "rol.flag").takeIf { it.exists() }?.readText()?.trim().orEmpty()
        return listOf(asked, flag).firstOrNull { it in setOf("prorab", "rahbar", "texnadzor") } ?: "prorab"
    }

    private fun asset(name: String): String = context.assets.open("demo/$name").bufferedReader().use { it.readText() }
    private fun ok(text: String, etag: String? = null) = ApiResult(200, json.parseToJsonElement(text), null, etag)

    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val session = json.parseToJsonElement(asset("session.json")).jsonObject
        return when {
            path.startsWith("/api/sessiya") -> ApiResult(200, session["sessiya"])
            path.startsWith("/api/ish-joyi") && method == "POST" -> ok("""{"ok":true,"kompaniya_id":1}""")
            // Server-driven workspace fixtures (generated from the real server function): picked by the requested cabinet, else by files/rol.flag (prorab | rahbar | texnadzor).
            path.startsWith("/api/ish-joyi") && path.contains("bolim=ish_stoli") -> ok(asset("ish_stoli_${demoParty(path)}.json"))
            // The file nowork.flag simulates a fresh company-less account (onboarding screen).
            path.startsWith("/api/ish-joyi") -> if (File(context.filesDir, "nowork.flag").exists()) ok("""{"ok":true,"ish_joylari":[]}""") else if (File(context.filesDir, "boss.flag").exists()) ok(session["ish_joyi"].toString().replace("\"prorab\"", "\"direktor\"")) else ApiResult(200, session["ish_joyi"])
            path.startsWith("/api/profil") && method == "POST" -> profil(body as? JsonObject)
            path.startsWith("/api/kirish-taklif") && method == "POST" -> ok("""{"ok":true,"kod":"48213907","havola":"https://smeta-tizimi.pages.dev/taklif/DEMOTOKEN"}""")
            path.startsWith("/api/ai-savol") && method == "POST" -> {
                val q = ((body as? JsonObject)?.get("savol") as? JsonPrimitive)?.content.orEmpty()
                // A question containing "limit" simulates an empty token balance (HTTP 402), so the budget card can be shown.
                if (q.contains("limit", ignoreCase = true)) ApiResult(402, buildJsonObject { put("ok", false); put("xabar", "AI tokenlari yetarli emas"); put("code", "AI_BYUDJET") }, "AI_BYUDJET")
                else ok("""{"ok":true,"agent":"Jarvis","javob":"Bugun 3 ta ish bor: 2 ta fakt kiritish va 1 ta tasdiqlash kutmoqda. Birinchi navbatda tasdiqlashni ko'rib chiqing.","provider":"demo","requires_approval":false}""")
            }
            path.startsWith("/api/company") && method == "POST" && (body as? JsonObject)?.get("action")?.let { (it as? JsonPrimitive)?.content } == "member_invite" -> {
                val v = ((body as JsonObject)["qiymat"] as? JsonPrimitive)?.content.orEmpty()
                // A value containing "yoq" or any phone without an account simulates TOPILMADI; the rest simulates a sent invitation.
                if (v.contains("yoq") || v.startsWith("+")) ApiResult(404, buildJsonObject { put("ok", false); put("code", "TOPILMADI"); put("tur", "telefon"); put("telefon_taklif", true); put("telefon", "+998901234567") }, "TOPILMADI")
                else ok("""{"ok":true,"taklif_id":55,"holat":"kutmoqda","profil":{"id":31,"ism":"Sardor Karimov","username":"sardor_k","avatar_rang":"#3b82f6"}}""")
            }            path.startsWith("/api/company") && method == "POST" -> ok("""{"ok":true,"kompaniya_id":1}""")
            path.startsWith("/api/company") -> ok("""{"ok":true,"context_kompaniyalar":[{"kompaniya_id":1,"effective_role":"pto","permissions":[${if (File(context.filesDir, "boss.flag").exists()) "\"control.company.read\",\"financial.write\"," else ""}"company.read","smeta.read","fakt.read","fakt.write","f2.read","f2.prepare","narx.read","document.write","warehouse.read"]}]}""")
            path.startsWith("/api/modullarim") -> if (method == "POST") ok("""{"ok":true,"versiya":1}""") else ok("""{"ok":true,"tanlangan":["fakt","foto","f2"],"tartib":["fakt","foto","f2"],"versiya":1}""")
            path.startsWith("/api/obyekt-paket") -> {
                val id = path.substringAfter("obyekt_id=").toLongOrNull() ?: return ApiResult(400, null)
                if (id == 102L || id == 103L) return ApiResult(403, buildJsonObject { put("ok", false); put("code", "PERMISSION_DENIED") }, "PERMISSION_DENIED")
                if (etag == "demo-etag-$id") return ApiResult(304, null, null, etag)
                val o = json.parseToJsonElement(asset("paket.json")).jsonObject
                ApiResult(200, JsonObject(o + ("obyekt_id" to JsonPrimitive(id))), null, "demo-etag-$id")
            }
            path.startsWith("/api/sb-yoz") -> ok(asset("fakt_ok.json"))
            path.startsWith("/api/sb") -> {
                val o = body as? JsonObject
                fun s(k: String) = o?.get(k)?.let { (it as? JsonPrimitive)?.content }
                val jadval = s("jadval"); val filtr = s("filtr").orEmpty()
                when {
                    s("soro") == "rahbar_panel_v1" -> ok(asset("panel.json"))
                    s("soro") == "akt_reestr_obyekt_v1" -> ok(asset("f2list.json"))
                    s("soro") == "modul_holat_v1" -> ok("""{"ok":true,"natija":{"ok":true,"modullar":[{"kod":"module.hr","holat":"off"},{"kod":"module.moliya","holat":"on"}]}}""")
                    jadval == "t2_obyekt_jami" -> ok(asset("objects.json"))
                    jadval == "t2_sklad_qoldiq" -> ok(asset("ombor_stock.json"))
                    jadval == "t2_sklad_royxat" -> ok(asset("ombor_warehouses.json"))
                    s("soro") == "sklad_markaziy_qoldiq_v1" -> ok(asset("ombor_central.json"))
                    jadval == "t2_akt" && filtr.contains("lifecycle_status=eq.draft") -> {
                        val n = if (filtr.contains("tur=eq.f2")) 3 else 5
                        ok("""{"ok":true,"soni":1,"jamiServerda":$n,"toliq":true,"qatorlar":[]}""")
                    }
                    jadval == "t2_akt" -> ok(asset("akt501.json"))
                    jadval == "t2_obyekt" -> ok("""{"ok":true,"soni":1,"jamiServerda":1,"toliq":true,"qatorlar":[{"id":101,"nom":"Demo korpus A"}]}""")
                    else -> ApiResult(403, buildJsonObject { put("ok", false) }, "PERMISSION_DENIED")
                }
            }
            path.startsWith("/api/hujjat-aylanish") && method == "GET" -> when {
                path.contains("bolim=kiruvchi") -> ok(asset("inbox.json"))
                path.contains("bolim=bildirishnomalar") -> ok(asset("notes.json"))
                path.contains("bolim=zanjir") -> ok(asset(if (path.contains("zanjir_id=8")) "zanjir8.json" else "zanjir7.json"))
                else -> ApiResult(400, null)
            }
            path.startsWith("/api/hujjat-aylanish") -> {
                val o = body as? JsonObject
                // Zanjir 8 simulates "somebody decided first" so the not-your-turn message can be shown.
                if ((o?.get("zanjir_id") as? JsonPrimitive)?.content == "8") ApiResult(200, buildJsonObject { put("ok", false); put("code", "NAVBAT_EMAS") }, "NAVBAT_EMAS")
                else ok("""{"ok":true,"id":7,"holat":"jarayonda"}""")
            }
            path.startsWith("/api/hujjat-royxat") -> ok(DEMO_DOCS)
            path.startsWith("/api/hujjat-yarat") -> ok(asset("gen_list.json"))
            path.startsWith("/api/foto-dalil") -> ok("""{"ok":true,"id":900}""")
            else -> ApiResult(404, null)
        }
    }

    private var demoUsername: String? = "ali_valiyev"
    private var demoPhoneSearch = "hammasi"
    private val demoInvites = mutableListOf(
        """{"id":71,"kompaniya_id":9,"kompaniya_nom":"Demo Qurilish MChJ","rol":"prorab","tugaydi":${System.currentTimeMillis() + 10 * 86_400_000L},"taklif_qiluvchi":{"id":31,"ism":"Sardor Karimov","username":"sardor_k"}}""",
        """{"id":72,"kompaniya_id":10,"kompaniya_nom":"Namuna Servis","rol":"pto","tugaydi":${System.currentTimeMillis() + 4 * 86_400_000L},"taklif_qiluvchi":{"id":32,"ism":"Dilnoza Rahimova","username":null}}""",
    )

    /** @username contract (docs/architecture/USERNAME_V1.md) served from memory for the demo. */
    private fun profil(o: JsonObject?): ApiResult {
        fun s(k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it.isString }?.content
        val taken = setOf("admin_demo", "qurai_user", "ali_valiyev2", "sardor_k")
        return when (s("amal")) {
            "username_ol" -> ok("""{"ok":true,"username":${demoUsername?.let { "\"$it\"" } ?: "null"},"ism":"Ali Valiyev","telefon_qidiruv":"$demoPhoneSearch","bugun_qoldi":4}""")
            "username_tekshir" -> {
                val u = s("username").orEmpty()
                val free = (o?.get("variantlar") as? kotlinx.serialization.json.JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content }.filter { it !in taken }.take(5)
                val band = u in taken
                ok("""{"ok":true,"yaroqli":true,"sabab":null,"bosh":${!band},"band":$band,"variantlar":[${free.joinToString(",") { "\"$it\"" }}]}""")
            }
            "username_belgila" -> { demoUsername = s("username"); ok("""{"ok":true,"username":${demoUsername?.let { "\"$it\"" } ?: "null"}}""") }
            "username_sozlama" -> { demoPhoneSearch = s("telefon_qidiruv") ?: "hammasi"; ok("""{"ok":true,"telefon_qidiruv":"$demoPhoneSearch"}""") }
            "kompaniyadosh_qidir" -> {
                val p = s("prefiks").orEmpty().lowercase().removePrefix("@")
                val all = listOf("""{"id":31,"ism":"Sardor Karimov","username":"sardor_k"}""", """{"id":32,"ism":"Dilnoza Rahimova","username":null}""", """{"id":33,"ism":"Sanjar Aliyev","username":"sanjar_a"}""")
                ok("""{"ok":true,"royxat":[${all.filter { it.lowercase().contains(p) }.joinToString(",")}]}""")
            }
            "username_ommaviy" -> ok("""{"ok":true,"username":{"31":"sardor_k","33":"sanjar_a"}}""")
            "taklif_royxat" -> ok("""{"ok":true,"royxat":[${demoInvites.joinToString(",")}]}""")
            "taklif_javob" -> {
                val id = (o?.get("taklif_id") as? JsonPrimitive)?.content?.toLongOrNull()
                demoInvites.removeAll { it.contains("\"id\":$id,") }
                ok("""{"ok":true,"holat":"qabul","kompaniya_id":9,"rol":"prorab"}""")
            }
            else -> ApiResult(400, buildJsonObject { put("ok", false) })
        }
    }
    override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ok("""{"ok":true,"document_id":777}""")

    /** Demo document download: ids 9001/9002 are a generated 2-page PDF, 9003 an .xlsx stand-in (no preview), anything else is missing. */
    override suspend fun bffBytes(path: String, maxBytes: Long): uz.anncorp.smeta.core.data.BytesResult {
        val id = path.substringAfter("id=").toLongOrNull() ?: return uz.anncorp.smeta.core.data.BytesResult(404, null)
        return when (id) {
            9001L, 9002L -> uz.anncorp.smeta.core.data.BytesResult(200, demoPdf(id), "application/pdf", "F-2 demo.pdf")
            9003L -> uz.anncorp.smeta.core.data.BytesResult(200, ByteArray(2048) { 7 }, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "F-2 demo.xlsx")
            else -> uz.anncorp.smeta.core.data.BytesResult(404, null, code = "CANONICAL_BINARY_MISSING")
        }
    }

    /** Demo of server-side generation: the bytes are a REAL file produced by the server engine from a synthetic fixture (assets/demo/gen_f2.*). */
    override suspend fun bffPostBytes(path: String, body: JsonElement, maxBytes: Long): uz.anncorp.smeta.core.data.BytesResult {
        val format = body.jsonObject["format"]?.toString()?.trim('"') ?: "pdf"
        val bytes = context.assets.open("demo/gen_f2.$format").use { it.readBytes() }
        val mime = if (format == "pdf") "application/pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return uz.anncorp.smeta.core.data.BytesResult(200, bytes, mime, "Ф-2 № 1 · 2026-10.$format")
    }

    private fun demoPdf(id: Long): ByteArray {
        val doc = android.graphics.pdf.PdfDocument()
        for (n in 1..2) {
            val page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, n).create())
            val p = android.graphics.Paint().apply { textSize = 22f; isAntiAlias = true }
            page.canvas.drawText("DEMO F-2 #$id", 48f, 80f, p)
            p.textSize = 14f
            for (i in 0 until 24) page.canvas.drawText("Qator ${i + 1}   ${(i + 1) * 12}.5 m3   ·   sahifa $n", 48f, 130f + i * 28f, p)
            doc.finishPage(page)
        }
        return java.io.ByteArrayOutputStream().also { doc.writeTo(it); doc.close() }.toByteArray()
    }

    private companion object {
        const val DEMO_DOCS = """{"ok":true,"jami":4,"documents":[
 {"id":"9001","filename":"F-2 2026-11 №501.pdf","type":"f2_hujjat","revision":1,"mime":"application/pdf","size":183500,"sha256":"aa11bb22cc33dd44","canonicalStatus":"READY","updatedAt":"2026-11-14T09:30:00+00:00","createdAt":"2026-11-14T09:30:00+00:00"},
 {"id":"9003","filename":"F-2 2026-11 №501.xlsx","type":"f2_hujjat","revision":1,"mime":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","size":48200,"sha256":"ee55ff66aa77bb88","canonicalStatus":"READY","updatedAt":"2026-11-14T09:30:00+00:00","createdAt":"2026-11-14T09:30:00+00:00"},
 {"id":"9002","filename":"Chizma A-3 rev2.pdf","type":"hujjat","revision":2,"mime":"application/pdf","size":2411000,"sha256":"1122334455667788","canonicalStatus":"READY","updatedAt":"2026-11-10T12:00:00+00:00","createdAt":"2026-11-10T12:00:00+00:00"},
 {"id":"9004","filename":"Shartnoma qo'shimcha kelishuv.pdf","type":"hujjat","revision":1,"mime":"application/pdf","size":0,"sha256":"","canonicalStatus":"UPLOADING","updatedAt":"2026-11-09T08:00:00+00:00","createdAt":"2026-11-09T08:00:00+00:00"}
]}"""
    }
}
