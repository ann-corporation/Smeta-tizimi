package uz.anncorp.smeta.core.data

import android.content.SharedPreferences
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

/**
 * SERVER-DRIVEN MODULE CATALOGUE ("Barcha modullar"): GET /api/ish-joyi?bolim=katalog&kompaniya_id=.
 * The server lists EVERY website page this user may open in the selected company (same filter as the web side menu: permissions, company
 * modules, role, platform layer) from the single page registry; each item carries a [CatalogItem.native] module code when this app has a
 * native screen for it, otherwise it opens inside the authenticated in-app web container. The app keeps no second list of pages.
 * Pure parsing / search; unknown or malformed rows are skipped (forward compatible).
 */
data class L3(val uz: String, val ru: String, val en: String) {
    /** [lang] is a language tag prefix ("uz", "ru", "en"); anything else (and a missing translation) falls back to Uzbek. */
    fun pick(lang: String): String = when (lang) { "ru" -> ru.ifBlank { uz }; "en" -> en.ifBlank { uz }; else -> uz }
    internal fun haystack(): String = "$uz $ru $en"
}

data class CatalogGroup(val id: String, val title: L3, val icon: String, val layer: String)
data class CatalogItem(
    val id: String, val title: L3, val group: String, val band: L3, val icon: String, val path: String,
    /** Native module code (a [ModuleCatalog] code) or null = web container. */
    val native: String?, val chosen: Boolean, val status: String, val extra: Boolean,
)
data class Catalog(val version: Int, val companyId: Long?, val groups: List<CatalogGroup>, val items: List<CatalogItem>)

/** How an item opens. */
sealed interface CatalogOpen {
    data class Native(val target: NativeTarget) : CatalogOpen
    data class Web(val path: String) : CatalogOpen
}

private fun JsonElement?.cObj(): JsonObject? = this as? JsonObject
private fun JsonObject.cStr(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
private fun JsonObject.l3(k: String): L3? {
    val o = this[k].cObj() ?: return null
    val uz = o.cStr("uz") ?: return null
    return L3(uz, o.cStr("ru") ?: uz, o.cStr("en") ?: uz)
}

/** Null only when the skeleton (ok + groups + pages arrays) is missing. Items must carry a web path that starts with `/admin`. */
fun parseCatalog(e: JsonElement?): Catalog? {
    val o = e.cObj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val rawGroups = o["guruhlar"] as? JsonArray ?: return null
    val rawItems = o["sahifalar"] as? JsonArray ?: return null
    val groups = rawGroups.mapNotNull { g ->
        val x = g.cObj() ?: return@mapNotNull null
        CatalogGroup(x.cStr("id") ?: return@mapNotNull null, x.l3("nom") ?: return@mapNotNull null, x.cStr("ikonka") ?: "", x.cStr("qatlam") ?: "")
    }
    val known = groups.map { it.id }.toSet()
    val items = rawItems.mapNotNull { i ->
        val x = i.cObj() ?: return@mapNotNull null
        val path = x.cStr("yol")?.takeIf { it.startsWith("/admin") } ?: return@mapNotNull null
        val title = x.l3("nom") ?: return@mapNotNull null
        val group = x.cStr("guruh")?.takeIf { it in known } ?: return@mapNotNull null
        CatalogItem(
            id = x.cStr("id") ?: return@mapNotNull null, title = title, group = group, band = x.l3("band") ?: title, icon = x.cStr("ikonka") ?: "",
            path = path, native = x.cStr("native"), chosen = (x["tanlangan"] as? JsonPrimitive)?.booleanOrNull != false,
            status = x.cStr("holat") ?: "tayyor", extra = (x["qoshimcha"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
    return Catalog((o["versiya"] as? JsonPrimitive)?.intOrNull ?: 1, (o["kompaniya_id"] as? JsonPrimitive)?.longOrNull, groups, items)
}

/** Native module code (server `native`) -> screen. Hub modules come from [ModuleCatalog]; Material so'rovi (zayavka) is a native screen without a hub card. */
internal fun nativeTargetFor(code: String): NativeTarget? =
    if (code == "zayavka") NativeTarget.ZAYAVKA else if (code == "nazorat") NativeTarget.NAZORAT else ModuleCatalog.all.firstOrNull { it.code == code && it.kind == ModuleKind.NATIVE && it.enabled }?.target

/** Native screen for [CatalogItem.native], only when the app really has it and it is switched on; otherwise the web container. */
fun CatalogItem.open(): CatalogOpen {
    val target = native?.let(::nativeTargetFor)
    return if (target != null) CatalogOpen.Native(target) else CatalogOpen.Web(path)
}

// normalizeSearch now lives in :shared (core/data/Search.kt).

/** Every query word must appear in the item's titles (all languages), band or group name. Empty query = everything. */
fun Catalog.search(query: String): List<CatalogItem> {
    val words = normalizeSearch(query).split(' ', '\t').filter { it.isNotBlank() }
    if (words.isEmpty()) return items.dedupeNative()
    val groupTitle = groups.associate { it.id to it.title.haystack() }
    return items.dedupeNative().filter { item ->
        val hay = normalizeSearch("${item.title.haystack()} ${item.band.haystack()} ${groupTitle[item.group].orEmpty()}")
        words.all { w -> hay.contains(w) }
    }
}

/**
 * Several website pages can open the SAME native screen (the director console and the executive dashboard both open the boss panel). The
 * launcher shows that screen once: the page whose path is the module's own web path (`ModuleDef.webPath`) wins, otherwise the first one in
 * the server's order. Pages that open in the web container are never merged.
 */
fun List<CatalogItem>.dedupeNative(): List<CatalogItem> {
    fun target(i: CatalogItem) = i.native?.let(::nativeTargetFor)
    fun canonical(i: CatalogItem) = ModuleCatalog.all.firstOrNull { it.code == i.native }?.webPath == i.path
    val keep = HashMap<NativeTarget, CatalogItem>()
    for (i in this) {
        val t = target(i) ?: continue
        val cur = keep[t]
        if (cur == null || (canonical(i) && !canonical(cur))) keep[t] = i
    }
    return filter { i -> target(i).let { t -> t == null || keep[t] === i } }
}

data class CatalogSection(val group: CatalogGroup, val items: List<CatalogItem>)

/** Groups [items] by server group in the server's group order; empty groups drop out. */
fun Catalog.sections(items: List<CatalogItem> = this.items): List<CatalogSection> {
    val by = items.dedupeNative().groupBy { it.group }
    return groups.mapNotNull { g -> by[g.id]?.takeIf { it.isNotEmpty() }?.let { CatalogSection(g, it) } }
}

/**
 * URL the web container starts from: the page path plus app-embed hints the website understands (lib/app-embed.ts):
 * `app=android` (hide the web sidebar/top bar), `k` = selected workplace, `tema` = dark | light. Only digits/letters, so it passes the
 * server's ticket path whitelist (/api/mobil/web-bilet BILET_YOL). Existing query strings are kept.
 */
fun embedPath(path: String, companyId: Long?, dark: Boolean): String {
    val sep = if (path.contains('?')) '&' else '?'
    val k = companyId?.takeIf { it > 0 }?.let { "&k=$it" }.orEmpty()
    return "$path${sep}app=android$k&tema=${if (dark) "dark" else "light"}"
}

/** Offline copy of the last good catalogue per company. */
interface CatalogCache {
    fun catalogGet(companyId: Long): String?
    fun catalogPut(companyId: Long, raw: String)
}

sealed interface CatalogResult {
    data class Fresh(val catalog: Catalog) : CatalogResult
    /** Network/server problem: the last good copy (may be null when nothing was ever loaded). */
    data class Stale(val catalog: Catalog?, val offline: Boolean) : CatalogResult
}

class CatalogRepository(private val api: BffApi, private val json: Json, private val cache: CatalogCache) {
    fun cached(companyId: Long): Catalog? = cache.catalogGet(companyId)?.let { raw -> runCatching { parseCatalog(json.parseToJsonElement(raw)) }.getOrNull() }

    suspend fun load(companyId: Long): CatalogResult {
        val r = api.bff("/api/ish-joyi?bolim=katalog&kompaniya_id=$companyId")
        val fresh = if (r.ok) parseCatalog(r.body) else null
        if (fresh != null) { r.body?.let { cache.catalogPut(companyId, it.toString()) }; return CatalogResult.Fresh(fresh) }
        return CatalogResult.Stale(cached(companyId), offline = r.networkError)
    }
}

/** Non-secret page list copy (no amounts, no personal data). */
class PrefsCatalogCache(private val sp: SharedPreferences) : CatalogCache {
    override fun catalogGet(companyId: Long): String? = sp.getString("k$companyId", null)
    override fun catalogPut(companyId: Long, raw: String) { sp.edit().putString("k$companyId", raw).apply() }
}
