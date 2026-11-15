package uz.anncorp.smeta.core.data

import uz.anncorp.smeta.core.db.NodeEntity
import uz.anncorp.smeta.core.db.QatorEntity

/*
 * The estimate tree as the web shows it: RZ (section) -> BL (work) -> RS / MAT / OB (resources), children in tartib order.
 * [NodeEntity.ord] is already the depth-first position, so a list ordered by ord IS the expanded tree; collapsing is just
 * skipping the nodes deeper than a collapsed one. Everything here is pure and linear, so a 26 000-row object stays smooth.
 */

/** Percent of a section's (or work's) estimate amount that is done / accepted, taken from the server's row amounts. */
data class Rollup(val factPercent: Double?, val f2Percent: Double?, val blCount: Int, val unpriced: Int)

/** Roll-ups for every node that has BL descendants (or is a BL). Resource rows do not count: only BL rows carry the work amount. */
fun rollups(nodes: List<NodeEntity>): Map<Long, Rollup> {
    val n = nodes.size
    if (n == 0) return emptyMap()
    val index = HashMap<Long, Int>(n * 2).also { m -> nodes.forEachIndexed { i, x -> m[x.id] = i } }
    val smeta = DoubleArray(n); val fakt = DoubleArray(n); val f2 = DoubleArray(n); val bl = IntArray(n); val unpriced = IntArray(n)
    for (i in n - 1 downTo 0) {
        val x = nodes[i]
        if (x.isBl) {
            bl[i] += 1
            if (x.summa == null) { if ((x.hajm ?: 0.0) > 0.0) unpriced[i] += 1 } else smeta[i] += x.summa
            fakt[i] += x.faktSumma; f2[i] += x.f2Summa
        }
        val p = x.parentId?.let { index[it] }
        // A BL's own amounts must not be inherited from its resources, but the BL itself bubbles up to its sections.
        if (p != null && p != i && !nodes[p].isBl) {
            smeta[p] += smeta[i]; fakt[p] += fakt[i]; f2[p] += f2[i]; bl[p] += bl[i]; unpriced[p] += unpriced[i]
        }
    }
    val out = HashMap<Long, Rollup>()
    for (i in 0 until n) if (bl[i] > 0) out[nodes[i].id] = Rollup(percentOf(fakt[i], smeta[i]), percentOf(f2[i], smeta[i]), bl[i], unpriced[i])
    return out
}

/** Ids that can be expanded (have children). */
fun expandableIds(nodes: List<NodeEntity>): Set<Long> = nodes.filter { it.hasChildren }.mapTo(HashSet()) { it.id }

private fun matches(x: NodeEntity, q: String): Boolean = (x.kod ?: "").contains(q, ignoreCase = true) || x.nom.contains(q, ignoreCase = true)

/**
 * The rows to draw, in tree order.
 * - No query: a node is shown when every ancestor is expanded (sections collapsed by default = empty [expanded]).
 * - Query: every row whose code or name matches, together with ALL its ancestors (the parent path), regardless of collapse state.
 *   Resources of a matched work are shown only when that work is expanded.
 */
fun visibleNodes(nodes: List<NodeEntity>, expanded: Set<Long>, query: String): List<NodeEntity> {
    val q = query.trim()
    if (q.isEmpty()) {
        val out = ArrayList<NodeEntity>()
        var hideBelow = Int.MAX_VALUE
        for (x in nodes) {
            if (x.depth > hideBelow) continue
            hideBelow = Int.MAX_VALUE
            out += x
            if (x.hasChildren && x.id !in expanded) hideBelow = x.depth
        }
        return out
    }
    val index = HashMap<Long, Int>(nodes.size * 2).also { m -> nodes.forEachIndexed { i, x -> m[x.id] = i } }
    val keep = BooleanArray(nodes.size)
    nodes.forEachIndexed { i, x ->
        if (!keep[i] && matches(x, q)) {
            keep[i] = true
            var p = x.parentId?.let { index[it] }
            var hops = 0
            while (p != null && !keep[p] && hops++ < 64) { keep[p] = true; p = nodes[p].parentId?.let { index[it] } }
        }
    }
    val out = ArrayList<NodeEntity>()
    nodes.forEachIndexed { i, x ->
        val parentKept = x.parentId?.let { index[it] }?.let { keep[it] } == true
        if (keep[i] || (x.isResource && x.parentId in expanded && parentKept)) out += x
    }
    return out
}

/** A work row as the fact-entry code expects it (draft line / volume dialog). */
fun NodeEntity.toQator(): QatorEntity = QatorEntity(
    obyektId = obyektId, qatorId = id, kod = kod, nom = nom, birlik = birlik, smetaHajm = hajm, narx = narx, smetaSumma = summa,
    faktHajm = faktHajm, faktSumma = faktSumma, f2Hajm = f2Hajm, f2Summa = f2Summa, almashtirilgan = almashtirilgan,
)

/**
 * Object read through the row-status fallback (no packet right): there is no hierarchy, so sections are rebuilt from the cached
 * rows' section names (virtual negative ids) and the works hang under them. Same screen, one level less.
 */
fun fallbackNodes(rows: List<QatorEntity>): List<NodeEntity> {
    if (rows.isEmpty()) return emptyList()
    val bySection = LinkedHashMap<String?, MutableList<QatorEntity>>()
    rows.forEach { bySection.getOrPut(it.bolim?.takeIf { b -> b.isNotBlank() }) { ArrayList() } += it }
    val out = ArrayList<NodeEntity>(rows.size + bySection.size)
    var ord = 0; var virtual = 0L
    val oid = rows.first().obyektId
    bySection.forEach { (name, list) ->
        val sectionId = if (name == null) null else --virtual
        if (sectionId != null) out += NodeEntity(oid, sectionId, null, ord++, 0, "rz", null, null, name.orEmpty(), null, null, null, null, null, 0.0, 0.0, 0.0, 0.0, 0.0, true)
        list.forEach { r ->
            out += NodeEntity(oid, r.qatorId, sectionId, ord++, if (sectionId == null) 0 else 1, "bl", null, r.kod, r.nom, r.birlik, r.smetaHajm, r.narx, r.smetaSumma, null, r.faktHajm, r.faktSumma, r.f2Hajm, r.f2Summa, r.almashtirilgan, false)
        }
    }
    return out
}
