package uz.anncorp.smeta.core.demo

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
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
import uz.anncorp.smeta.core.data.STEP_UP_CODE
import uz.anncorp.smeta.core.security.StepUpHandler
import uz.anncorp.smeta.core.security.TasdiqStore
import java.io.File

/**
 * DEBUG BUILDS ONLY (this file lives in src/debug; src/release has an inert stub). Demo mode serves bundled fixtures
 * instead of the network so every screen can be shown without a login. Switched on by an empty file `files/demo.flag`
 * (`adb shell run-as <debug app id> touch files/demo.flag`); `files/offline.flag` additionally forces the offline banner.
 */
object Demo {
    // The release-like `bench` build (measurements only) has no run-as access to write the flag, so it is always in demo mode.
    fun enabled(context: Context): Boolean = uz.anncorp.smeta.BuildConfig.BUILD_TYPE == "bench" || File(context.filesDir, "demo.flag").exists()
    fun forcedOffline(context: Context): Boolean? = if (enabled(context) && File(context.filesDir, "offline.flag").exists()) true else null
    fun bff(context: Context, json: Json, stepUp: () -> StepUpHandler? = { null }, tasdiq: TasdiqStore? = null): BffApi? =
        if (enabled(context)) DemoStepUpBff(DemoBff(context, json, tasdiq), stepUp) else null

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

/** Demo counterpart of ApiClient.bff step-up: 403 STEP_UP_KERAK -> ask the lock UI (PIN / biometrics) once -> replay with the fresh token. */
private class DemoStepUpBff(private val inner: BffApi, private val handler: () -> StepUpHandler?) : BffApi by inner {
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val first = inner.bff(path, method, body, etag)
        val h = handler()
        if (first.status != 403 || first.code != STEP_UP_CODE || h == null) return first
        val methods = ((first.body as? JsonObject)?.get("usullar") as? kotlinx.serialization.json.JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content }
        return if (h.request(methods)) inner.bff(path, method, body, etag) else first
    }
}

private class DemoBff(private val context: Context, private val json: Json, private val tasdiq: TasdiqStore? = null) : BffApi {
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
            // Server-driven module catalogue ("Barcha modullar"), generated from the real server function (functions/_shared/modul-katalog.ts) for a synthetic PTO member.
            path.startsWith("/api/ish-joyi") && path.contains("bolim=katalog") -> ok(asset("katalog.json"))
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
            path.startsWith("/api/obyekt-tugun-summa") -> tugunSumma(path)
            path.startsWith("/api/obyekt-paket") -> {
                val id = path.substringAfter("obyekt_id=").toLongOrNull() ?: return ApiResult(400, null)
                if (id == 102L || id == 103L) return ApiResult(403, buildJsonObject { put("ok", false); put("code", "PERMISSION_DENIED") }, "PERMISSION_DENIED")
                if (etag == "demo-etag-$id") return ApiResult(304, null, null, etag)
                // Object 104 serves a synthetic 26 000-row packet (40 sections x 160 works x 3 resources) to measure tree scrolling and search.
                if (id == 104L) return ApiResult(200, bigPacket(id), null, "demo-etag-$id")
                val o = json.parseToJsonElement(asset("paket.json")).jsonObject
                ApiResult(200, JsonObject(o + ("obyekt_id" to JsonPrimitive(id))), null, "demo-etag-$id")
            }
            // files/stepup.flag: the approval decision (signature action) needs a fresh PIN / biometric confirmation, like the real server (403 STEP_UP_KERAK).
            path.startsWith("/api/hujjat-aylanish") && method == "POST" && File(context.filesDir, "stepup.flag").exists() && tasdiq?.current() == null ->
                ApiResult(403, buildJsonObject { put("ok", false); put("code", STEP_UP_CODE); put("usullar", kotlinx.serialization.json.buildJsonArray { add(JsonPrimitive("pin")); if (qKeys.isNotEmpty()) add(JsonPrimitive("qurilma")) }) }, STEP_UP_CODE)
            path.startsWith("/api/sb-yoz") -> ok(asset("fakt_ok.json"))
            path.startsWith("/api/qulf") -> qulf(path, method, body as? JsonObject)
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

    private data class DemoChat(val id: String, val title: String, val messages: JsonArray, val etag: String, val updated: String)
    private val demoChats = mutableMapOf<Pair<String, String>, DemoChat>()
    private var demoChatVersion = 0L

    /** Jarvis fixture: money answer from the demo object summary (QQS bilan first), shared chat history in memory. */
    @Synchronized
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
            "suhbat_sync" -> {
                val company = o?.get("kompaniya_id").toString()
                val id = s("klient_id")
                val chat = demoChats[company to id.orEmpty()]
                ok(buildJsonObject {
                    put("ok", true)
                    put("royxat", JsonArray(demoChats.filterKeys { it.first == company }.values.sortedByDescending { it.updated }.take(20).map {
                        buildJsonObject { put("id", it.id); put("sarlavha", it.title); put("yangilandi", it.updated); put("toliq", true) }
                    }))
                    put("suhbat", if (id == null) JsonNull else buildJsonObject {
                        put("id", id)
                        when {
                            chat == null -> put("holat", "missing")
                            chat.etag == s("etag") -> { put("holat", "same"); put("etag", chat.etag) }
                            else -> {
                                put("holat", "changed"); put("etag", chat.etag); put("sarlavha", chat.title)
                                put("xabarlar", chat.messages); put("qisqartma", JsonNull)
                            }
                        }
                    })
                }.toString())
            }
            "suhbat_mutate" -> {
                val id = s("klient_id") ?: return ApiResult(400, null)
                val key = o?.get("kompaniya_id").toString() to id
                val messages = o?.get("xabarlar") as? JsonArray ?: return ApiResult(400, null)
                val old = demoChats[key]
                val chat = when (s("harakat")) {
                    "create" -> {
                        val title = s("sarlavha") ?: return ApiResult(400, null)
                        if (old != null && (old.title != title || old.messages != messages)) return ApiResult(409, null)
                        old ?: DemoChat(id, title, messages, (++demoChatVersion).toString(16).padStart(32, '0'), java.time.OffsetDateTime.now().toString())
                    }
                    "append" -> {
                        if (old == null) return ApiResult(404, null)
                        if (old.etag != s("etag")) return ApiResult(409, null)
                        old.copy(messages = JsonArray((old.messages + messages).takeLast(12)),
                            etag = (++demoChatVersion).toString(16).padStart(32, '0'), updated = java.time.OffsetDateTime.now().toString())
                    }
                    else -> return ApiResult(400, null)
                }
                demoChats[key] = chat
                ok(buildJsonObject { put("ok", true); put("id", id); put("etag", chat.etag) }.toString())
            }
            else -> ApiResult(400, buildJsonObject { put("ok", false) })
        }
    }

    // ---- /api/qulf fixture (PIN + device keys), in memory: a fresh process starts without a PIN ----
    private var qPin: String? = null
    private var qTimeout = 5
    private var qFails = 0
    private val qKeys = mutableListOf<Pair<Long, String>>() // id to credential id
    private var qNextKey = 1L

    private fun qulf(path: String, method: String, o: JsonObject?): ApiResult {
        fun s(k: String) = (o?.get(k) as? JsonPrimitive)?.takeIf { it.isString }?.content
        fun fail(code: String, status: Int = 200) = ApiResult(status, buildJsonObject { put("ok", false); put("code", code) }, code)
        if (method == "GET") {
            val keys = qKeys.joinToString(",") { """{"id":${it.first},"tur":"android","nom":"Demo qurilma"}""" }
            val methods = listOfNotNull(if (qPin != null) "\"pin\"" else null, if (qKeys.isNotEmpty()) "\"qurilma\"" else null).joinToString(",")
            return ok("""{"ok":true,"pin_bor":${qPin != null},"bosh_vaqt_daq":$qTimeout,"kalitlar":[$keys],"rejim":"pin","talab":false,"usullar":[$methods],"pin_holat":"ok","qolgan_soniya":0}""")
        }
        return when (s("amal")) {
            "pin_saqla" -> { val n = s("yangi").orEmpty(); if (n.length !in 4..6 || !n.all { it.isDigit() }) fail("PIN_YAROQSIZ") else { qPin = n; ok("""{"ok":true}""") } }
            "pin_tekshir" -> when {
                qPin == null -> fail("PIN_YOQ")
                qFails >= 5 -> ApiResult(429, buildJsonObject { put("ok", false); put("code", "BLOKLANGAN"); put("qolgan_soniya", 30) }, "BLOKLANGAN")
                s("pin") == qPin -> { qFails = 0; ok("""{"ok":true,"tasdiq_token":"demo-tasdiq-token"}""") }
                else -> { qFails++; fail("PIN_NOTOGRI") }
            }
            "pin_ochir" -> if (s("pin") == qPin) { qPin = null; ok("""{"ok":true}""") } else fail("PIN_NOTOGRI")
            "vaqt_saqla" -> { qTimeout = (o?.get("daq") as? JsonPrimitive)?.content?.toIntOrNull() ?: qTimeout; ok("""{"ok":true}""") }
            "kalit_ochir" -> { val id = (o?.get("id") as? JsonPrimitive)?.content?.toLongOrNull(); qKeys.removeAll { it.first == id }; ok("""{"ok":true}""") }
            "qurilma_reg_boshla" -> ok("""{"ok":true,"chaqiriq":"demo-reg-token","challenge":"demo-challenge-reg"}""")
            "qurilma_reg_tugat" -> {
                val spki = runCatching { java.util.Base64.getUrlDecoder().decode(s("ochiq_kalit").orEmpty()) }.getOrNull() ?: return fail("KALIT_YAROQSIZ")
                val cred = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(spki))
                qKeys += qNextKey++ to cred; ok("""{"ok":true}""")
            }
            "qurilma_kirish_boshla" -> ok("""{"ok":true,"chaqiriq":"demo-login-token","challenge":"demo-challenge-login","kredensiallar":[${qKeys.joinToString(",") { "\"" + it.second + "\"" }}]}""")
            // The demo does not verify the signature (that is server work, covered by the server tests); it checks only that the credential is registered.
            "qurilma_kirish_tugat" -> if (qKeys.any { it.second == s("kredensial_id") }) ok("""{"ok":true,"tasdiq_token":"demo-tasdiq-token"}""") else fail("KREDENSIAL_YOQ")
            else -> fail("AMAL_NOMA_LUM", 400)
        }
    }
    /** Per-node sums fixture for the 16-node demo packet (ids 1001..1016). `files/noustama.flag` simulates an object without markup (podval). Synthetic. */
    private fun tugunSumma(path: String): ApiResult {
        val id = path.substringAfter("obyekt_id=").toLongOrNull() ?: return ApiResult(400, null)
        if (id == 102L || id == 103L || id == 104L) return ApiResult(404, null)
        val noMarkup = File(context.filesDir, "noustama.flag").exists()
        // [id, smeta(plain), fakt(plain), f2(plain)] -> forms with ustamali = plain * 1.17, QQS bilan = ustamali * 1.12 (display fixture only).
        val rows = listOf(
            listOf(1001, 78325000.0 + 350840000.0 + 336200000.0, 26162500.0 + 353780000.0, 19500000.0 + 196000000.0),
            listOf(1002, 78325000.0, 26162500.0, 19500000.0), listOf(1003, 350840000.0, 353780000.0, 196000000.0), listOf(1004, 336200000.0, 0.0, null),
            listOf(1006, 312837500.0 + 13440000.0 + 97539000.0, 116725000.0 + 5040000.0 + 23419500.0, 87000000.0),
            listOf(1007, 312837500.0, 116725000.0, 87000000.0), listOf(1008, 13440000.0, 5040000.0, -2500000.0),
        )
        fun forms(v: Any?): String {
            val p = (v as? Double) ?: return "[null,null,null]"
            return if (noMarkup) "[null,null,$p]" else { val m = Math.round(p * 1.17 * 100) / 100.0; "[${Math.round(m * 1.12 * 100) / 100.0},$m,$p]" }
        }
        val list = rows.joinToString(",") { "[${it[0]},${forms(it[1])},${forms(it[2])},${forms(it[3])}]" }
        return ok("""{"ok":true,"obyekt_id":$id,"ustama":"${if (noMarkup) "yoq" else "bor"}","tugunlar":[$list]}""")
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
