package uz.anncorp.qurai.ui.components

/*
 * Pure (Compose-free) logic of the desktop data grid: column order / width / visibility / freeze, multi-column sort, per-column and quick
 * filters, row selection (click, Ctrl, Shift, select all, keyboard) and the tab-separated copy that pastes straight into Excel.
 * The grid never computes business values: cells are the strings the server numbers were formatted into by the caller.
 */

/** One column. [value] is the cell text; [sortKey] (numbers / strings) enables sorting; [editable] lets the screen start an inline edit. */
class GridCol<R>(
    val id: String, val title: String, val width: Float = 120f, val numeric: Boolean = false, val mono: Boolean = false,
    val editable: Boolean = false, val sortKey: ((R) -> Comparable<*>?)? = null, val value: (R) -> String,
)

data class SortKey(val colId: String, val asc: Boolean = true)

/** Everything the user can change in the grid. Immutable: every action returns a new state. [selected] / [active] / [anchor] hold row keys. */
data class GridState(
    val order: List<String> = emptyList(), val widths: Map<String, Float> = emptyMap(), val hidden: Set<String> = emptySet(), val frozen: Int = 0,
    val sort: List<SortKey> = emptyList(), val filters: Map<String, String> = emptyMap(), val query: String = "",
    val selected: Set<Any> = emptySet(), val active: Any? = null, val anchor: Any? = null,
)

object GridLogic {
    const val MIN_WIDTH = 48f

    /** Columns in the user's order (unknown ids dropped, new columns appended), hidden ones removed. */
    fun <R> visible(cols: List<GridCol<R>>, s: GridState): List<GridCol<R>> {
        val byId = cols.associateBy { it.id }
        val ordered = s.order.mapNotNull { byId[it] } + cols.filter { it.id !in s.order }
        return ordered.filter { it.id !in s.hidden }
    }

    fun <R> widthOf(col: GridCol<R>, s: GridState): Float = s.widths[col.id] ?: col.width

    fun resize(s: GridState, colId: String, startWidth: Float, dx: Float): GridState =
        s.copy(widths = s.widths + (colId to (startWidth + dx).coerceAtLeast(MIN_WIDTH)))

    /** Moves column [colId] to position [to] among ALL columns (hidden ones keep their place). */
    fun <R> moveColumn(cols: List<GridCol<R>>, s: GridState, colId: String, to: Int): GridState {
        val all = (s.order.filter { id -> cols.any { it.id == id } } + cols.map { it.id }.filter { it !in s.order }).toMutableList()
        if (!all.remove(colId)) return s
        all.add(to.coerceIn(0, all.size), colId)
        return s.copy(order = all)
    }

    fun toggleHidden(s: GridState, colId: String): GridState = s.copy(hidden = if (colId in s.hidden) s.hidden - colId else s.hidden + colId)

    /** Header click: plain = this column only (asc -> desc -> off); [additive] (Shift) adds it as a further sort key. */
    fun toggleSort(s: GridState, colId: String, additive: Boolean): GridState {
        val cur = s.sort.firstOrNull { it.colId == colId }
        val next = when {
            cur == null -> SortKey(colId, true)
            cur.asc -> SortKey(colId, false)
            else -> null
        }
        val rest = if (additive) s.sort.filter { it.colId != colId } else emptyList()
        return s.copy(sort = if (next == null) rest else rest + next)
    }

    fun setFilter(s: GridState, colId: String, text: String): GridState = s.copy(filters = if (text.isBlank()) s.filters - colId else s.filters + (colId to text))
    fun setQuery(s: GridState, q: String): GridState = s.copy(query = q)
    fun clearFilters(s: GridState): GridState = s.copy(filters = emptyMap(), query = "")

    /** Rows after the quick filter (any visible cell contains the text) and the per-column filters (case-insensitive), then the sort. */
    fun <R> view(rows: List<R>, cols: List<GridCol<R>>, s: GridState): List<R> {
        val shown = visible(cols, s)
        val q = s.query.trim().lowercase()
        val byId = cols.associateBy { it.id }
        val filtered = rows.filter { r ->
            (q.isEmpty() || shown.any { it.value(r).lowercase().contains(q) }) &&
                s.filters.all { (id, f) -> byId[id]?.value?.invoke(r)?.lowercase()?.contains(f.trim().lowercase()) ?: true }
        }
        if (s.sort.isEmpty()) return filtered
        val cmp = s.sort.mapNotNull { k -> byId[k.colId]?.sortKey?.let { sk -> k to sk } }.map { (k, sk) ->
            Comparator<R> { a, b ->
                @Suppress("UNCHECKED_CAST") val x = sk(a) as Comparable<Any>?
                @Suppress("UNCHECKED_CAST") val y = sk(b) as Comparable<Any>?
                when { x == null && y == null -> 0; x == null -> 1; y == null -> -1; else -> if (k.asc) x.compareTo(y) else y.compareTo(x) } // empty cells stay last either way
            }
        }
        return if (cmp.isEmpty()) filtered else filtered.sortedWith(cmp.reduce { a, b -> a.then(b) })
    }

    // ---------- selection ----------

    /** Mouse click on the row at [index] of [keys] (the view order): plain = only it; Ctrl = toggle; Shift = range from the anchor. */
    fun click(s: GridState, keys: List<Any>, index: Int, ctrl: Boolean, shift: Boolean): GridState {
        val k = keys.getOrNull(index) ?: return s
        return when {
            shift && s.anchor != null -> {
                val a = keys.indexOf(s.anchor).takeIf { it >= 0 } ?: index
                val range = keys.subList(minOf(a, index), maxOf(a, index) + 1).toSet()
                s.copy(selected = if (ctrl) s.selected + range else range, active = k)
            }
            ctrl -> s.copy(selected = if (k in s.selected) s.selected - k else s.selected + k, active = k, anchor = k)
            else -> s.copy(selected = setOf(k), active = k, anchor = k)
        }
    }

    /** Arrow / Page / Home / End: moves the active row by [delta] (or to an end) and, with Shift, extends the selection from the anchor. */
    fun move(s: GridState, keys: List<Any>, delta: Int, shift: Boolean, toEnd: Boolean = false): GridState {
        if (keys.isEmpty()) return s
        val cur = keys.indexOf(s.active)
        val target = when {
            toEnd -> if (delta < 0) 0 else keys.lastIndex
            cur < 0 -> if (delta < 0) keys.lastIndex else 0
            else -> (cur + delta).coerceIn(0, keys.lastIndex)
        }
        return click(s, keys, target, ctrl = false, shift = shift).let { if (shift && it.anchor == null) it.copy(anchor = keys[target]) else it }
    }

    fun selectAll(s: GridState, keys: List<Any>): GridState = s.copy(selected = keys.toSet(), active = s.active ?: keys.firstOrNull(), anchor = s.anchor ?: keys.firstOrNull())
    fun clearSelection(s: GridState): GridState = s.copy(selected = emptySet())
    /** Keeps only selection keys that still exist (after a refresh / filter change). */
    fun prune(s: GridState, keys: List<Any>): GridState { val set = keys.toSet(); return s.copy(selected = s.selected.filterTo(HashSet()) { it in set }, active = s.active?.takeIf { it in set }, anchor = s.anchor?.takeIf { it in set }) }

    // ---------- copy / export ----------

    private fun cell(t: String) = t.replace('\t', ' ').replace('\r', ' ').replace('\n', ' ')

    /** Tab-separated text of the visible columns for [rows] (what Excel pastes into cells). */
    fun <R> toTsv(rows: List<R>, cols: List<GridCol<R>>, s: GridState, header: Boolean = true): String {
        val shown = visible(cols, s)
        val lines = ArrayList<String>()
        if (header) lines += shown.joinToString("\t") { cell(it.title) }
        rows.forEach { r -> lines += shown.joinToString("\t") { cell(it.value(r)) } }
        return lines.joinToString("\r\n")
    }

    /** Semicolon CSV (opens in Excel with a Uzbek / Russian regional setting) with a UTF-8 BOM so Cyrillic and apostrophes survive. */
    fun <R> toCsv(rows: List<R>, cols: List<GridCol<R>>, s: GridState): String {
        val shown = visible(cols, s)
        fun q(t: String) = if (t.any { it == ';' || it == '"' || it == '\n' || it == '\r' }) "\"" + t.replace("\"", "\"\"") + "\"" else t
        val lines = listOf(shown.joinToString(";") { q(it.title) }) + rows.map { r -> shown.joinToString(";") { q(it.value(r)) } }
        return "﻿" + lines.joinToString("\r\n")
    }
}
