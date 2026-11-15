package uz.anncorp.smeta.core.data

import uz.anncorp.smeta.core.db.QatorEntity

/*
 * Pure helpers behind the visual screens (section progress bars, smeta browser). No money is shown from here: a section's
 * progress is a PERCENT of the server's own row amounts (the same ratio the existing object progress uses); the amounts
 * themselves are never displayed per section because rows only carry the markup-free figure.
 */

data class SectionProgress(val name: String?, val rows: Int, val unpriced: Int, val factPercent: Double?, val f2Percent: Double?)

/** Sections in estimate order (first appearance), with fact / F-2 percent of the section's estimate amount. */
fun sectionProgress(rows: List<QatorEntity>): List<SectionProgress> {
    val order = LinkedHashMap<String?, MutableList<QatorEntity>>()
    rows.forEach { order.getOrPut(it.bolim?.takeIf { b -> b.isNotBlank() }) { mutableListOf() }.add(it) }
    return order.map { (name, list) ->
        val t = computeTotals(list)
        SectionProgress(name, list.size, t.unpriced, t.faktPercent, t.f2Percent)
    }
}

data class SmetaSection(val name: String?, val rows: List<QatorEntity>, val progress: SectionProgress)

/** Estimate tree for the read-only browser: [query] matches code or name (case-insensitive); empty sections are dropped. */
fun smetaTree(rows: List<QatorEntity>, query: String): List<SmetaSection> {
    val q = query.trim()
    val filtered = if (q.isEmpty()) rows else rows.filter { (it.kod ?: "").contains(q, ignoreCase = true) || it.nom.contains(q, ignoreCase = true) }
    val progress = sectionProgress(rows).associateBy { it.name }
    val groups = LinkedHashMap<String?, MutableList<QatorEntity>>()
    filtered.forEach { groups.getOrPut(it.bolim?.takeIf { b -> b.isNotBlank() }) { mutableListOf() }.add(it) }
    return groups.map { (name, list) -> SmetaSection(name, list, progress[name] ?: SectionProgress(name, list.size, 0, null, null)) }
}

/** Stacked-bar fractions of one row's volume: how much of the estimate is accepted (F-2), done but not yet accepted, and still open. All volumes, no money. */
data class VolumeSplit(val f2: Float, val factOnly: Float, val open: Float, val over: Boolean)

fun volumeSplit(smeta: Double?, fakt: Double, f2: Double, replaced: Double = 0.0): VolumeSplit? {
    if (smeta == null || smeta <= 0.0) return null
    val total = smeta
    val f2c = f2.coerceIn(0.0, total)
    val factC = (fakt + replaced).coerceIn(f2c, total)
    return VolumeSplit(
        f2 = (f2c / total).toFloat(), factOnly = ((factC - f2c) / total).toFloat(), open = ((total - factC) / total).toFloat(),
        over = fakt + replaced > total + 1e-9,
    )
}