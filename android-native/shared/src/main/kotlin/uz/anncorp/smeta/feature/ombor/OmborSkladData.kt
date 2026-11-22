package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Site «Sklad (qoldiq)» tabs (frontend/src/test02/TestSklad.tsx + components/ombor): the wire of every read/write the tabs make.
 * The same server endpoints as the site (/api/ombor-buyruq, /api/sb soro/jadval, /api/sb-yoz amal); the device only shows what the server computed.
 */

private const val SAHIFA = 50
const val OMBOR_PAGE = SAHIFA

private fun JsonObject.keep(k: String, v: String?): JsonObject = if (v.isNullOrBlank()) this else JsonObject(this + (k to JsonPrimitive(v.trim())))

/** Site `sbSkladYarat` -> `resursYarat('sklad')`: the independent-warehouse create command. */
fun skladCreatePayload(companyId: Long, nomi: String, operationId: String): JsonObject = buildJsonObject {
    put("amal", "sklad_mustaqil_yarat"); put("kompaniya_id", companyId); put("nomi", nomi.trim()); put("operation_id", operationId)
}

const val NAVOIY_SKLAD_NOMI = "NEW TIMES BUILDINGS MCHJ — Navoiy bog' skladi"
const val NAVOIY_KOMPANIYA_ID = 123L

// ---- Hisobot (Bugun / Hisobot sub-tabs) ----
data class HisobotFilter(
    val davr: String = "oy", val dan: String = "", val gacha: String = "", val operatsiya: String = "", val qidir: String = "",
    val yetkazuvchi: String = "", val qabul: String = "", val obyekt: String = "",
)

fun hisobotRequest(companyId: Long, skladId: Long, f: HisobotFilter, offset: Int): JsonObject = buildJsonObject {
    put("amal", "hisobot"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("limit", SAHIFA); put("offset", offset)
    put("filtr", buildJsonObject {
        put("davr", f.davr)
        if (f.davr == "ixtiyoriy") { if (f.dan.isNotBlank()) put("dan", f.dan); if (f.gacha.isNotBlank()) put("gacha", f.gacha) }
        if (f.operatsiya.isNotBlank()) put("operatsiya", f.operatsiya)
        if (f.qidir.isNotBlank()) put("qidir", f.qidir.trim())
        if (f.yetkazuvchi.isNotBlank()) put("yetkazuvchi", f.yetkazuvchi.trim())
        if (f.qabul.isNotBlank()) put("qabul", f.qabul.trim())
        if (f.obyekt.isNotBlank()) put("obyekt", f.obyekt.trim())
    })
}

data class HUnit(val unit: String, val kirim: Double, val chiqim: Double)
data class HJami(val kirimSoni: Int, val chiqimSoni: Int, val units: List<HUnit>, val kirimSumma: Double, val kirimSummaQqs: Double, val narxsiz: Int, val qqsFoiz: Double)
data class HRow(val id: Long, val sana: String, val kirim: Boolean, val nomi: String, val birligi: String, val miqdor: Double?, val kontragent: String?, val obyekt: String?, val summa: Double?, val summaQqs: Double?)
data class Hisobot(val jami: HJami, val chetlatilgan: Int, val jamiQator: Int, val rows: List<HRow>)

fun parseHisobot(body: JsonElement?): Hisobot? {
    val o = body.obj() ?: return null
    if (o["ok"].let { (it as? JsonPrimitive)?.booleanOrNull } == false) return null
    val j = o["jami"].obj() ?: return null
    val units = j["birliklar"].arr().orEmpty().mapNotNull { e -> e.obj()?.let { HUnit(it["birligi"].str().orEmpty(), it["kirim"].num() ?: 0.0, it["chiqim"].num() ?: 0.0) } }
    val jami = HJami(j["kirim_soni"].num()?.toInt() ?: 0, j["chiqim_soni"].num()?.toInt() ?: 0, units, j["kirim_summa"].num() ?: 0.0, j["kirim_summa_qqs"].num() ?: 0.0, j["narxsiz_soni"].num()?.toInt() ?: 0, j["qqs_foiz"].num() ?: 12.0)
    val rows = o["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        HRow(r["id"].num()?.toLong() ?: return@mapNotNull null, r["sana"].str().orEmpty(), r["operatsiya"].str() == "prixod", r["nomi"].str().orEmpty(), r["birligi"].str().orEmpty(),
            r["obyomi"].num(), r["kontragent"].str()?.takeIf { it.isNotBlank() }, r["obyekt"].str()?.takeIf { it.isNotBlank() }, r["summa"].num(), r["summa_qqs"].num())
    }
    return Hisobot(jami, o["chetlatilgan"].num()?.toInt() ?: 0, o["jami_qator"].num()?.toInt() ?: rows.size, rows)
}

fun narxQoyBody(companyId: Long, skladId: Long, harakatId: Long, narx: String): JsonObject = buildJsonObject {
    put("amal", "narx_qoy"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("harakat_id", harakatId); put("narx", narx.replace(',', '.').replace(Regex("[\\s  ]"), ""))
}

// ---- Qoldiq sub-tab: grouped balance (any date), material card with history + correction ----
data class QGroup(val kalit: String, val nomi: String, val birligi: String, val kirim: Double, val chiqim: Double, val qoldiq: Double, val variantlar: Int)
data class QPage(val jami: Int, val rows: List<QGroup>, val turlar: List<String> = emptyList())

fun qoldiqRequest(companyId: Long, skladId: Long, query: String, positiveOnly: Boolean, date: String?, offset: Int, tur: String = ""): JsonObject = buildJsonObject {
    put("amal", "qoldiq"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("limit", SAHIFA); put("offset", offset)
    if (!date.isNullOrBlank()) put("sana", date)
    put("filtr", buildJsonObject { if (query.isNotBlank()) put("qidir", query.trim()); if (tur.isNotBlank()) put("tur", tur); put("musbat", if (positiveOnly) "1" else "0"); put("tartib", "nom") })
}

fun parseQoldiq(body: JsonElement?): QPage? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val rows = o["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        QGroup(r["kalit"].str() ?: r["nomi"].str() ?: return@mapNotNull null, r["nomi"].str().orEmpty(), r["birligi"].str().orEmpty(), r["kirim"].num() ?: 0.0, r["chiqim"].num() ?: 0.0, r["qoldiq"].num() ?: 0.0, r["variantlar_soni"].num()?.toInt() ?: 1)
    }
    return QPage(o["jami"].num()?.toInt() ?: rows.size, rows, o["turlar"].arr().orEmpty().mapNotNull { it.str() })
}

data class THarakat(val id: Long, val sana: String, val kirim: Boolean, val nomi: String, val birligi: String, val miqdor: Double?, val postavshik: String?, val qabul: String?, val manba: String, val teskari: Boolean)
val TUZATILADI = setOf("ombor_prixod_v1", "ombor_chiqim_v1", "ombor_prixod_sinxron_v1", "c11_warehouse_receipt_v1")

fun tarixRequest(companyId: Long, skladId: Long, kalit: String, birlik: String): JsonObject = buildJsonObject {
    put("amal", "tarix"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("kalit", kalit); put("birlik", birlik); put("limit", 100); put("offset", 0)
}

fun parseTarix(body: JsonElement?): List<THarakat>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return o["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        THarakat(r["id"].num()?.toLong() ?: return@mapNotNull null, r["sana"].str().orEmpty(), r["operatsiya"].str() == "prixod", r["nomi"].str().orEmpty(), r["birligi"].str().orEmpty(), r["obyomi"].num(),
            r["postavshik"].str()?.takeIf { it.isNotBlank() }, r["qabul_qiluvchi"].str()?.takeIf { it.isNotBlank() }, r["manba"].str().orEmpty(), (r["teskari"] as? JsonPrimitive)?.booleanOrNull == true)
    }
}

/** Correction of one movement: new quantity (cancel = null) + a mandatory reason; operation_id is created once per open form. */
fun tuzatBody(companyId: Long, skladId: Long, harakatId: Long, newQty: String?, reason: String, operationId: String): JsonObject = buildJsonObject {
    put("amal", "tuzat"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("harakat_id", harakatId)
    if (newQty == null) put("yangi", JsonNull) else put("yangi", buildJsonObject { put("miqdor", newQty.replace(',', '.')) })
    put("sabab", reason.trim()); put("operation_id", operationId)
}

fun tuzatValid(newQty: String, reason: String, cancel: Boolean): Boolean =
    reason.isNotBlank() && (cancel || (newQty.replace(',', '.').toDoubleOrNull()?.let { it > 0 } == true))

// ---- Kirim tab (sklad_kirim_royxat_v1) + storno ----
data class KFilter(val qidir: String = "", val yetkazuvchi: String = "", val dan: String = "", val gacha: String = "", val tur: String = "")
data class KRow(val id: Long, val sana: String, val nomi: String, val birligi: String, val miqdor: Double?, val postavshik: String?, val tur: String?, val faylId: Long?, val varaq: String?, val qator: Long?, val storno: Boolean, val manbaTuri: String?, val yaratildi: String?)
data class KJami(val nomi: String, val birligi: String, val kirim: Double, val storno: Double, val sofKirim: Double)
data class KPage(val jami: Int, val rasxodKiritilgan: Boolean, val rows: List<KRow>, val materiallar: List<KJami>)

fun kirimRoyxatRequest(companyId: Long, skladId: Long, f: KFilter, limit: Int, offset: Int): JsonObject = buildJsonObject {
    put("soro", "sklad_kirim_royxat_v1"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("limit", limit); put("offset", offset)
    put("filtr", buildJsonObject {
        if (f.dan.isNotBlank()) put("dan", f.dan.trim()); if (f.gacha.isNotBlank()) put("gacha", f.gacha.trim()); if (f.qidir.isNotBlank()) put("qidir", f.qidir.trim())
        if (f.tur.isNotBlank()) put("tur", f.tur.trim()); if (f.yetkazuvchi.isNotBlank()) put("yetkazuvchi", f.yetkazuvchi.trim())
    })
}

fun parseKirimRoyxat(body: JsonElement?): KPage? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val o = root["natija"].obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val rows = o["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        KRow(r["id"].num()?.toLong() ?: return@mapNotNull null, r["sana"].str().orEmpty(), r["nomi"].str().orEmpty(), r["birligi"].str().orEmpty(), r["obyomi"].num(), r["postavshik"].str()?.takeIf { it.isNotBlank() },
            r["turi"].str(), r["manba_fayl_id"].num()?.toLong(), r["manba_varaq"].str(), r["manba_qator"].num()?.toLong(), (r["storno"] as? JsonPrimitive)?.booleanOrNull == true, r["manba_turi"].str(), r["yaratildi"].str())
    }
    val mats = o["jami_materiallar"].arr().orEmpty().mapNotNull { e -> e.obj()?.let { KJami(it["nomi"].str().orEmpty(), it["birligi"].str().orEmpty(), it["kirim"].num() ?: 0.0, it["storno"].num() ?: 0.0, it["sof_kirim"].num() ?: 0.0) } }
    return KPage(o["jami"].num()?.toInt() ?: rows.size, (o["rasxod_kiritilgan"] as? JsonPrimitive)?.booleanOrNull == true, rows, mats)
}

/** Site `stornoMumkin`: not yet reversed, created in the past (1 min clock skew allowed) and less than 24 hours ago. */
fun stornoPossible(r: KRow, nowMillis: Long = System.currentTimeMillis()): Boolean {
    val t = runCatching { java.time.OffsetDateTime.parse(r.yaratildi ?: return false).toInstant().toEpochMilli() }.getOrNull() ?: return false
    return !r.storno && t <= nowMillis + 60_000 && nowMillis - t < 24 * 3600_000L
}

fun stornoPayload(companyId: Long, harakatId: Long, reason: String, operationId: String): JsonObject = buildJsonObject {
    put("amal", "sklad_kirim_storno_v1"); put("kompaniya_id", companyId); put("harakat_id", harakatId); put("sabab", reason.trim()); put("operation_id", operationId)
}

fun stornoMessageKey(code: String?): String = when (code) {
    "STORNO_WINDOW_EXPIRED" -> "window"; "ALREADY_STORNED" -> "already"; "RECEIPT_NOT_STORNABLE" -> "not"; "REQUIRED_FIELD" -> "reason"; else -> "fail"
}

// ---- Jamlangan ombor (t2_sklad_konsolidatsiya) ----
data class KonsObj(val obyektId: Long, val nom: String, val qoldiq: Double)
data class KonsRow(val nomi: String, val birligi: String, val jami: Double, val obyektlar: List<KonsObj>)

fun konsRequest(skladId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_sklad_konsolidatsiya"); put("filtr", "sklad_id=eq.$skladId"); put("tartib", "material_nomi.asc"); put("limit", 1000)
}

fun parseKons(rows: List<JsonObject>): List<KonsRow> = rows.mapNotNull { r ->
    val items = r["obyektlar_boyicha"].arr().orEmpty().mapNotNull { e -> e.obj()?.let { KonsObj(it["obyekt_id"].num()?.toLong() ?: return@mapNotNull null, it["obyekt_nom"].str().orEmpty(), it["qoldiq"].num() ?: 0.0) } }
    KonsRow(r["material_nomi"].str() ?: return@mapNotNull null, r["birligi"].str().orEmpty(), r["jami_qoldiq"].num() ?: 0.0, items)
}

/** Site `obyektUlushlari`: share by positive quantity only (a negative balance has no share and is flagged), largest quantity first. */
data class KonsShare(val obj: KonsObj, val share: Double, val negative: Boolean)
fun konsShares(items: List<KonsObj>): List<KonsShare> {
    val total = items.sumOf { maxOf(0.0, it.qoldiq) }
    return items.map { KonsShare(it, if (total > 0) maxOf(0.0, it.qoldiq) / total else 0.0, it.qoldiq < 0) }.sortedByDescending { it.obj.qoldiq }
}
// ---- Harakatlar tarixi (t2_sklad_harakat of one object) ----
data class Jurnal(val id: Long, val sana: String?, val yaratildi: String?, val holat: String?, val amal: String?, val nomi: String?, val turi: String?, val miqdor: Double?, val birligi: String?, val postavshik: String?, val qabul: String?, val izoh: String?, val qabulTuri: String?, val kim: String?)

fun jurnalRequest(companyId: Long, objectId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_sklad_harakat"); put("filtr", "kompaniya_id=eq.$companyId&obyekt_id=eq.$objectId")
    put("ustunlar", "id,kompaniya_id,obyekt_id,operatsiya,turi,sana,nomi,birligi,obyomi,postavshik,qabul_qiluvchi,qabul_turi,izoh,operation_id,holat,yaratildi,kim,manba,m29_hujjat_id")
    put("tartib", "yaratildi.desc,id.desc"); put("limit", 1000)
}

fun parseJurnal(rows: List<JsonObject>): List<Jurnal> = rows.mapNotNull { r ->
    Jurnal(r["id"].num()?.toLong() ?: return@mapNotNull null, r["sana"].str(), r["yaratildi"].str(), r["holat"].str(), r["operatsiya"].str(), r["nomi"].str(), r["turi"].str(), r["obyomi"].num(), r["birligi"].str(),
        r["postavshik"].str(), r["qabul_qiluvchi"].str(), r["izoh"].str(), r["qabul_turi"].str(), r["kim"].str())
}

/** «2026-11-18T17:15:00+00:00» -> «18.11.2026 17:15» (local zone of the device is applied by the caller; here the wall-clock part is shown). */
fun skladStamp(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})").find(iso) ?: return iso
    val (y, mo, d, h, mi) = m.destructured
    return "$d.$mo.$y $h:$mi"
}

fun skladPositionState(q: Double): Int = if (q < 0) -1 else if (q == 0.0) 0 else 1
