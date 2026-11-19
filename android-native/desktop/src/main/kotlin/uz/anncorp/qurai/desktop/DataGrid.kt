@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.ui.ExperimentalComposeUiApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.isPrimaryPressed
import androidx.compose.ui.input.pointer.isCtrlPressed as isPtrCtrl
import androidx.compose.ui.input.pointer.isShiftPressed as isPtrShift
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridLogic
import uz.anncorp.qurai.ui.components.GridState
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection

/** What the screen wants painted on a cell: normal, edited-but-not-saved, or invalid. */
enum class CellMark { None, Changed, Invalid }

/** One entry of the right-click menu (the grid adds copy / export / column items itself). */
class GridAction<R>(val label: String, val enabled: (List<R>) -> Boolean = { it.isNotEmpty() }, val run: (List<R>) -> Unit)

/**
 * The Windows data grid: virtualized rows (10 000+ stay smooth), sticky header, resizable / hideable / freezable columns, multi-column sort
 * (Shift+click), quick + per-column filters, multi-select (click, Ctrl, Shift, Ctrl+A), keyboard navigation, Ctrl+C = TSV that pastes into
 * Excel, inline cell edit (F2 / Enter / double-click, Esc cancels), Del, right-click menu. Logic: [GridLogic] (tested); numbers are shown as given.
 */
@Composable
fun <R> DataGrid(
    rows: List<R>, cols: List<GridCol<R>>, key: (R) -> Any, state: GridState, onState: (GridState) -> Unit, modifier: Modifier = Modifier,
    focus: FocusRequester = remember { FocusRequester() }, showFilters: Boolean = false, empty: String = "Ma'lumot yo'q",
    rowTone: (R) -> QTone? = { null }, cellMark: (R, GridCol<R>) -> CellMark = { _, _ -> CellMark.None },
    onEdit: ((R, GridCol<R>, String) -> Unit)? = null, onDelete: ((List<R>) -> Unit)? = null, onOpen: ((R) -> Unit)? = null,
    actions: List<GridAction<R>> = emptyList(), onFind: () -> Unit = {}, onExport: ((List<R>) -> Unit)? = null,
) {
    val c = Q.colors
    val st by rememberUpdatedState(state)
    val view = remember(rows, cols, state.sort, state.filters, state.query, state.hidden, state.order) { GridLogic.view(rows, cols, state) }
    val keys = remember(view) { view.map { key(it) } }
    val shown = remember(cols, state.order, state.hidden) { GridLogic.visible(cols, state) }
    val frozenN = state.frozen.coerceIn(0, shown.size)
    val frozenCols = shown.take(frozenN); val scrollCols = shown.drop(frozenN)
    val hs = rememberScrollState()
    val list = rememberLazyListState()
    var edit by remember { mutableStateOf<Pair<Any, String>?>(null) }   // (row key, column id)
    var editText by remember { mutableStateOf("") }
    val rowH = Q.layout.rowHeight
    val density = LocalDensity.current

    LaunchedEffect(keys) { if (state.selected.isNotEmpty() || state.active != null) onState(GridLogic.prune(st, keys)) }
    LaunchedEffect(state.active) {
        val i = keys.indexOf(state.active); if (i < 0) return@LaunchedEffect
        val info = list.layoutInfo
        val first = info.visibleItemsInfo.firstOrNull()?.index ?: 0; val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
        if (i <= first) list.scrollToItem(i) else if (i >= last) list.scrollToItem((i - (last - first) + 1).coerceAtLeast(0))
    }
    fun selectedRows(): List<R> { val s = st.selected; val sel = view.filter { key(it) in s }; return sel.ifEmpty { view.filter { key(it) == st.active } } }
    fun copy(withHeader: Boolean) { val r = selectedRows().ifEmpty { view }; runCatching { Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(GridLogic.toTsv(r, cols, st, withHeader)), null) } }
    fun startEdit(r: R, col: GridCol<R>?) {
        val cc = col?.takeIf { it.editable } ?: shown.firstOrNull { it.editable } ?: return
        if (onEdit == null) return
        edit = key(r) to cc.id; editText = cc.value(r)
    }
    fun commit() { val e = edit ?: return; edit = null; val r = view.firstOrNull { key(it) == e.first } ?: return; val col = cols.firstOrNull { it.id == e.second } ?: return; if (editText != col.value(r)) onEdit?.invoke(r, col, editText) }

    Column(
        modifier.border(androidx.compose.foundation.BorderStroke(1.dp, c.border), Q.shape.medium).background(c.surface, Q.shape.medium)
            .onKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown || edit != null) return@onKeyEvent false
                val page = ((list.layoutInfo.viewportEndOffset / with(density) { rowH.toPx() }).toInt() - 1).coerceAtLeast(1)
                when {
                    e.key == Key.DirectionDown -> onState(GridLogic.move(st, keys, 1, e.isShiftPressed))
                    e.key == Key.DirectionUp -> onState(GridLogic.move(st, keys, -1, e.isShiftPressed))
                    e.key == Key.PageDown -> onState(GridLogic.move(st, keys, page, e.isShiftPressed))
                    e.key == Key.PageUp -> onState(GridLogic.move(st, keys, -page, e.isShiftPressed))
                    e.key == Key.MoveEnd -> onState(GridLogic.move(st, keys, 1, e.isShiftPressed, toEnd = true))
                    e.key == Key.MoveHome -> onState(GridLogic.move(st, keys, -1, e.isShiftPressed, toEnd = true))
                    e.isCtrlPressed && e.key == Key.A -> onState(GridLogic.selectAll(st, keys))
                    e.isCtrlPressed && e.key == Key.C -> copy(e.isShiftPressed)
                    e.isCtrlPressed && e.key == Key.F -> onFind()
                    e.key == Key.Delete && onDelete != null -> selectedRows().takeIf { it.isNotEmpty() }?.let(onDelete)
                    e.key == Key.Escape -> onState(GridLogic.clearSelection(st))
                    (e.key == Key.F2 || e.key == Key.Enter) -> view.firstOrNull { key(it) == st.active }?.let { if (onEdit != null) startEdit(it, null) else onOpen?.invoke(it) }
                    else -> return@onKeyEvent false
                }
                true
            }.focusRequester(focus).focusable(),
    ) {
        // ---- header (right-click: columns menu) ----
        ContextMenuArea(items = {
            buildList {
                shown.forEachIndexed { i, col -> add(ContextMenuItem("Muzlatish: shu ustungacha (${col.title})") { onState(st.copy(frozen = i + 1)) }) }
                add(ContextMenuItem("Muzlatishni olib tashlash") { onState(st.copy(frozen = 0)) })
                cols.forEach { col -> add(ContextMenuItem((if (col.id in st.hidden) "Ko'rsatish: " else "Yashirish: ") + col.title) { onState(GridLogic.toggleHidden(st, col.id)) }) }
                add(ContextMenuItem("Ustunlarni asl holiga qaytarish") { onState(st.copy(order = emptyList(), widths = emptyMap(), hidden = emptySet(), frozen = 0)) })
            }
        }) {
            Row(Modifier.fillMaxWidth().background(c.surface2).height(32.dp)) {
                @Composable fun head(col: GridCol<R>) {
                    val w = GridLogic.widthOf(col, st)
                    val k = st.sort.indexOfFirst { it.colId == col.id }
                    val mark = if (k < 0) "" else (if (st.sort[k].asc) "\u0020\u25B2" else "\u0020\u25BC") + (if (st.sort.size > 1) "${k + 1}" else "")
                    Box(Modifier.width(w.dp).height(32.dp)) {
                        Text(
                            col.title.uppercase() + mark, Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 7.dp)
                                .pointerInput(col.id) { awaitPointerEventScope { while (true) { val e = awaitPointerEvent(); if (e.type == PointerEventType.Press && e.buttons.isPrimaryPressed && col.sortKey != null) onState(GridLogic.toggleSort(st, col.id, e.keyboardModifiers.isPtrShift)) } } },
                            style = Q.type.labelSmall, color = if (k >= 0) c.accentText else c.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            textAlign = if (col.numeric) TextAlign.End else TextAlign.Start, fontWeight = FontWeight.SemiBold,
                        )
                        Box(Modifier.align(Alignment.CenterEnd).width(6.dp).fillMaxHeight().pointerInput(col.id) {
                            detectHorizontalDragGestures { _, dx -> onState(GridLogic.resize(st, col.id, GridLogic.widthOf(col, st), dx / density.density)) }
                        })
                    }
                }
                frozenCols.forEach { head(it) }
                Box(Modifier.weight(1f).horizontalScroll(hs)) { Row { scrollCols.forEach { head(it) } } }
            }
        }
        if (showFilters) Row(Modifier.fillMaxWidth().background(c.surface2).padding(bottom = 2.dp)) {
            @Composable fun f(col: GridCol<R>) = BasicTextField(
                st.filters[col.id].orEmpty(), { onState(GridLogic.setFilter(st, col.id, it)) },
                Modifier.width(GridLogic.widthOf(col, st).dp).padding(horizontal = 6.dp).background(c.surface, Q.shape.small).padding(horizontal = 6.dp, vertical = 3.dp),
                singleLine = true, textStyle = Q.type.bodySmall.copy(color = c.text), cursorBrush = SolidColor(c.accent),
            )
            frozenCols.forEach { f(it) }
            Box(Modifier.weight(1f).horizontalScroll(hs)) { Row { scrollCols.forEach { f(it) } } }
        }
        uz.anncorp.qurai.ui.components.QDivider()
        if (view.isEmpty()) Box(Modifier.fillMaxWidth().weight(1f).padding(24.dp), contentAlignment = Alignment.Center) { Text(empty, color = c.textMute, style = Q.type.bodyMedium) }
        else LazyColumn(Modifier.fillMaxWidth().weight(1f), state = list) {
            itemsIndexed(view, key = { _, r -> key(r) }) { idx, r ->
                val k = key(r)
                val sel = k in state.selected
                val act = k == state.active
                val tone = rowTone(r)
                val bg = when {
                    sel -> c.accentSoft
                    tone == QTone.Danger -> c.dangerSoft
                    tone == QTone.Warn -> c.warnSoft
                    tone == QTone.Ok -> c.okSoft
                    else -> Color.Transparent
                }
                ContextMenuArea(items = {
                    if (k !in st.selected) onState(GridLogic.click(st, keys, idx, false, false))
                    val rowsNow = selectedRows().ifEmpty { listOf(r) }
                    buildList {
                        add(ContextMenuItem("Nusxalash (Ctrl+C)") { copy(false) })
                        add(ContextMenuItem("Sarlavha bilan nusxalash (Ctrl+Shift+C)") { copy(true) })
                        if (onExport != null) add(ContextMenuItem("Excelga eksport (CSV)") { onExport(rowsNow) })
                        if (onEdit != null) add(ContextMenuItem("Tahrirlash (F2)") { startEdit(r, null) })
                        actions.filter { it.enabled(rowsNow) }.forEach { a -> add(ContextMenuItem(a.label) { a.run(rowsNow) }) }
                        if (onDelete != null) add(ContextMenuItem("O'chirish (Del)") { onDelete(rowsNow) })
                    }
                }) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = rowH).background(bg).then(if (act) Modifier.border(androidx.compose.foundation.BorderStroke(1.dp, c.accent)) else Modifier)
                            .pointerInput(k) {
                                awaitPointerEventScope { while (true) {
                                    val e = awaitPointerEvent()
                                    if (e.type == PointerEventType.Press && e.buttons.isPrimaryPressed) { focus.requestFocus(); if (edit != null) commit(); onState(GridLogic.click(st, keys, keys.indexOf(k).coerceAtLeast(0), e.keyboardModifiers.isPtrCtrl, e.keyboardModifiers.isPtrShift)) }
                                } }
                            }
                            .pointerInput(k) { detectTapGestures(onDoubleTap = { if (onEdit != null) startEdit(r, null) else onOpen?.invoke(r) }) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        @Composable fun cell(col: GridCol<R>) {
                            val m = cellMark(r, col)
                            val bgc = when (m) { CellMark.Changed -> c.infoSoft; CellMark.Invalid -> c.dangerSoft; else -> Color.Transparent }
                            val editing = edit?.let { it.first == k && it.second == col.id } == true
                            Box(Modifier.width(GridLogic.widthOf(col, st).dp).background(bgc).padding(horizontal = 10.dp, vertical = 6.dp)) {
                                if (editing) {
                                    val fr = remember { FocusRequester() }
                                    LaunchedEffect(Unit) { runCatching { fr.requestFocus() } }
                                    BasicTextField(
                                        editText, { editText = it },
                                        Modifier.fillMaxWidth().focusRequester(fr).onPreviewKeyEvent { e ->
                                            if (e.type != KeyEventType.KeyDown) false else when (e.key) {
                                                Key.Enter -> { commit(); focus.requestFocus(); true }
                                                Key.Escape -> { edit = null; focus.requestFocus(); true }
                                                else -> false
                                            }
                                        },
                                        singleLine = true, textStyle = Q.type.bodyMedium.copy(color = c.text, textAlign = if (col.numeric) TextAlign.End else TextAlign.Start), cursorBrush = SolidColor(c.accent),
                                    )
                                } else Text(
                                    col.value(r), Modifier.fillMaxWidth(),
                                    style = if (col.mono) Q.type.bodySmall else Q.type.bodyMedium, fontFamily = if (col.mono) FontFamily.Monospace else null,
                                    color = if (col.mono) c.textMute else c.text, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = if (col.numeric) TextAlign.End else TextAlign.Start,
                                )
                            }
                        }
                        frozenCols.forEach { cell(it) }
                        Box(Modifier.weight(1f).horizontalScroll(hs)) { Row { scrollCols.forEach { cell(it) } } }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().background(c.surface2).padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text("${view.size} / ${rows.size} qator" + if (state.selected.size > 1) "  \u00B7  ${state.selected.size} tanlangan" else "", style = Q.type.labelSmall, color = c.textMute)
        }
    }
}

