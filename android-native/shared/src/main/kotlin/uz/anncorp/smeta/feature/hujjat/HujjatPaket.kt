package uz.anncorp.smeta.feature.hujjat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.mapGenError
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.net.URLEncoder

/*
 * Hujjatlar paketi (filter -> list -> download / share), shared by Android and Windows. The server filters and paginates
 * (GET /api/hujjat-maydoni?amal=paket_royxat -> t2_hujjat_paket_royxat_v1); a file that already exists on the Disk is taken from there for free
 * (/api/hujjat-maydoni-ol), the rest is built by the single document engine (/api/hujjat-yarat, tokens are charged by the server). Mirror of
 * frontend/src/api/hujjat-paket.ts and lib/hujjat-paket/yasash-sorov.ts; the app builds no document and computes no sum.
 */

const val PAKET_PAGE = 50
val PAKET_TURLAR = listOf("f2", "forma3", "nakopitelniy", "m29", "slichitelniy", "ostatka", "aosr")
val PAKET_HOLATLAR = listOf("tasdiqlangan", "qoralama")
private val OY_RE = Regex("^\\d{4}-(0[1-9]|1[0-2])$")

fun paketTurLabel(t: String): String = when (t) {
    "f2" -> "F-2"; "forma3" -> "F-3"; "nakopitelniy" -> "Nakopitelniy"; "m29" -> "M-29"; "slichitelniy" -> "Slichitelniy"; "ostatka" -> "Ostatka"; "aosr" -> "AOSR"; else -> t
}

data class PaketFilter(
    val shartnomaId: Long? = null, val obyektIds: List<Long> = emptyList(), val turlar: Set<String> = emptySet(), val holatlar: Set<String> = emptySet(), val oyDan: String = "", val oyGacha: String = "",
) {
    val isEmpty: Boolean get() = shartnomaId == null && obyektIds.isEmpty() && turlar.isEmpty() && holatlar.isEmpty() && oyDan.isBlank() && oyGacha.isBlank()
    /** One month picked = oyDan=oyGacha is the site rule (oyOraligi): a reversed range is swapped. */
    fun withMonths(dan: String, gacha: String): PaketFilter { val d = dan.takeIf { OY_RE.matches(it) }.orEmpty(); val g = gacha.takeIf { OY_RE.matches(it) }.orEmpty(); return if (d.isNotEmpty() && g.isNotEmpty() && d > g) copy(oyDan = g, oyGacha = d) else copy(oyDan = d, oyGacha = g) }
    /** An empty month box means "no limit"; a filled one must be YYYY-MM. */
    val monthsValid: Boolean get() = (oyDan.isBlank() || OY_RE.matches(oyDan)) && (oyGacha.isBlank() || OY_RE.matches(oyGacha))
    fun toJson(offset: Int = 0, limit: Int = PAKET_PAGE, variants: Boolean = false): JsonObject = buildJsonObject {
        shartnomaId?.let { put("shartnoma_ids", buildJsonArray { add(JsonPrimitive(it)) }) }
        if (obyektIds.isNotEmpty()) put("obyekt_ids", buildJsonArray { obyektIds.forEach { add(JsonPrimitive(it)) } })
        if (turlar.isNotEmpty()) put("turlar", buildJsonArray { PAKET_TURLAR.filter { it in turlar }.forEach { add(JsonPrimitive(it)) } })
        if (holatlar.isNotEmpty()) put("holatlar", buildJsonArray { PAKET_HOLATLAR.filter { it in holatlar }.forEach { add(JsonPrimitive(it)) } })
        if (OY_RE.matches(oyDan)) put("oy_dan", oyDan)
        if (OY_RE.matches(oyGacha)) put("oy_gacha", oyGacha)
        put("offset", offset); put("sahifa_limit", limit)
        if (variants) put("variantlar", true)
    }
    /** The saved-filter payload: no paging fields (site saqlanadiganFiltr). */
    fun toSavedJson(): JsonObject = JsonObject(toJson().filterKeys { it != "offset" && it != "sahifa_limit" && it != "variantlar" })
}

fun paketListPath(companyId: Long, f: PaketFilter, offset: Int = 0, limit: Int = PAKET_PAGE, variants: Boolean = false): String =
    "/api/hujjat-maydoni?amal=paket_royxat&kompaniya_id=$companyId&filtr=" + URLEncoder.encode(f.toJson(offset, limit, variants).toString(), "UTF-8")

data class PaketRow(
    val key: String, val type: String, val title: String, val status: String?, val objectName: String?, val contract: String?, val month: String?,
    val objectId: Long?, val aktId: Long?, val forma3Id: Long?, val contractId: Long?, val fileId: Long?, val version: Int?, val approximate: Boolean, val duplicate: Boolean, val bytes: Long?,
    val updatedAt: String? = null, val updating: Boolean = false, val queueState: String? = null,
) {
    /** The site never lets a duplicate (second F-2 of a month) or an approximate draft be picked. */
    val selectable: Boolean get() = !duplicate && !approximate
    /** Already on the Disk: downloading is free. */
    val onDisk: Boolean get() = fileId != null
}

data class PaketVariants(val contracts: List<Pair<Long, String?>>, val objects: List<Triple<Long, String?, Long?>>)
data class PaketPage(val rows: List<PaketRow>, val total: Int, val truncated: Boolean, val offset: Int, val allKeys: List<String> = emptyList(), val variants: PaketVariants? = null) { val hasMore: Boolean get() = offset + rows.size < total }

fun parsePaketPage(body: JsonElement?): PaketPage? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list = o["nomzodlar"].arr() ?: return null
    val rows = list.mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        val key = r["kalit"].str() ?: return@mapNotNull null
        PaketRow(
            key, r["tur"].str().orEmpty(), r["sarlavha"].str()?.takeIf { it.isNotBlank() } ?: key, r["holat"].str(), r["obyekt_nom"].str(), r["shartnoma_raqam"].str(), r["oy"].str(),
            r["obyekt_id"].num()?.toLong(), r["akt_id"].num()?.toLong(), r["forma3_id"].num()?.toLong(), r["shartnoma_id"].num()?.toLong(), r["fayl_id"].num()?.toLong(),
            r["versiya"].num()?.toInt(), (r["taxminiy"] as? JsonPrimitive)?.booleanOrNull == true, (r["takror"] as? JsonPrimitive)?.booleanOrNull == true, r["bayt"].num()?.toLong(),
            r["yangilandi"].str(), (r["yangilanmoqda"] as? JsonPrimitive)?.booleanOrNull == true, r["navbat_holat"].str(),
        )
    }
    val v = o["variantlar"].obj()?.let { vo ->
        PaketVariants(
            vo["shartnomalar"].arr().orEmpty().mapNotNull { x -> x.obj()?.let { s -> s["id"].num()?.toLong()?.let { it to s["raqam"].str() } } },
            vo["obyektlar"].arr().orEmpty().mapNotNull { x -> x.obj()?.let { s -> s["id"].num()?.toLong()?.let { Triple(it, s["nom"].str(), s["shartnoma_id"].num()?.toLong()) } } },
        )
    }
    return PaketPage(rows, o["jami"].num()?.toInt() ?: rows.size, (o["kesilgan"] as? JsonPrimitive)?.booleanOrNull == true, o["offset"].num()?.toInt() ?: 0,
        o["barcha_kalitlar"].arr()?.mapNotNull { it.str() } ?: rows.map { it.key }, v)
}

enum class PaketFormat(val wire: String) { ZIP("zip"), EXCEL("excel") }

/** Server estimate (POST /api/hujjat-paket baho): nothing is charged. [token] null = price unknown. Mirrors the site's yuklashBahosi (computed on the server). */
data class PaketEstimate(val selected: Int, val payable: Int, val free: Int, val token: Double?)

const val PAKET_API = "/api/hujjat-paket"
/** Packages above 100 MB are refused on the phone; the server itself never refuses. */
const val PAKET_PHONE_MAX = 100L * 1024 * 1024

private fun paketBody(amal: String, companyId: Long, f: PaketFilter, keys: Collection<String>): JsonObject = buildJsonObject {
    put("amal", amal); put("kompaniya_id", companyId); put("filtr", f.toSavedJson())
    if (keys.isNotEmpty()) put("kalitlar", buildJsonArray { keys.forEach { add(JsonPrimitive(it)) } })
}
fun paketBahoBody(companyId: Long, f: PaketFilter, keys: Collection<String>) = paketBody("baho", companyId, f, keys)
fun paketYigBody(companyId: Long, f: PaketFilter, keys: Collection<String>, format: PaketFormat, title: String) = JsonObject(paketBody("yig", companyId, f, keys) + mapOf(
    "chiqish" to JsonPrimitive(format.wire), "sarlavha" to JsonPrimitive(title), "yetkazish" to JsonPrimitive("havola"),
))

fun parsePaketEstimate(body: JsonElement?): PaketEstimate? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return PaketEstimate(o["tanlangan"].num()?.toInt() ?: 0, o["tolanadigan"].num()?.toInt() ?: 0, o["bepul"].num()?.toInt() ?: 0, o["token"].num())
}

/** `{ok, havola, hajm, soni, xatolar[]}` of a finished package (the phone always asks for the link form). */
data class PaketLink(val path: String, val size: Long, val count: Int, val errors: List<String>)
fun parsePaketLink(body: JsonElement?): PaketLink? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val p = o["havola"].str()?.takeIf { it.startsWith("/api/hujjat-paket?") } ?: return null
    return PaketLink(p, o["hajm"].num()?.toLong() ?: 0L, o["soni"].num()?.toInt() ?: 0, o["xatolar"].arr().orEmpty().mapNotNull { it.str() })
}

sealed interface PaketBuild {
    data class Ready(val name: String, val mime: String, val bytes: ByteArray, val errors: List<String>) : PaketBuild
    data class Failed(val result: GenResult) : PaketBuild
}

class PaketRepository(private val api: BffApi) {
    suspend fun estimate(companyId: Long, f: PaketFilter, keys: Collection<String>): PaketEstimate? {
        val r = api.bff(PAKET_API, "POST", paketBahoBody(companyId, f, keys))
        return if (r.ok) parsePaketEstimate(r.body) else null
    }

    /** The server builds the ZIP / single Excel (site rules: Disk first, the rest through the engine, tokens charged once there); the phone only downloads the file. */
    suspend fun build(companyId: Long, f: PaketFilter, keys: Collection<String>, format: PaketFormat, title: String): PaketBuild {
        val r = api.bff(PAKET_API, "POST", paketYigBody(companyId, f, keys, format, title))
        val link = if (r.ok) parsePaketLink(r.body) else null
        if (link == null) return PaketBuild.Failed(mapGenError(r.status, r.code ?: r.body.obj()?.get("code").str()))
        val d = api.bffBytes(link.path, PAKET_PHONE_MAX)
        if (!d.ok || d.bytes == null || d.bytes!!.isEmpty()) return PaketBuild.Failed(mapGenError(d.status, d.code))
        val zip = format == PaketFormat.ZIP
        return PaketBuild.Ready(d.filename ?: if (zip) "hujjatlar-paketi.zip" else "hujjatlar-paketi.xlsx", d.mime?.takeIf { it.isNotBlank() } ?: if (zip) "application/zip" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", d.bytes!!, link.errors)
    }

    /** null = could not load. */
    suspend fun page(companyId: Long, f: PaketFilter, offset: Int, variants: Boolean = false): PaketPage? {
        val r = api.bff(paketListPath(companyId, f, offset, PAKET_PAGE, variants))
        return if (r.ok) parsePaketPage(r.body) else null
    }

    suspend fun saved(companyId: Long): List<SavedFilter> {
        val r = api.bff("/api/hujjat-maydoni?amal=filtr_royxat&kompaniya_id=$companyId")
        if (!r.ok) return emptyList()
        return r.body.obj()?.get("filtrlar").arr().orEmpty().mapNotNull { e -> e.obj()?.let { o -> o["id"].num()?.toLong()?.let { SavedFilter(it, o["nom"].str().orEmpty(), parseSavedFilter(o["filtr"])) } } }
    }
    suspend fun save(companyId: Long, name: String, f: PaketFilter): Boolean =
        api.bff("/api/hujjat-maydoni", "POST", buildJsonObject { put("amal", "filtr_saqla"); put("kompaniya_id", companyId); put("nom", name); put("filtr", f.toSavedJson()) }).let { it.ok && (it.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull == true }
    suspend fun delete(companyId: Long, id: Long): Boolean =
        api.bff("/api/hujjat-maydoni", "POST", buildJsonObject { put("amal", "filtr_ochir"); put("kompaniya_id", companyId); put("id", id) }).ok

}

data class SavedFilter(val id: Long, val name: String, val filter: PaketFilter)

/** Saved filter (server JSON, snake_case) -> UI filter; unknown values dropped, a reversed month range swapped (site filtrniTozala). */
fun parseSavedFilter(x: JsonElement?): PaketFilter {
    val o = x.obj() ?: return PaketFilter()
    val ids = { k: String -> o[k].arr().orEmpty().mapNotNull { it.num()?.toLong()?.takeIf { n -> n > 0 } }.take(200) }
    val oy = { k: String -> o[k].str()?.takeIf { OY_RE.matches(it) }.orEmpty() }
    return PaketFilter(
        ids("shartnoma_ids").firstOrNull(), ids("obyekt_ids"), o["turlar"].arr().orEmpty().mapNotNull { it.str() }.filter { it in PAKET_TURLAR }.toSet(),
        o["holatlar"].arr().orEmpty().mapNotNull { it.str() }.filter { it in PAKET_HOLATLAR }.toSet(),
    ).withMonths(oy("oy_dan"), oy("oy_gacha"))
}

/** Object type-to-search (site obyektQidir): by name, case-insensitive, not already picked, at most 8. */
fun searchObjects(objects: List<Pair<Long, String>>, q: String, picked: List<Long>, max: Int = 8): List<Pair<Long, String>> {
    val s = q.trim().lowercase()
    if (s.isEmpty()) return emptyList()
    return objects.filter { it.first !in picked && it.second.lowercase().contains(s) }.take(max)
}

/** Freshness line, as the site yangilikMatni: "Excel tayyor · v5 · 2 daqiqa oldin" / "Yangilanmoqda" / "Diskda yo'q". [ago] = text of the elapsed time. */
fun freshness(r: PaketRow, ago: (Long?) -> String?): FreshKey = when {
    r.queueState == "xato" -> FreshKey.Failed
    r.fileId == null -> if (r.updating) FreshKey.Updating else FreshKey.NoDisk
    else -> FreshKey.Ready(r.updating, r.version, ago(r.updatedAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }))
}
sealed interface FreshKey {
    data object Failed : FreshKey
    data object Updating : FreshKey
    data object NoDisk : FreshKey
    data class Ready(val old: Boolean, val version: Int?, val ago: String?) : FreshKey
}

/** Bucket of an elapsed time: null = just now (site oldin()). */
fun elapsedBucket(ms: Long): Pair<String, Long>? {
    if (ms < 0) return null
    val s = ms / 1000; if (s < 60) return null
    val m = s / 60; if (m < 60) return "m" to m
    val h = m / 60; if (h < 24) return "h" to h
    return "d" to h / 24
}