package uz.anncorp.smeta.core.demo

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult

/**
 * Demo stand-in for /api/f2-buyruq (f2 read, f2_qoralama_tahrir preview, tasdiq) and /api/tekshiruv (texnadzor suggestions of act 503), in memory.
 * Debug / bench only: in release the real server does all of this. The sums here are fixture arithmetic (demo markup 17 %, QQS 12 %), never used in prod.
 */
internal class DemoF2Draft(private val json: Json) {
    private class R(val id: Long, val kod: String, val nom: String, val birlik: String, var hajm: Double, var narx: Double?)
    private val rows = mutableListOf(
        R(1002, "311-01", "Beton asos qurilmasi", "m3", 12.5, 850_000.0), R(1003, "311-02", "Plita armaturasi", "t", 2.4, 12_000_000.0),
        R(1007, "321-01", "G'isht terish", "m3", 40.0, 1_200_000.0), R(1008, "321-02", "Devor suvoq", "m2", 220.0, null),
        R(1011, "321-03", "Armatura A500C d12", "t", 2.0, 11_500_000.0),
    )
    private var version = 1
    private var pending: JsonObject? = null
    private val decisions = mutableMapOf<Long, Pair<String, String?>>()

    private fun total(list: List<R>) = list.sumOf { (it.narx ?: 0.0) * it.hajm }
    private fun pack(plain: Double): JsonObject = buildJsonObject { put("qqs_bilan", Math.round(plain * 1.17 * 1.12 * 100) / 100.0); put("ustamali", Math.round(plain * 1.17 * 100) / 100.0); put("ustamasiz", Math.round(plain * 100) / 100.0) }
    private fun ok(o: JsonObject) = ApiResult(200, o)
    private fun err(status: Int, code: String) = ApiResult(status, buildJsonObject { put("ok", false); put("code", code) }, code)
    private fun JsonObject.d(k: String) = (this[k] as? JsonPrimitive)?.doubleOrNull
    private fun JsonObject.l(k: String) = (this[k] as? JsonPrimitive)?.longOrNull

    fun buyruq(body: JsonObject?): ApiResult {
        val amal = (body?.get("amal") as? JsonPrimitive)?.content
        val args = body?.get("args") as? JsonObject
        if (amal == "tasdiq") return confirm()
        return when ((body?.get("nom") as? JsonPrimitive)?.content) {
            "f2" -> ok(buildJsonObject {
                put("ok", true)
                put("akt", buildJsonObject { put("id", 503); put("obyekt_id", 101); put("raqam", "F2-0014"); put("oy", "2026-11-01"); put("holat", "qoralama"); put("lifecycle_status", "draft"); put("versiya", version) })
                put("summa", JsonObject(pack(total(rows)) + ("narxsiz_soni" to JsonPrimitive(rows.count { it.narx == null }))))
                put("qatorlar", buildJsonArray { rows.forEach { r -> add(buildJsonObject {
                    put("qator_id", r.id); put("kod", r.kod); put("nom", r.nom); put("birlik", r.birlik); put("hajm", r.hajm)
                    if (r.narx != null) { put("narx", r.narx); put("summa", Math.round(r.narx!! * r.hajm * 100) / 100.0) } else { put("narx", JsonNull); put("summa", JsonNull) }
                }) } })
                put("keyingi_offset", JsonNull)
            })
            "f2_qoralama_tahrir" -> preview(args ?: return err(400, "ARGUMENT_NOTOGRI"))
            "bajarilmadi" -> ok(buildJsonObject { put("ok", true); put("holat", "tasdiq_kerak"); put("token", "demo-baj"); put("tavsif", "Bajarilmadi belgisi (asl smeta o'zgarmaydi)"); put("preview", buildJsonObject { put("qatorlar", buildJsonArray {}); put("jami", buildJsonObject {}); put("natijalar", buildJsonArray {}) }) })
            else -> err(400, "VOSITA_NOMALUM")
        }
    }

    private fun preview(a: JsonObject): ApiResult {
        val oz = (a["ozgartir"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
        val rm = (a["olib_tashla"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.longOrNull }.toSet()
        val after = rows.filter { it.id !in rm }.map { r -> val c = oz.firstOrNull { it.l("qator_id") == r.id }; R(r.id, r.kod, r.nom, r.birlik, c?.d("hajm") ?: r.hajm, c?.d("narx") ?: r.narx) }
        pending = a
        return ok(buildJsonObject {
            put("ok", true); put("holat", "tasdiq_kerak"); put("token", "demo-token"); put("tavsif", "F2 qoralama tahriri (demo)")
            if (after.any { it.narx == null }) put("ogohlantirish", buildJsonArray { add(JsonPrimitive("Narxsiz qator bor: ${after.count { it.narx == null }} ta")) })
            put("preview", buildJsonObject {
                put("qatorlar", buildJsonArray {
                    rows.forEach { r ->
                        val n = after.firstOrNull { it.id == r.id }
                        if (n == null) add(buildJsonObject { put("qator_id", r.id); put("kod", r.kod); put("nom", r.nom); put("birlik", r.birlik); put("olib_tashlandi", true); put("ozgarish", buildJsonArray {}) })
                        else if (n.hajm != r.hajm || n.narx != r.narx) add(buildJsonObject {
                            put("qator_id", r.id); put("kod", r.kod); put("nom", r.nom); put("birlik", r.birlik)
                            put("ozgarish", buildJsonArray {
                                if (n.hajm != r.hajm) add(buildJsonObject { put("maydon", "certified_quantity"); put("oldin", r.hajm); put("keyin", n.hajm) })
                                if (n.narx != r.narx) add(buildJsonObject { put("maydon", "certified_unit_price"); put("oldin", r.narx); put("keyin", n.narx) })
                            })
                        })
                    }
                })
                put("jami", buildJsonObject { put("oldin", pack(total(rows))); put("keyin", pack(total(after))); put("farq", JsonNull) })
                put("natijalar", buildJsonArray {})
            })
        })
    }

    private fun confirm(): ApiResult {
        val a = pending ?: return ok(buildJsonObject { put("ok", true); put("holat", "yozildi") })
        pending = null
        val oz = (a["ozgartir"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
        val rm = (a["olib_tashla"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.longOrNull }.toSet()
        rows.removeAll { it.id in rm }
        rows.forEach { r -> oz.firstOrNull { it.l("qator_id") == r.id }?.let { c -> c.d("hajm")?.let { r.hajm = it }; c.d("narx")?.let { r.narx = it } } }
        if (oz.isNotEmpty() || rm.isNotEmpty()) version++
        return ok(buildJsonObject { put("ok", true); put("holat", "yozildi") })
    }

    /** Demo of GET /api/hujjat-maydoni?amal=paket_royxat | filtr_royxat (Hujjatlar paketi). Filters are applied to three canned candidates. */
    fun paket(path: String): ApiResult {
        if (path.contains("amal=filtr_royxat")) return ok(buildJsonObject { put("ok", true); put("filtrlar", buildJsonArray { add(buildJsonObject { put("id", 1); put("nom", "Texnadzor to'plami"); put("filtr", buildJsonObject { put("turlar", buildJsonArray { add(JsonPrimitive("f2")) }) }) }) }) })
        val q = java.net.URLDecoder.decode(path.substringAfter("filtr=", "{}").substringBefore('&'), "UTF-8")
        val f = runCatching { json.parseToJsonElement(q) as JsonObject }.getOrDefault(buildJsonObject {})
        val turlar = (f["turlar"] as? JsonArray).orEmpty().map { (it as JsonPrimitive).content }.toSet()
        val holatlar = (f["holatlar"] as? JsonArray).orEmpty().map { (it as JsonPrimitive).content }.toSet()
        fun c(k: String, tur: String, t: String, holat: String, oy: String, fayl: Long?, takror: Boolean = false) = buildJsonObject {
            put("kalit", k); put("tur", tur); put("sarlavha", t); put("holat", holat); put("obyekt_id", 101); put("obyekt_nom", "Demo korpus A"); put("oy", oy); put("shartnoma_id", 4); put("shartnoma_raqam", "17")
            put("akt_id", 503); put("forma3_id", JsonNull); put("taxminiy", false); put("takror", takror); put("fayl_id", fayl); put("versiya", if (fayl != null) 3 else null); put("yangilandi", if (fayl != null) java.time.Instant.now().minusSeconds(150).toString() else null); put("yasash", true); put("yangilanmoqda", false); put("navbat_holat", JsonNull)
        }
        val all = listOf(c("f2:503", "f2", "F-2 2026-11", "qoralama", "2026-11", null), c("f2:502", "f2", "F-2 2026-10", "tasdiqlangan", "2026-10", 99), c("f2:501", "f2", "F-2 2026-10 (2)", "tasdiqlangan", "2026-10", 98, true), c("nk:1", "nakopitelniy", "Nakopitelniy 2026-11", "tasdiqlangan", "2026-11", null))
        val rows = all.filter { r -> (turlar.isEmpty() || (r["tur"] as JsonPrimitive).content in turlar) && (holatlar.isEmpty() || (r["holat"] as JsonPrimitive).content in holatlar) }
        return ok(buildJsonObject {
            put("ok", true); put("jami", rows.size); put("kesilgan", false); put("offset", 0); put("nomzodlar", JsonArray(rows)); put("barcha_kalitlar", buildJsonArray { rows.forEach { add(it["kalit"]!!) } })
            if (path.contains("variantlar")) put("variantlar", buildJsonObject { put("shartnomalar", buildJsonArray { add(buildJsonObject { put("id", 4); put("raqam", "17") }) }); put("obyektlar", buildJsonArray { add(buildJsonObject { put("id", 101); put("nom", "Demo korpus A"); put("shartnoma_id", 4) }) }) })
        })
    }

    /** Demo of POST /api/hujjat-paket (baho / yig): fixed estimate, the "link" form the phone always asks for. */
    fun paketPost(body: JsonObject?): ApiResult {
        val keys = (body?.get("kalitlar") as? JsonArray).orEmpty().size
        return if ((body?.get("amal") as? JsonPrimitive)?.content == "baho") ok(buildJsonObject { put("ok", true); put("tanlangan", keys); put("tolanadigan", if (keys > 0) 1 else 0); put("bepul", maxOf(0, keys - 1)); put("token", if (keys > 0) 24.0 else 0.0) })
        else ok(buildJsonObject { put("ok", true); put("havola", "/api/hujjat-paket?amal=ol&k=paket%2Fu1%2Fdemo"); put("hajm", 4096); put("soni", keys); put("xatolar", buildJsonArray {}) })
    }

    fun tekshiruv(method: String, body: JsonObject?): ApiResult {
        if (method == "POST") {
            val id = body?.l("taklif_id") ?: return err(400, "TALAB_NOTOGRI")
            val q = (body["qaror"] as? JsonPrimitive)?.content ?: return err(400, "TALAB_NOTOGRI")
            val why = (body["sabab"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
            if (q == "rad" && (why?.trim()?.length ?: 0) < 3) return err(400, "SABAB_KERAK")
            decisions[id] = q to why
            return ok(buildJsonObject { put("ok", true); put("qaror", q) })
        }
        fun s(id: Long, qid: Long, flag: String, vol: Double?) = buildJsonObject {
            val r = rows.firstOrNull { it.id == qid }
            put("id", id); put("tekshiruv_id", 1); put("qator_id", qid); put("kod", r?.kod); put("nom", r?.nom); put("birlik", r?.birlik); put("bayroq", flag)
            put("izoh", if (flag == "olib_tashlansin") "Bu ish ob'ektda bajarilmagan" else "Haqiqiy hajm kamroq, o'lchov aktiga qarang")
            if (vol != null) put("taklif_hajm", vol) else put("taklif_hajm", JsonNull)
            put("rang", JsonNull); put("hujjat_turi", JsonNull); put("qosh", false)
            put("qaror", decisions[id]?.first ?: "kutilmoqda"); put("qaror_sabab", decisions[id]?.second); put("hujjat_id", JsonNull)
            put("joriy_hajm", r?.hajm); put("akt_versiya", version); put("eskirgan", false)
        }
        val list = buildJsonArray { if (rows.any { it.id == 1003L }) add(s(1, 1003, "hajm_notogri", 2.1)); if (rows.any { it.id == 1008L }) add(s(2, 1008, "olib_tashlansin", null)) }
        return ok(buildJsonObject { put("ok", true); put("akt", buildJsonObject { put("id", 503); put("versiya", version); put("holat", "qoralama"); put("lifecycle_status", "draft") }); put("tekshiruvlar", buildJsonArray {}); put("takliflar", list) })
    }
}
