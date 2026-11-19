package uz.anncorp.smeta.core.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * OBJECT HIERARCHY: Loyiha (project) > Shartnoma (contract) > Obyekt (object), the same grouping the website uses when it picks an
 * object (frontend/src/lib/obyekt-ierarxiya.ts: loyiha_id of the object, loyiha_id of the contract and the active t2_shartnoma_bog links).
 * Objects without a contract sit under "Shartnomasiz", objects without a project under "Loyihasiz". Pure and platform-neutral: the Android
 * app and the Windows app feed it the same server rows and render the same rows (counts and sums per level, QQS bilan first;
 * "unknown" is null and shows as a dash, never 0 - owner rule). The app never recomputes QQS or markup: level sums only ADD the
 * server's per-object packages.
 */

// ---------- server source ----------

@Serializable data class HLoyiha(val id: Long, val nom: String, val holat: String? = null)
@Serializable data class HShartnoma(val id: Long, val nom: String? = null, val raqam: String? = null, val loyihaId: Long? = null)
@Serializable data class HLink(val obyektId: Long, val shartnomaId: Long)

/** Everything the grouping needs from the server for one company. [obyektLoyiha] only holds objects that have a project. */
@Serializable
data class HierarchySource(
    val loyihalar: List<HLoyiha> = emptyList(), val shartnomalar: List<HShartnoma> = emptyList(),
    val links: List<HLink> = emptyList(), val obyektLoyiha: Map<Long, Long> = emptyMap(),
)

// Same tables the website reads for it (all on the /api/sb allow-list, tenant-scoped): no new server path is needed.
fun loyihaRequest(companyId: Long): JsonObject = sbRead("t2_loyiha_royxat", "kompaniya_id=eq.$companyId", "id,nom,holat", 2000)
fun shartnomaRequest(companyId: Long): JsonObject = sbRead("t2_shartnoma", "kompaniya_id=eq.$companyId&holat=eq.faol", "id,nom,raqam,loyiha_id", 5000)
fun shartnomaBogRequest(companyId: Long): JsonObject = sbRead("t2_shartnoma_bog_kompaniya", "kompaniya_id=eq.$companyId&holat=eq.faol", "obyekt_id,shartnoma_id", 20000)
fun obyektLoyihaRequest(companyId: Long): JsonObject = sbRead("t2_obyekt_jami", "kompaniya_id=eq.$companyId", "id,loyiha_id", 5000)

private fun sbRead(table: String, filter: String, columns: String, limit: Int): JsonObject = buildJsonObject {
    put("jadval", table); put("filtr", filter); put("ustunlar", columns); put("limit", limit)
}

private fun rowsOfSb(e: JsonElement?): List<JsonObject>? = parseSb(e)?.rows

/**
 * The four reads in parallel, folded into ONE answer `{l,s,b,o}` (so one cache entry / one parse). A read that failed is left out; when none
 * succeeded the most telling failure is returned (network first, so the caller can fall back to its offline copy).
 */
suspend fun fetchHierarchy(api: BffApi, companyId: Long): ApiResult {
    val reqs = listOf(loyihaRequest(companyId), shartnomaRequest(companyId), shartnomaBogRequest(companyId), obyektLoyihaRequest(companyId))
    val r = coroutineScope { reqs.map { q -> async { api.bff("/api/sb", "POST", q) } }.awaitAll() }
    if (r.none { it.ok }) return r.firstOrNull { it.networkError } ?: r.first()
    return ApiResult(200, buildJsonObject { listOf("l", "s", "b", "o").forEachIndexed { i, k -> if (r[i].ok) r[i].body?.let { put(k, it) } } })
}

fun parseHierarchyBody(body: JsonElement?): HierarchySource? {
    val o = body.obj() ?: return null
    return parseHierarchy(o["l"], o["s"], o["b"], o["o"])
}

/**
 * Combines the four reads. A read that failed (null) counts as empty, so a role that may not read contracts still gets the
 * project level; only when NOTHING could be read the result is null and the screens show the plain list.
 */
fun parseHierarchy(loyiha: JsonElement?, shartnoma: JsonElement?, bog: JsonElement?, obyekt: JsonElement?): HierarchySource? {
    val l = rowsOfSb(loyiha); val s = rowsOfSb(shartnoma); val b = rowsOfSb(bog); val o = rowsOfSb(obyekt)
    if (l == null && s == null) return null
    val loyihalar = l.orEmpty().mapNotNull { r -> HLoyiha(r["id"].num()?.toLong() ?: return@mapNotNull null, r["nom"].str().orEmpty(), r["holat"].str()) }
    val shartnomalar = s.orEmpty().mapNotNull { r -> HShartnoma(r["id"].num()?.toLong() ?: return@mapNotNull null, r["nom"].str(), r["raqam"].str(), r["loyiha_id"].num()?.toLong()) }
    val known = shartnomalar.map { it.id }.toSet()
    val links = b.orEmpty().mapNotNull { r ->
        val ob = r["obyekt_id"].num()?.toLong() ?: return@mapNotNull null
        val sh = r["shartnoma_id"].num()?.toLong() ?: return@mapNotNull null
        if (sh in known) HLink(ob, sh) else null
    }
    val map = LinkedHashMap<Long, Long>()
    o.orEmpty().forEach { r -> val id = r["id"].num()?.toLong(); val lid = r["loyiha_id"].num()?.toLong(); if (id != null && lid != null) map[id] = lid }
    return HierarchySource(loyihalar, shartnomalar, links, map)
}

// ---------- leaves and sums ----------

/** One object as the tree sees it. Money fields are the server's estimate package (null = unknown). */
data class ObjectLeaf(
    val id: Long, val name: String, val type: String? = null, val rows: Int? = null, val unpriced: Int? = null,
    val qqsBilan: Double? = null, val ustamali: Double? = null, val ustamasiz: Double? = null, val factPct: Double? = null, val f2Pct: Double? = null,
)

/** Builds a leaf; without a server package only the direct cached amount is known (see [displayMoney]). */
fun objectLeaf(id: Long, name: String, type: String?, rows: Int?, unpriced: Int?, money: ObjectMoney?, plainFallback: Double?): ObjectLeaf {
    val d = displayMoney(money?.smeta, plainFallback)
    return ObjectLeaf(id, name, type, rows, unpriced, d.vatIncl, d.withMarkup, d.withoutMarkup, money?.factPct, money?.f2Pct)
}

/** Sum of the known values per field; null when no object of the level has that value. [missing] = objects without the QQS-inclusive value. */
data class SumAgg(val qqsBilan: Double?, val ustamali: Double?, val ustamasiz: Double?, val missing: Int, val total: Int) {
    /** True when some objects of the level have no sum yet: the figure covers only the others. */
    val partial: Boolean get() = missing in 1 until total
}

fun aggregate(leaves: List<ObjectLeaf>): SumAgg {
    fun sum(f: (ObjectLeaf) -> Double?): Double? { val v = leaves.mapNotNull(f); return if (v.isEmpty()) null else v.sum() }
    return SumAgg(sum { it.qqsBilan }, sum { it.ustamali }, sum { it.ustamasiz }, leaves.count { it.qqsBilan == null }, leaves.size)
}

// ---------- grouping ----------

const val NONE_ID = -1L

/** Context chosen in the shell ("Kontekst"): null = all. [NONE_ID] = the "without" group (Loyihasiz / Shartnomasiz). */
data class WorkScope(val loyihaId: Long? = null, val shartnomaId: Long? = null, val obyektId: Long? = null) {
    val isEmpty get() = loyihaId == null && shartnomaId == null && obyektId == null
}

data class TreeFilter(val query: String = "", val loyihaId: Long? = null, val shartnomaId: Long? = null, val holat: String? = null) {
    val active get() = query.isNotBlank() || loyihaId != null || shartnomaId != null || holat != null
}

data class ShartnomaNode(val key: String, val shartnomaId: Long?, val title: String?, val leaves: List<ObjectLeaf>, val agg: SumAgg)
data class LoyihaNode(val key: String, val loyihaId: Long?, val title: String?, val holat: String?, val contracts: List<ShartnomaNode>, val agg: SumAgg) {
    val objects: Int get() = agg.total
}

/** [roots] is the 3-level tree; [flat] is set instead when the hierarchy could not be read at all (plain list, like the website). */
data class ObjectTree(val roots: List<LoyihaNode>, val flat: List<ObjectLeaf>?) {
    val leafCount: Int get() = flat?.size ?: roots.sumOf { it.objects }
}

private fun shartnomaTitle(s: HShartnoma): String = buildString {
    append(s.raqam?.trim()?.takeIf { it.isNotEmpty() }?.let { if (it.startsWith("№")) it else "№$it" } ?: "#${s.id}")
    s.nom?.trim()?.takeIf { it.isNotEmpty() }?.let { append(' ').append(it) }
}

/** Project and contract of one object, with the website's rule: among several contracts prefer the one of the object's own project. */
fun groupOf(objectId: Long, src: HierarchySource): Pair<Long?, Long?> {
    val byId = src.shartnomalar.associateBy { it.id }
    val own = src.obyektLoyiha[objectId]
    val ids = src.links.filter { it.obyektId == objectId && it.shartnomaId in byId }.map { it.shartnomaId }.sorted()
    val sid = ids.firstOrNull { byId[it]?.loyihaId == own } ?: ids.firstOrNull()
    val s = sid?.let { byId[it] }
    return (own ?: s?.loyihaId) to sid
}

private fun matches(q: String, vararg texts: String?): Boolean = texts.any { it != null && normalizeSearch(it).contains(q) }

/**
 * Groups [leaves]. The search keeps the tree: a hit on an object keeps its path, a hit on a contract or a project keeps everything under
 * it. Level sums cover the leaves that remain visible. Sorting: projects and contracts by title, the "without" groups last.
 */
fun buildObjectTree(leaves: List<ObjectLeaf>, src: HierarchySource?, filter: TreeFilter = TreeFilter()): ObjectTree {
    val q = normalizeSearch(filter.query.trim())
    if (src == null) {
        val flat = leaves.filter { q.isEmpty() || matches(q, it.name, it.type) }.sortedBy { it.name.lowercase() }
        return ObjectTree(emptyList(), flat)
    }
    val loyiha = src.loyihalar.associateBy { it.id }
    val shartnoma = src.shartnomalar.associateBy { it.id }
    data class Slot(val lid: Long?, val sid: Long?)
    val slots = LinkedHashMap<Slot, MutableList<ObjectLeaf>>()
    for (leaf in leaves) { val (l, s) = groupOf(leaf.id, src); slots.getOrPut(Slot(l, s)) { mutableListOf() }.add(leaf) }

    val byLoyiha = LinkedHashMap<Long?, MutableList<Pair<Long?, List<ObjectLeaf>>>>()
    for ((slot, list) in slots) {
        val lTitle = slot.lid?.let { loyiha[it]?.nom ?: "#$it" }
        val sTitle = slot.sid?.let { shartnoma[it]?.let(::shartnomaTitle) }
        val holat = slot.lid?.let { loyiha[it]?.holat }
        if (filter.loyihaId != null && (slot.lid ?: NONE_ID) != filter.loyihaId) continue
        if (filter.shartnomaId != null && (slot.sid ?: NONE_ID) != filter.shartnomaId) continue
        if (filter.holat != null && holat != filter.holat) continue
        val groupHit = q.isNotEmpty() && matches(q, lTitle, sTitle)
        val kept = if (q.isEmpty() || groupHit) list else list.filter { matches(q, it.name, it.type) }
        if (kept.isEmpty()) continue
        byLoyiha.getOrPut(slot.lid) { mutableListOf() }.add(slot.sid to kept.sortedBy { it.name.lowercase() })
    }
    val roots = byLoyiha.map { (lid, pairs) ->
        val contracts = pairs.map { (sid, ls) ->
            ShartnomaNode("S:${lid ?: NONE_ID}:${sid ?: NONE_ID}", sid, sid?.let { shartnoma[it]?.let(::shartnomaTitle) }, ls, aggregate(ls))
        }.sortedWith(compareBy({ it.shartnomaId == null }, { it.title?.lowercase().orEmpty() }))
        LoyihaNode("L:${lid ?: NONE_ID}", lid, lid?.let { loyiha[it]?.nom ?: "#$it" }, lid?.let { loyiha[it]?.holat }, contracts, aggregate(contracts.flatMap { it.leaves }))
    }.sortedWith(compareBy({ it.loyihaId == null }, { it.title?.lowercase().orEmpty() }))
    return ObjectTree(roots, null)
}

// ---------- flat rows for the UI ----------

sealed interface TreeRow { val key: String; val depth: Int }
data class GroupRow(
    override val key: String, override val depth: Int, val level: Int, val title: String?, val holat: String?, val objects: Int, val agg: SumAgg, val open: Boolean,
    /** Loyihasiz / Shartnomasiz: the UI shows its own localized title. */
    val synthetic: Boolean, val childGroups: Int,
) : TreeRow
data class LeafRow(override val key: String, override val depth: Int, val leaf: ObjectLeaf) : TreeRow

/**
 * [expanded] = the open group keys the user remembered; null = never chosen -> a small tree opens fully, a big one shows only the projects.
 * While a search/filter is active every group opens so the matches are visible with their parents ([forceOpen]).
 */
fun flattenTree(tree: ObjectTree, expanded: Set<String>?, forceOpen: Boolean = false): List<TreeRow> {
    tree.flat?.let { f -> return f.map { LeafRow("O:${it.id}", 0, it) } }
    val auto = expanded == null && tree.leafCount <= SMALL_TREE
    fun open(key: String) = forceOpen || auto || (expanded != null && key in expanded)
    val out = ArrayList<TreeRow>()
    for (l in tree.roots) {
        val lo = open(l.key)
        out += GroupRow(l.key, 0, 0, l.title, l.holat, l.objects, l.agg, lo, l.loyihaId == null, l.contracts.size)
        if (!lo) continue
        for (s in l.contracts) {
            val so = open(s.key)
            out += GroupRow(s.key, 1, 1, s.title, null, s.leaves.size, s.agg, so, s.shartnomaId == null, s.leaves.size)
            if (so) s.leaves.forEach { out += LeafRow("O:${it.id}@${s.key}", 2, it) }
        }
    }
    return out
}

const val SMALL_TREE = 12

/** Every group key of the tree (for "expand all"). */
fun allGroupKeys(tree: ObjectTree): Set<String> = tree.roots.flatMap { l -> listOf(l.key) + l.contracts.map { it.key } }.toSet()

fun toggleKey(current: Set<String>?, tree: ObjectTree, key: String): Set<String> {
    val base = current ?: if (tree.leafCount <= SMALL_TREE) allGroupKeys(tree) else emptySet()
    return if (key in base) base - key else base + key
}

// ---------- context switch ("Kontekst") ----------

/** The leaves allowed by [scope] (project and contract narrowing; the object itself is the current pick, not a filter). */
fun scopedLeaves(leaves: List<ObjectLeaf>, src: HierarchySource?, scope: WorkScope): List<ObjectLeaf> {
    if (src == null || (scope.loyihaId == null && scope.shartnomaId == null)) return leaves
    return leaves.filter { l ->
        val (lid, sid) = groupOf(l.id, src)
        (scope.loyihaId == null || (lid ?: NONE_ID) == scope.loyihaId) && (scope.shartnomaId == null || (sid ?: NONE_ID) == scope.shartnomaId)
    }
}

/** After one part of the context changed: the contract / object stay only while they still fit the narrower project / contract. */
fun normalizeScope(scope: WorkScope, leaves: List<ObjectLeaf>, src: HierarchySource?): WorkScope {
    val sid = scope.shartnomaId?.takeIf { id -> shartnomaOptions(leaves, src, scope.loyihaId).any { it.id == id } }
    val narrowed = scope.copy(shartnomaId = sid)
    val oid = narrowed.obyektId?.takeIf { id -> scopedLeaves(leaves, src, narrowed).any { it.id == id } }
    return narrowed.copy(obyektId = oid)
}

data class ScopeOption(val id: Long, val title: String?)

/** Projects present among the leaves (with the [NONE_ID] "without" entry when needed). */
fun loyihaOptions(leaves: List<ObjectLeaf>, src: HierarchySource?): List<ScopeOption> {
    if (src == null) return emptyList()
    val byId = src.loyihalar.associateBy { it.id }
    return leaves.map { groupOf(it.id, src).first }.distinct()
        .map { ScopeOption(it ?: NONE_ID, it?.let { id -> byId[id]?.nom ?: "#$id" }) }
        .sortedWith(compareBy({ it.id == NONE_ID }, { it.title?.lowercase().orEmpty() }))
}

/** Contracts present among the leaves of the chosen project (all when [loyihaId] is null). */
fun shartnomaOptions(leaves: List<ObjectLeaf>, src: HierarchySource?, loyihaId: Long?): List<ScopeOption> {
    if (src == null) return emptyList()
    val byId = src.shartnomalar.associateBy { it.id }
    return leaves.map { groupOf(it.id, src) }.filter { loyihaId == null || (it.first ?: NONE_ID) == loyihaId }.map { it.second }.distinct()
        .map { ScopeOption(it ?: NONE_ID, it?.let { id -> byId[id]?.let(::shartnomaTitle) ?: "#$id" }) }
        .sortedWith(compareBy({ it.id == NONE_ID }, { it.title?.lowercase().orEmpty() }))
}

/** Short one-line summary of the context for the shell bar; null parts are skipped. */
fun scopeSummary(scope: WorkScope, src: HierarchySource?, leaves: List<ObjectLeaf>, noLoyiha: String, noShartnoma: String): String? {
    val parts = ArrayList<String>()
    scope.loyihaId?.let { id -> parts += if (id == NONE_ID) noLoyiha else src?.loyihalar?.firstOrNull { it.id == id }?.nom ?: "#$id" }
    scope.shartnomaId?.let { id -> parts += if (id == NONE_ID) noShartnoma else src?.shartnomalar?.firstOrNull { it.id == id }?.let(::shartnomaTitle) ?: "#$id" }
    scope.obyektId?.let { id -> parts += leaves.firstOrNull { it.id == id }?.name ?: "#$id" }
    return if (parts.isEmpty()) null else parts.joinToString(" › ")
}

// ---------- persisted view state (a string each platform stores) ----------

fun encodeKeys(keys: Set<String>?): String? = keys?.sorted()?.joinToString("|")
fun decodeKeys(s: String?): Set<String>? = s?.let { if (it.isEmpty()) emptySet() else it.split('|').toSet() }
