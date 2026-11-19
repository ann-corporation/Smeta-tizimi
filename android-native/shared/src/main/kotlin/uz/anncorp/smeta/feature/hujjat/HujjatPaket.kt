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
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
import uz.anncorp.smeta.core.data.GEN_PATH
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.mapGenError
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.safeFileName
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

/** What the document engine needs to build one candidate; null = this type exists only on the Disk. Mirror of yasashSorovi (TS). */
data class BuildRequest(val type: String, val params: Map<String, Long>)

fun buildRequest(r: PaketRow): BuildRequest? = when (r.type) {
    "f2" -> r.aktId?.let { BuildRequest("f2", mapOf("akt_id" to it)) }
    "forma3" -> if (r.forma3Id != null && r.contractId != null) BuildRequest("forma3", mapOf("shartnoma_id" to r.contractId, "f3_id" to r.forma3Id)) else null
    "nakopitelniy", "m29" -> r.month?.takeIf { it.length == 7 }?.replace("-", "")?.toLongOrNull()?.let { BuildRequest(r.type, mapOf("oy_son" to it)) }
    "slichitelniy", "ostatka" -> BuildRequest(r.type, emptyMap())
    else -> null
}

fun paketBuildBody(companyId: Long, objectId: Long, b: BuildRequest): JsonObject = buildJsonObject {
    put("amal", "yarat"); put("tur", b.type); put("format", "xlsx"); put("kompaniya_id", companyId); put("obyekt_id", objectId)
    b.params.forEach { (k, v) -> put(k, v) }
    if (b.type == "f2") put("disk_afzal", 1)   // a newer Disk version is served instantly and free
}

private const val XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

class PaketRepository(private val api: BffApi) {
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

    /** Disk copy first (free), otherwise the server engine. The result is the final file; nothing is built on the device. */
    suspend fun fetch(companyId: Long, row: PaketRow): GenResult {
        if (row.fileId != null) {
            val d = api.bffBytes("/api/hujjat-maydoni-ol?id=${row.fileId}", DOC_MAX_BYTES)
            if (d.ok && d.bytes != null && d.bytes!!.isNotEmpty()) return GenResult.Ready(d.filename ?: (safeFileName(row.title, "hujjat") + ".xlsx"), d.mime?.takeIf { it.isNotBlank() } ?: XLSX, d.bytes!!)
        }
        val b = buildRequest(row) ?: return GenResult.Failed("DISKDA_YOQ")
        val oid = row.objectId ?: return GenResult.Failed("OBYEKT_YOQ")
        val r = api.bffPostBytes(GEN_PATH, paketBuildBody(companyId, oid, b), DOC_MAX_BYTES)
        if (!r.ok || r.bytes == null || r.bytes!!.isEmpty()) return mapGenError(r.status, r.code)
        return GenResult.Ready(r.filename ?: (safeFileName(row.title, "hujjat") + ".xlsx"), r.mime?.takeIf { it.isNotBlank() } ?: XLSX, r.bytes!!)
    }
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