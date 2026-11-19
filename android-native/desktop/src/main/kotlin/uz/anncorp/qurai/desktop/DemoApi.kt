package uz.anncorp.qurai.desktop

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi

/**
 * "Demo" mode of the Windows app (like the Android debug demo): canned server answers for the main screens, NO network and NO real data.
 * The fixtures are the same files as the Android demo (`resources/demo`). Entering the demo never touches the saved real session.
 */
class DesktopDemoApi(private val json: Json) : BffApi {
    private fun asset(name: String): String =
        (DesktopDemoApi::class.java.getResourceAsStream("/demo/$name.json") ?: error("demo fixture $name")).bufferedReader().use { it.readText() }
    private fun ok(text: String) = ApiResult(200, json.parseToJsonElement(text))
    private fun denied() = ApiResult(403, buildJsonObject { put("ok", false); put("code", "PERMISSION_DENIED") }, "PERMISSION_DENIED")

    override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ok("""{"ok":true}""")
    override suspend fun diskUpload(body: okhttp3.RequestBody): ApiResult = ok("""{"ok":true,"fayl_id":99}""")

    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
        val session = json.parseToJsonElement(asset("session")).jsonObject
        return when {
            path.startsWith("/api/sessiya") -> ApiResult(200, session["sessiya"])
            path.startsWith("/api/ish-joyi") -> ok(session["ish_joyi"].toString())
            path.startsWith("/api/profil") -> ok("""{"ok":true,"profil":{"ism":"Demo foydalanuvchi","telefon":"+998 90 000 00 00","email":"demo@example.test"}}""")
            path.startsWith("/api/obyekt-paket") -> ok(asset("paket"))
            path.startsWith("/api/sb-yoz") -> ok(asset("fakt_ok"))
            path.startsWith("/api/agent-ish") && (((body as? JsonObject)?.get("savol") as? JsonPrimitive)?.content.orEmpty().lowercase().let { it.contains("hajmini") || it.contains("kirim qil") }) ->
                ok("""{"ok":true,"provider":"demo","javob":"**Yozishdan oldin ko\u2018rib chiqing** (hali saqlanmagan)\n\n- Demo qator: hajm 10 \u2192 2","f2_preview":{"ok":true,"holat":"tasdiq_kerak","token":"demo-preview-token"}}""")
            path.startsWith("/api/f2-buyruq") -> ok("""{"ok":true,"holat":"yozildi"}""")
            path.startsWith("/api/ombor-ovoz") -> ok("""{"ok":true,"text":"817 F-2 da 1074871 hajmini 2 qil","draft_only":true}""")
            (path.startsWith("/api/agent-ish") || path.startsWith("/api/ai-savol")) -> ok("""{"ok":true,"agent":"Jarvis","javob":"**Demo rejimi.** Bugun 3 ta ish bor:\n\n- 2 ta fakt kiritish\n- 1 ta tasdiqlash\n\nBirinchi navbatda **tasdiqlashni** ko'rib chiqing.","provider":"demo"}""")
            path.startsWith("/api/ombor-buyruq") -> when (((body as? JsonObject)?.get("amal") as? JsonPrimitive)?.content) {
                "hisobot" -> ok(asset("ombor_hisobot")); "qoldiq" -> ok(asset("ombor_qoldiq_sana")); else -> ok("""{"ok":true,"holat":"javob","matn":"Demo rejimi: buyruq yuborilmaydi","nomzodlar":[]}""")
            }
            path.startsWith("/api/hujjat-maydoni") && method == "POST" -> ok("""{"ok":true}""")
            path.startsWith("/api/hujjat-maydoni") -> when {
                path.contains("amal=ulashilgan") -> ok("""{"ok":true,"royxat":[{"turi":"fayl","id":31,"nom":"Shartnoma ilovasi.pdf","mime":"application/pdf","bergan":"Demo hamkor","daraja":"korish","tugaydi":null}]}""")
                path.contains("savat=1") -> ok("""{"ok":true,"daraja":4,"shaxsiy":true,"yol":[],"papkalar":[],"fayllar":[{"id":21,"nom":"Eski reja.xlsx","mime":"application/vnd.ms-excel","bayt":48210,"versiya":2,"yangilandi":"2026-11-10T09:00:00+00:00","savatda":"2026-11-12T09:00:00+00:00","izohlar":0}]}""")
                path.contains("kompaniya_id") -> ok("""{"ok":true,"daraja":3,"shaxsiy":false,"kompaniya_id":1,"yol":[],"papkalar":[{"id":2,"nom":"Shartnomalar","tizim":false},{"id":3,"nom":"Tizim hujjatlari","tizim":true}],"fayllar":[{"id":11,"nom":"Obyekt qoidalari.docx","mime":"application/msword","bayt":184320,"versiya":1,"yangilandi":"2026-11-14T08:10:00+00:00","savatda":null,"izohlar":1}]}""")
                else -> ok("""{"ok":true,"daraja":4,"shaxsiy":true,"yol":[],"papkalar":[{"id":1,"nom":"Rasmlar","tizim":false}],"fayllar":[{"id":10,"nom":"Mening rejam.pdf","mime":"application/pdf","bayt":2097152,"versiya":3,"yangilandi":"2026-11-16T07:30:00+00:00","savatda":null,"izohlar":0}]}""")
            }
            path.startsWith("/api/hujjat-aylanish") && method == "GET" -> when {
                path.contains("bolim=kiruvchi") -> ok(asset("inbox")); path.contains("bolim=bildirishnomalar") -> ok(asset("notes")); else -> ApiResult(400, null)
            }
            path.startsWith("/api/sb") -> {
                val o = body as? JsonObject
                fun s(k: String) = (o?.get(k) as? JsonPrimitive)?.content
                val jadval = s("jadval")
                when {
                    s("soro") == "rahbar_panel_v1" -> ok(asset("panel"))
                    s("soro") == "akt_reestr_obyekt_v1" -> ok(asset("f2list"))
                    s("soro") == "akt_reestr_kompaniya_v1" -> ok(asset("f2reestr"))
                    s("soro") == "qarz_svod_v1" -> ok(asset("qarz_svod"))
                    s("soro") == "sklad_markaziy_qoldiq_v1" -> ok(asset("ombor_central"))
                    jadval == "t2_sklad_harakat" -> ok(asset("ombor_moves"))
                    jadval == "t2_sklad_qoldiq" -> ok(asset("ombor_stock"))
                    jadval == "t2_sklad_royxat" -> ok(asset("ombor_warehouses"))
                    jadval == "t2_loyiha_royxat" -> ok(asset("ier_loyiha"))
                    jadval == "t2_shartnoma" -> ok(asset("ier_shartnoma"))
                    jadval == "t2_shartnoma_bog_kompaniya" -> ok(asset("ier_bog"))
                    jadval == "t2_obyekt_jami" -> ok(asset("objects"))
                    jadval == "t2_qator_holat" -> ok(asset("resurs_rows"))
                    jadval == "t2_akt" -> ok(asset("akt501"))
                    else -> denied()
                }
            }
            else -> ApiResult(404, null)
        }
    }
}