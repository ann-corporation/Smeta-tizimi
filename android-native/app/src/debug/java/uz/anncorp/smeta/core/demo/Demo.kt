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

    /** `files/update.flag` simulates a newer release on the server (the manifest the app would download). */
    fun updateManifest(context: Context): String? = if (enabled(context) && File(context.filesDir, "update.flag").exists())
        """{"android":{"version":"9.9.9","file":"qurai-9.9.9-native-release.apk","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}}""" else null

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
            path.startsWith("/api/agent-ish") && method == "POST" -> agentIsh(body as? JsonObject)
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
                // Object 104 serves a synthetic 26 000-row packet (40 sections x 160 works x 3 resources) to measure tree scrolling and search.
                if (id == 104L) return ApiResult(200, bigPacket(id), null, "demo-etag-$id")
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
                    jadval == "t2_zayavka_royxat" -> ok("""{"ok":true,"soni":3,"jamiServerda":3,"toliq":true,"qatorlar":[
 {"id":31,"kompaniya_id":1,"obyekt_id":101,"item_text":"Armatura A500C d12","requested_qty":3.5,"unit":"t","status":"approved","delivered_qty":0,"required_date":"2026-11-20","priority":"yuqori","created_at":"2026-11-14T09:00:00+00:00"},
 {"id":30,"kompaniya_id":1,"obyekt_id":101,"item_text":"Sement M400 qop","requested_qty":240,"unit":"qop","status":"partially_delivered","delivered_qty":100,"required_date":null,"priority":"orta","created_at":"2026-11-12T09:00:00+00:00"},
 {"id":29,"kompaniya_id":1,"obyekt_id":102,"item_text":"Gvozd 100 mm","requested_qty":15.75,"unit":"kg","status":"submitted","delivered_qty":0,"required_date":"2026-11-18","priority":"past","created_at":"2026-11-10T09:00:00+00:00"}]}""")
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

    private val demoChats = mutableMapOf<String, String>()

    /** Jarvis fixture: money answer from the demo object summary (QQS bilan first), shared chat history in memory. */
    private fun agentIsh(o: JsonObject?): ApiResult {
        fun s(k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it.isString }?.content
        return when (s("amal")) {
            "kasb_savol" -> {
                val q = s("savol").orEmpty().lowercase()
                val text = if (q.contains("qqs") || q.contains("summa") || q.contains("qancha"))
                    "Demo korpus A: QQS bilan 1 614 935 115,60; ustamali (QQS siz) 1 441 906 355,00; ustamasiz (QQS siz) 1 232 381 500,00. 1 ta qator narxsiz."
                else "Bugun 3 ta ish bor: 2 ta fakt kiritish va 1 ta tasdiqlash kutmoqda."
                ok(buildJsonObject { put("ok", true); put("javob", text); put("provider", "local") }.toString())
            }
            "suhbat_royxat" -> ok("""{"ok":true,"royxat":[${demoChats.keys.joinToString(",") { """{"id":"$it","sarlavha":"Demo suhbat","yangilandi":"2026-11-15T10:00:00+00:00"}""" }}]}""")
            "suhbat_ol" -> ok("""{"ok":true,"xabarlar":${demoChats[s("klient_id")] ?: "[]"}}""")
            "suhbat_saqla" -> { s("klient_id")?.let { demoChats[it] = (o?.get("xabarlar"))?.toString() ?: "[]" }; ok("""{"ok":true}""") }
            else -> ApiResult(400, buildJsonObject { put("ok", false) })
        }
    }

    /** Synthetic columnar packet (same wire shape as paket.json) with ~26k rows. Deterministic, no real data. */
    private fun bigPacket(id: Long): JsonObject {
        val sections = 40; val works = 160; val res = 3
        val ids = ArrayList<Long>(); val ota = ArrayList<Long?>(); val dar = ArrayList<Int>(); val tart = ArrayList<Int>(); val tur = ArrayList<Int>(); val kat = ArrayList<Int?>()
        val kod = ArrayList<Int?>(); val nom = ArrayList<Int>(); val bir = ArrayList<Int?>(); val hajm = ArrayList<Double?>(); val narx = ArrayList<Double?>(); val summa = ArrayList<Double?>()
        var next = 10_000L
        for (s in 0 until sections) {
            val sid = next++
            ids += sid; ota += null; dar += 0; tart += s + 1; tur += 0; kat += null; kod += null; nom += s % 40; bir += null; hajm += null; narx += null; summa += null
            for (w in 0 until works) {
                val wid = next++
                val qty = 10.0 + (w % 17) * 3.5
                ids += wid; ota += sid; dar += 1; tart += w + 1; tur += 1; kat += null; kod += (s * works + w) % 200; nom += 40 + (w % 120); bir += w % 4; hajm += qty; narx += 1000.0 * (1 + w % 9); summa += qty * 1000.0 * (1 + w % 9)
                for (r in 0 until res) {
                    ids += next++; ota += wid; dar += 2; tart += r + 1; tur += if (r == 2) 3 else 2; kat += r; kod += (w * 3 + r) % 200; nom += 160 + (r + w) % 30; bir += r; hajm += qty * (r + 1); narx += 100.0 * (r + 1); summa += qty * (r + 1) * 100.0 * (r + 1)
                }
            }
        }
        val n = ids.size
        fun <T> col(l: List<T>, put: (T) -> kotlinx.serialization.json.JsonElement) = kotlinx.serialization.json.JsonArray(l.map(put))
        fun num(v: Number?) = if (v == null) kotlinx.serialization.json.JsonNull else JsonPrimitive(v)
        val zero = kotlinx.serialization.json.JsonArray(List(n) { JsonPrimitive(0) })
        val lugat = buildJsonObject {
            put("nom", kotlinx.serialization.json.JsonArray((0 until 190).map { JsonPrimitive(if (it < 40) "RAZDEL ${it + 1}" else "POZITSIYA $it") }))
            put("kod", kotlinx.serialization.json.JsonArray((0 until 200).map { JsonPrimitive("K%03d".format(it)) }))
            put("birlik", kotlinx.serialization.json.JsonArray(listOf("m3", "t", "m2", "sht").map { JsonPrimitive(it) }))
            put("tur", kotlinx.serialization.json.JsonArray(listOf("rz", "bl", "rs", "mat", "ob").map { JsonPrimitive(it) }))
            put("kat", kotlinx.serialization.json.JsonArray(listOf("CHEL", "MASH", "MAT", "OB").map { JsonPrimitive(it) }))
        }
        val q = buildJsonObject {
            put("id", col(ids) { num(it) }); put("ota_id", col(ota) { num(it) }); put("daraja", col(dar) { num(it) }); put("tartib", col(tart) { num(it) })
            put("tur", col(tur) { num(it) }); put("kat", col(kat) { num(it) }); put("kod", col(kod) { num(it) }); put("nom", col(nom) { num(it) }); put("birlik", col(bir) { num(it) })
            put("hajm", col(hajm) { num(it) }); put("narx", col(narx) { num(it) }); put("summa", col(summa) { num(it) })
            put("norma", kotlinx.serialization.json.JsonArray(List(n) { kotlinx.serialization.json.JsonNull }))
            put("narx_usul", kotlinx.serialization.json.JsonArray(List(n) { kotlinx.serialization.json.JsonNull }))
            put("versiya", kotlinx.serialization.json.JsonArray(List(n) { JsonPrimitive(1) })); put("qoshimcha", zero); put("zamena", zero); put("xom_qator", JsonObject(emptyMap()))
        }
        val fakt = kotlinx.serialization.json.JsonArray(hajm.map { num(if (it == null) 0.0 else it * 0.4) })
        val h = buildJsonObject {
            put("fakt_hajm", fakt); put("fakt_summa", zero); put("f2_hajm", zero); put("f2_summa", zero); put("f2_summa_nomalum", zero)
            put("direct_fakt_hajm", fakt); put("fakt_manbasi", zero); put("almashtirilgan_hajm", JsonObject(emptyMap())); put("almashtirilgan_summa", JsonObject(emptyMap()))
        }
        return buildJsonObject {
            put("format", "t2-paket/1"); put("obyekt_id", id); put("obyekt_nom", "Demo katta obyekt"); put("kompaniya_id", 1); put("soni", n)
            put("lugat", lugat); put("q", q); put("h", h); put("f2", kotlinx.serialization.json.JsonArray(emptyList())); put("meta", JsonObject(emptyMap()))
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
