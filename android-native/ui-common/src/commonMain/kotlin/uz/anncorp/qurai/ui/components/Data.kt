package uz.anncorp.qurai.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/**
 * One column of a [QTable]. [sort] makes the header clickable (click again = reverse). [numeric] right-aligns the cell with tabular
 * figures like `.fz-c-num`; [mono] is the shifr style (`.fz-c-shifr`). [text] is what the cell shows: numbers arrive already formatted
 * (server values through the shared formatter) - the table never computes anything.
 */
class QCol<R>(
    val title: String, val width: Dp, val numeric: Boolean = false,
    val sort: ((R) -> Comparable<*>?)? = null, val mono: Boolean = false, val weight: Float = 0f, val text: (R) -> String,
)

/**
 * `.fz-table`: sticky header (surface-2, uppercase labels), 32dp rows, thin dividers, hover/selected fill, sort by header, row click,
 * horizontal scroll when the columns are wider than the pane. The phone uses [QList] instead (see [QAdaptiveList]).
 */
@Composable
fun <R> QTable(
    rows: List<R>, cols: List<QCol<R>>, modifier: Modifier = Modifier, key: ((R) -> Any)? = null,
    onClick: ((R) -> Unit)? = null, selected: ((R) -> Boolean)? = null, empty: String = "Ma'lumot yo'q",
    footer: (@Composable () -> Unit)? = null,
) {
    val c = Q.colors
    var sortIdx by remember(cols.size) { mutableStateOf(-1) }
    var asc by remember(cols.size) { mutableStateOf(true) }
    val sorted = remember(rows, sortIdx, asc) {
        val s = cols.getOrNull(sortIdx)?.sort
        if (s == null) rows else {
            @Suppress("UNCHECKED_CAST")
            val cmp = Comparator<R> { a, b ->
                val x = s(a) as Comparable<Any>?; val y = s(b) as Comparable<Any>?
                when { x == null && y == null -> 0; x == null -> 1; y == null -> -1; else -> x.compareTo(y) }
            }
            rows.sortedWith(if (asc) cmp else cmp.reversed())
        }
    }
    val hs = rememberScrollState()
    Column(modifier.border(BorderStroke(1.dp, c.border), Q.shape.medium).background(c.surface, Q.shape.medium)) {
        Column(Modifier.weight(1f, fill = true).horizontalScroll(hs)) {
            Row(Modifier.background(c.surface2).heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically) {
                cols.forEachIndexed { i, col ->
                    val mark = if (i == sortIdx) (if (asc) " ▲" else " ▼") else ""
                    Text(
                        (col.title.uppercase() + mark), cellMod(col).padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = 6.dp).let { m ->
                            if (col.sort != null) m.clickable { if (sortIdx == i) asc = !asc else { sortIdx = i; asc = true } } else m
                        },
                        style = Q.type.labelSmall, color = if (i == sortIdx) c.accentText else c.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        textAlign = if (col.numeric) TextAlign.End else TextAlign.Start,
                    )
                }
            }
            QDivider()
            if (sorted.isEmpty()) Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { Text(empty, color = c.textMute, style = Q.type.bodyMedium) }
            LazyColumn(Modifier.weight(1f, fill = false)) {
                items(sorted, key = key) { r ->
                    val sel = selected?.invoke(r) == true
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = Q.layout.rowHeight).background(if (sel) c.accentSoft else Color.Transparent)
                            .let { m -> if (onClick != null) m.clickable { onClick(r) } else m },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        cols.forEach { col ->
                            Text(
                                col.text(r), cellMod(col).padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = 6.dp),
                                style = if (col.mono) Q.type.bodySmall else Q.type.bodyMedium, fontFamily = if (col.mono) FontFamily.Monospace else null,
                                color = if (col.mono) c.textMute else c.text, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                textAlign = if (col.numeric) TextAlign.End else TextAlign.Start,
                            )
                        }
                    }
                    QDivider()
                }
            }
        }
        footer?.invoke()
    }
}

private fun <R> cellMod(col: QCol<R>): Modifier = if (col.weight > 0f) Modifier.width(col.width) else Modifier.width(col.width)

/** One row of a phone list: leading icon, title, sub line (chips go in [trailing]), chevron when clickable. */
@Composable
fun QListRow(
    title: String, modifier: Modifier = Modifier, sub: String? = null, meta: String? = null, icon: ImageVector? = null,
    trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null, selected: Boolean = false,
) {
    val c = Q.colors
    Row(
        modifier.fillMaxWidth().heightIn(min = Q.layout.rowHeight).background(if (selected) c.accentSoft else Color.Transparent)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp),
    ) {
        if (icon != null) Icon(icon, null, Modifier.size(20.dp), tint = c.textDim)
        Column(Modifier.weight(1f)) {
            Text(title, style = Q.type.bodyLarge, color = c.text, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (sub != null) Text(sub, style = Q.type.bodySmall, color = c.textMute, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (meta != null) Text(meta, style = Q.type.bodyMedium, color = c.text, textAlign = TextAlign.End, maxLines = 1)
        trailing?.invoke()
        if (onClick != null && trailing == null) Icon(QIcons.ChevronRight, null, Modifier.size(16.dp), tint = c.textMute)
    }
}

/** Phone list with thin dividers inside a card; the same rows as the table but vertical. */
@Composable
fun <R> QList(
    rows: List<R>, modifier: Modifier = Modifier, key: ((R) -> Any)? = null, empty: String = "Ma'lumot yo'q",
    row: @Composable (R) -> Unit,
) {
    val c = Q.colors
    if (rows.isEmpty()) { QEmpty(empty, modifier); return }
    LazyColumn(modifier.border(BorderStroke(1.dp, c.border), Q.shape.medium).background(c.surface, Q.shape.medium)) {
        items(rows, key = key) { r -> row(r); QDivider() }
    }
}

/**
 * THE adaptive list used by shared screens: wide windows get the sortable [QTable], phones get [QList] rows (title / sub / meta),
 * built from the same column definitions so the two never drift. [title] picks the main column, [sub] the secondary line, [meta] the number.
 */
@Composable
fun <R> QAdaptiveList(
    rows: List<R>, cols: List<QCol<R>>, modifier: Modifier = Modifier, key: ((R) -> Any)? = null, onClick: ((R) -> Unit)? = null,
    selected: ((R) -> Boolean)? = null, empty: String = "Ma'lumot yo'q", titleCol: Int = 0, subCols: List<Int> = emptyList(), metaCol: Int? = null,
) {
    if (Q.layout.wide) QTable(rows, cols, modifier, key, onClick, selected, empty)
    else QList(rows, modifier, key, empty) { r ->
        QListRow(
            cols[titleCol].text(r), sub = subCols.mapNotNull { cols.getOrNull(it)?.text?.invoke(r)?.takeIf { s -> s.isNotBlank() } }.joinToString(" · ").ifBlank { null },
            meta = metaCol?.let { cols.getOrNull(it)?.text?.invoke(r) }, onClick = onClick?.let { f -> { f(r) } }, selected = selected?.invoke(r) == true,
        )
    }
}

enum class QTone { Neutral, Accent, Ok, Warn, Danger, Info }

/** `.fz-chip`: 18dp tall, 11/600, tinted fill. */
@Composable
fun QChip(text: String, modifier: Modifier = Modifier, tone: QTone = QTone.Neutral) {
    val c = Q.colors
    val (bg, fg) = when (tone) {
        QTone.Neutral -> c.surface3 to c.textDim
        QTone.Accent -> c.accentSoft to c.accentText
        QTone.Ok -> c.okSoft to c.ok
        QTone.Warn -> c.warnSoft to c.warn
        QTone.Danger -> c.dangerSoft to c.danger
        QTone.Info -> c.infoSoft to c.info
    }
    Text(text, modifier.heightIn(min = 18.dp).background(bg, Q.shape.extraSmall).padding(horizontal = 6.dp, vertical = 1.dp), style = Q.type.labelSmall, color = fg, maxLines = 1)
}

/** Filter chips (single choice) - the site's filter bars. */
@Composable
fun <O> QFilterBar(options: List<O>, selected: O?, label: (O) -> String, onSelect: (O) -> Unit, modifier: Modifier = Modifier) {
    val c = Q.colors
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
        options.forEach { o ->
            val sel = o == selected
            Text(
                label(o), Modifier.heightIn(min = if (Q.layout.wide) 28.dp else 36.dp).background(if (sel) c.accentSoft else c.surface2, Q.shape.small)
                    .border(BorderStroke(1.dp, if (sel) c.accent else c.border), Q.shape.small).clickable { onSelect(o) }
                    .padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = 5.dp),
                style = Q.type.labelMedium, color = if (sel) c.accentText else c.textDim, maxLines = 1,
            )
        }
    }
}

/** Tabs (`BolimTablari`): underline accent on the active one; scrolls sideways when too many for the phone. */
@Composable
fun <O> QTabs(options: List<O>, selected: O, label: (O) -> String, onSelect: (O) -> Unit, modifier: Modifier = Modifier) {
    val c = Q.colors
    Column(modifier) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            options.forEach { o ->
                val sel = o == selected
                Column(Modifier.clickable { onSelect(o) }.heightIn(min = Q.layout.control), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(label(o), Modifier.padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = 6.dp), style = Q.type.labelLarge, color = if (sel) c.accentText else c.textDim, maxLines = 1)
                    Box(Modifier.height(2.dp).fillMaxWidth().background(if (sel) c.accent else Color.Transparent))
                }
            }
        }
        QDivider()
    }
}

/**
 * The money triple the website shows everywhere (`fz-doc__total`): QQS bilan (primary, big), ustamali (QQS siz) and ustamasiz.
 * The client NEVER computes any of these: every value is a string the server produced (null = "—", never 0). The block is layout only.
 */
@Composable
fun QSumBlock(qqsBilan: String?, ustamali: String?, ustamasiz: String?, modifier: Modifier = Modifier, caption: String? = null) {
    val c = Q.colors
    val dash = "—"
    Column(modifier.background(c.surface2, Q.shape.medium).border(BorderStroke(1.dp, c.border), Q.shape.medium).padding(QuraiTokens.SPACE_4.dp), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
        if (caption != null) Text(caption.uppercase(), style = Q.type.labelSmall, color = c.textMute)
        Text(qqsBilan ?: dash, style = Q.type.headlineMedium, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("QQS bilan", style = Q.type.bodySmall, color = c.textMute)
        QDivider()
        FlowRow(horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_6.dp), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            Column { Text(ustamali ?: dash, style = Q.type.titleSmall, color = c.text); Text("Ustamali (QQS siz)", style = Q.type.bodySmall, color = c.textMute) }
            Column { Text(ustamasiz ?: dash, style = Q.type.titleSmall, color = c.text); Text("Ustamasiz", style = Q.type.bodySmall, color = c.textMute) }
        }
    }
}

/** Small labelled value (`Kv`): caption above, value below. */
@Composable
fun QKv(k: String, v: String, modifier: Modifier = Modifier) {
    Column(modifier) { Text(k, style = Q.type.bodySmall, color = Q.colors.textMute); Text(v, style = Q.type.titleSmall, color = Q.colors.text) }
}
