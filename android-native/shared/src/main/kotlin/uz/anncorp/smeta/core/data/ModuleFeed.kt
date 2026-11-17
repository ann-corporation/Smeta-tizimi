package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Native office modules (narx, moliya, buxgalteriya, АОСР, tender, logistika, HR, sotuv, kompaniya) share ONE simple reader: a list of server
 * reads ("tabs"), each answered by the same BFF endpoint the website uses (/api/sb with `jadval` or `soro`). The server rows are shown as
 * cards (title, status, one big number, a few facts) and a detail sheet with every field. Nothing is computed on the device: a number the
 * server did not send is simply absent (never 0). Pure and tolerant: an unknown shape yields an empty list, never an exception.
 * Reused by the Windows app (module `:shared`).
 */

/** One server read. [soro] = named RPC (`soro`), otherwise a table read (`jadval` + [filter]); [listKey] = which array of the answer holds the rows. */
data class FeedSource(
    val key: String,
    val soro: String? = null,
    val table: String? = null,
    val filter: String? = null,
    val order: String? = null,
    val limit: Int = 300,
    val listKey: String? = null,
    /** Extra fixed parameters of a named read. */
    val extra: Map<String, String> = emptyMap(),
    /** `true`: the answer is a single record (profile, panel) and is shown as one card of facts. */
    val single: Boolean = false,
    /** Server-side search column (`ilike`) for table reads; null = the app filters the loaded rows. */
    val searchColumn: String? = null,
    /** Path other than /api/sb (a GET), e.g. the company profile. `{company}` is replaced by the company id. */
    val getPath: String? = null,
)

/** A module = its code, and the tabs it offers. */
data class FeedModule(val code: String, val sources: List<FeedSource>)

data class FeedFact(val label: String, val value: String, val number: Double? = null)

/** [amount] is the one big number (a server value), [amountLabel] its column name. */
data class FeedRow(val id: String, val title: String, val subtitle: String?, val amount: Double?, val amountLabel: String?, val facts: List<FeedFact>, val all: List<FeedFact>)

private val TITLE_KEYS = listOf("nom", "nomi", "name", "sarlavha", "mavzu", "title", "item_text", "kontragent", "taraf", "mijoz", "ism", "fio", "login", "raqam", "kod", "obyekt_nom", "material")
private val SUBTITLE_KEYS = listOf("holat", "status", "bosqich", "tur", "rol", "lavozim", "turi", "sana", "davr", "oy", "yaratildi")
private val AMOUNT_KEYS = listOf("qarz", "debitor", "summa", "jami", "jami_summa", "shartnoma_summa", "umumiy", "narx", "qiymat", "maosh", "tolangan", "qoldiq", "miqdor", "soni")
private val TEXT_NUMBER_KEYS = listOf("telefon", "raqam", "kod", "inn", "mfo", "hisob", "yil", "oy")
private val HIDDEN = setOf("id", "versiya", "kompaniya_id", "ok", "operation_id", "created_at", "updated_at", "yaratgan", "actor_id")

private fun JsonElement?.scalar(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.trim()?.takeIf { it.isNotEmpty() }

/** `qarz_summa` -> `Qarz summa`. */
fun humanKey(k: String): String = k.replace('_', ' ').trim().replaceFirstChar { it.uppercase() }

private fun isHiddenKey(k: String) = k in HIDDEN || (k.endsWith("_id") && k != "obyekt_id") || k.endsWith("_hash") || k.startsWith("p_")

/** Looks like an ISO date or timestamp; shown shortened. */
private fun short(v: String): String = if (Regex("^\\d{4}-\\d{2}-\\d{2}T.*").matches(v)) v.substring(0, 10) else v

/** Finds the row array: [listKey] first, then the usual keys, then the largest array of objects (in `natija` or at the top). */
fun findFeedRows(body: JsonElement?, listKey: String? = null): List<JsonObject> {
    val root = body as? JsonObject ?: return emptyList()
    val inner = (root["natija"] as? JsonObject) ?: root
    fun rows(a: JsonElement?): List<JsonObject>? = (a as? JsonArray)?.mapNotNull { it as? JsonObject }
    listOfNotNull(listKey).plus(listOf("qatorlar", "xodimlar", "bitimlar", "mijozlar", "shartnomalar", "tolovlar", "royxat", "items")).forEach { k ->
        rows(inner[k])?.let { return it }
        rows(root[k])?.let { return it }
    }
    return (inner.values + root.values).mapNotNull { rows(it) }.filter { it.isNotEmpty() }.maxByOrNull { it.size }.orEmpty()
}

/** Single-record answers: the object's scalar fields (and one level of nested scalar objects) as one row. */
fun findFeedRecord(body: JsonElement?): JsonObject? {
    val root = body as? JsonObject ?: return null
    val inner = (root["natija"] as? JsonObject) ?: (root["profil"] as? JsonObject) ?: root
    return inner
}

fun buildFeedRow(index: Int, o: JsonObject): FeedRow {
    val facts = o.entries.filter { (k, v) -> !isHiddenKey(k) && v.scalar() != null }
    val title = TITLE_KEYS.firstNotNullOfOrNull { k -> o[k].scalar()?.takeIf { v -> v.toDoubleOrNull() == null || k == "raqam" || k == "kod" } } ?: o["id"].scalar()?.let { "#$it" } ?: "#${index + 1}"
    val titleKey = TITLE_KEYS.firstOrNull { o[it].scalar() == title }
    val subKey = SUBTITLE_KEYS.firstOrNull { it != titleKey && o[it].scalar() != null }
    val amountKey = AMOUNT_KEYS.firstOrNull { it != titleKey && o[it].num() != null && o[it].scalar() != null && o[it].num() != 0.0 } ?: AMOUNT_KEYS.firstOrNull { it != titleKey && o[it].num() != null }
    fun fact(k: String, v: JsonElement?) = FeedFact(humanKey(k), when {
        (v as? JsonPrimitive)?.booleanOrNull != null -> if (v.booleanOrNull == true) "✓" else "–"
        v.num() != null && TEXT_NUMBER_KEYS.none { k == it || k.endsWith("_" + it) || k.startsWith(it + "_") } && !(v as JsonPrimitive).isString -> formatMoney(v.num(), if (v.num()!! % 1.0 == 0.0) 0 else 2)
        else -> short(v.scalar().orEmpty())
    }, v.num())
    val show = facts.filter { (k, _) -> k != titleKey && k != subKey && k != amountKey }.take(5).map { (k, v) -> fact(k, v) }
    val all = facts.map { (k, v) -> fact(k, v) }
    return FeedRow(o["id"].scalar() ?: "row$index", title.take(160), subKey?.let { short(o[it].scalar().orEmpty()) }, amountKey?.let { o[it].num() }, amountKey?.let { humanKey(it) }, show, all)
}

fun parseFeed(body: JsonElement?, source: FeedSource): List<FeedRow> {
    if (source.single) {
        val rec = findFeedRecord(body) ?: return emptyList()
        // A record of scalars -> one card; a nested object of scalars (e.g. KPI groups) -> one card each.
        val nested = rec.entries.mapNotNull { (k, v) -> (v as? JsonObject)?.takeIf { o -> o.values.any { it.scalar() != null } }?.let { k to it } }
        val own = buildFeedRow(0, rec).takeIf { it.all.isNotEmpty() }
        return listOfNotNull(own?.let { if (it.title.startsWith("#")) it.copy(title = humanKey(source.key)) else it }) + nested.mapIndexed { i, (k, o) -> buildFeedRow(i + 1, o).let { r -> if (r.title.startsWith("#")) r.copy(title = humanKey(k)) else r } }
    }
    return findFeedRows(body, source.listKey).mapIndexed { i, o -> buildFeedRow(i, o) }
}

/** `{ok:false}` / missing answer -> false. Table reads answer `{ok:true,qatorlar}`, named reads `{ok:true,natija:{...}}`. */
fun feedAnswerOk(body: JsonElement?): Boolean {
    val o = body as? JsonObject ?: return false
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return false
    return ((o["natija"] as? JsonObject)?.get("ok") as? JsonPrimitive)?.booleanOrNull != false
}

fun feedRequest(companyId: Long, s: FeedSource, query: String = ""): Pair<String, JsonObject?> {
    s.getPath?.let { return it.replace("{company}", companyId.toString()) to null }
    val q = query.trim()
    return "/api/sb" to buildJsonObject {
        if (s.soro != null) {
            put("soro", s.soro); put("kompaniya_id", companyId); s.extra.forEach { (k, v) -> put(k, v) }
        } else {
            put("jadval", s.table.orEmpty())
            val parts = mutableListOf("kompaniya_id=eq.$companyId")
            s.filter?.let { parts += it }
            if (q.isNotEmpty() && s.searchColumn != null) parts += s.searchColumn + "=ilike.*" + q.replace(Regex("[*&=,()%]"), " ").trim() + "*"
            put("filtr", parts.joinToString("&"))
            s.order?.let { put("tartib", it) }
            put("limit", s.limit)
        }
    }
}

/** Client-side search over the loaded rows (title, subtitle and every fact value). */
fun filterFeed(rows: List<FeedRow>, query: String): List<FeedRow> {
    val q = flat(query)
    if (q.isEmpty()) return rows
    return rows.filter { r -> flat(r.title + " " + r.subtitle.orEmpty() + " " + r.all.joinToString(" ") { it.value }).contains(q) }
}

private fun flat(s: String) = s.trim().lowercase().filter { it != '\'' && it != '`' && it != '‘' && it != '’' && it != 'ʻ' && it != 'ʼ' }

/** The month the HR reads need (YYYY-MM). */
fun currentMonth(today: String): String = today.take(7)

/** Catalogue of the office modules the app shows natively. The month and the object ids come from the caller. */
object FeedCatalog {
    fun module(code: String, month: String): FeedModule? = when (code) {
        "narx" -> FeedModule(code, listOf(
            FeedSource("narx_all", table = "t2_narx_markaz", order = "nom.asc", searchColumn = "nom", limit = 400),
            FeedSource("narx_risk", table = "t2_narx_markaz", filter = "xavf=is.true", order = "nom.asc", searchColumn = "nom", limit = 400),
        ))
        "moliya" -> FeedModule(code, listOf(
            FeedSource("moliya_tahlil", soro = "moliya_tahlil_v1", single = true),
            FeedSource("moliya_pul", soro = "pul_tahlil_v2", single = true),
        ))
        "buxgalteriya" -> FeedModule(code, listOf(
            FeedSource("bux_shartnoma", table = "t2_bux_dashboard", order = "raqam.asc"),
            FeedSource("bux_tolov", table = "t2_tolov", filter = "holat=eq.faol", order = "sana.desc"),
            FeedSource("bux_xarajat", table = "t2_xarajat", filter = "holat=eq.faol", order = "sana.desc"),
            FeedSource("bux_umumiy", table = "t2_bux_umumiy"),
        ))
        "aosr" -> FeedModule(code, listOf(FeedSource("aosr_reestr", table = "t2_aosr_reestr", order = "yaratildi.desc")))
        "tender" -> FeedModule(code, listOf(
            FeedSource("tender_mine", soro = "tender_royxat_v1", extra = mapOf("yonalish" to "meniki")),
            FeedSource("tender_to_me", soro = "tender_royxat_v1", extra = mapOf("yonalish" to "menga")),
            FeedSource("tender_open", soro = "tender_royxat_v1", extra = mapOf("yonalish" to "ochiq")),
        ))
        "logistika" -> FeedModule(code, listOf(
            FeedSource("log_zayavka", table = "t2_zayavka_royxat", order = "id.desc", searchColumn = "item_text"),
            FeedSource("log_harakat", table = "t2_sklad_harakat", order = "id.desc", limit = 200),
        ))
        "hr" -> FeedModule(code, listOf(
            FeedSource("hr_xodim", soro = "hr_xodimlar_v1", listKey = "xodimlar"),
            FeedSource("hr_oy", soro = "hr_oy_v1", extra = mapOf("oy" to month), listKey = "tabel"),
            FeedSource("hr_kpi", soro = "hr_kpi_v1", extra = mapOf("oy" to month), listKey = "qatorlar"),
        ))
        "sotuv" -> FeedModule(code, listOf(
            FeedSource("sotuv_panel", soro = "sotuv_panel_v1", single = true),
            FeedSource("sotuv_bitim", soro = "sotuv_bitimlar_v1", listKey = "bitimlar"),
            FeedSource("sotuv_mijoz", soro = "sotuv_mijozlar_v1", listKey = "mijozlar"),
        ))
        "kompaniya" -> FeedModule(code, listOf(
            FeedSource("kom_azo", table = "t2_azolik_royxat", order = "login.asc", limit = 500),
            FeedSource("kom_profil", getPath = "/api/company?profile={company}", single = true),
        ))
        else -> null
    }
    val codes = listOf("narx", "moliya", "buxgalteriya", "aosr", "tender", "logistika", "hr", "sotuv", "kompaniya")
}

/** Result of one feed read; platform neutral so the Windows app shows the same states. */
sealed interface FeedLoad {
    data class Rows(val rows: List<FeedRow>) : FeedLoad
    data object Offline : FeedLoad
    data object Forbidden : FeedLoad
    data object Failed : FeedLoad
}

/** The network side of the office modules, shared by Android and Windows (only the screens differ). */
class FeedLoader(private val api: BffApi) {
    suspend fun load(companyId: Long, source: FeedSource, query: String = ""): FeedLoad {
        val (path, body) = feedRequest(companyId, source, query)
        val r = api.bff(path, if (body == null) "GET" else "POST", body)
        return when {
            r.networkError -> FeedLoad.Offline
            r.status == 403 -> FeedLoad.Forbidden
            !r.ok || !feedAnswerOk(r.body) -> FeedLoad.Failed
            else -> FeedLoad.Rows(parseFeed(r.body, source))
        }
    }
}
