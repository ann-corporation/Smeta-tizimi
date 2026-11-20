package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QEmpty
import uz.anncorp.qurai.ui.components.QSearchField
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/*
 * Loyiha > Shartnoma > Obyekt tree, ONE implementation for Android and Windows. Pure display values: money is already formatted
 * (server packages summed by the shared tree builder, QQS bilan first); null = unknown = a dash, never 0.
 */

sealed interface QTreeRow { val key: String }

/** [level] 0 = loyiha, 1 = shartnoma. [badge] = status chip text (loyiha holati); [partial] = "N ta narxsiz" note when only some objects have a sum. */
data class QTreeGroup(
    override val key: String, val depth: Int, val level: Int, val title: String, val badge: String?, val count: String, val open: Boolean,
    val qqsBilan: String?, val ustamali: String?, val ustamasiz: String?, val partial: String? = null,
) : QTreeRow

data class QTreeLeaf(override val key: String, val depth: Int, val row: QObjectRow, val selected: Boolean) : QTreeRow

data class QTreeTexts(
    val colObject: String = "Obyekt", val colQqs: String = "QQS bilan", val colMarkup: String = "Ustamali", val colPlain: String = "Ustamasiz",
    val colFact: String = "Fakt %", val colF2: String = "F-2 %", val empty: String = "Obyekt topilmadi",
    val rowsLabel: (Int) -> String = { "$it qator" }, val unpricedLabel: (Int) -> String = { "$it ta narxsiz" },
)

private val MONEY_COL: Dp = 138.dp
private val PCT_COL: Dp = 64.dp
private const val DASH = "—"

/**
 * [compact] = phone-style two-line rows (phone, and the narrow tree pane of the Windows two-pane layout); otherwise wide table-like rows with the
 * three money columns aligned under one header.
 */
@Composable
fun QObjectTree(
    rows: List<QTreeRow>, onToggle: (String) -> Unit, onOpen: (Long) -> Unit, modifier: Modifier = Modifier, compact: Boolean = !Q.layout.wide,
    texts: QTreeTexts = QTreeTexts(), contentPadding: PaddingValues = PaddingValues(0.dp),
) {
    if (rows.isEmpty()) { QEmpty(texts.empty, modifier); return }
    Column(modifier.fillMaxSize()) {
        if (!compact) WideHeader(texts)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = contentPadding, verticalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 2.dp)) {
            items(rows, key = { it.key }) { r ->
                when (r) {
                    is QTreeGroup -> if (compact) GroupCompact(r, texts) { onToggle(r.key) } else GroupWide(r) { onToggle(r.key) }
                    is QTreeLeaf -> if (compact) LeafCompact(r, texts) { onOpen(r.row.id) } else LeafWide(r, texts) { onOpen(r.row.id) }
                }
            }
        }
    }
}

private fun indent(depth: Int): Dp = (depth * 14).dp

@Composable
private fun Chevron(open: Boolean) = Icon(if (open) QIcons.ChevronDown else QIcons.ChevronRight, null, Modifier.size(18.dp), tint = Q.colors.textDim)

// ---------- compact (phone / narrow pane) ----------

@Composable
private fun GroupCompact(g: QTreeGroup, texts: QTreeTexts, onClick: () -> Unit) {
    val c = Q.colors
    val bg = if (g.level == 0) c.surface2 else c.surface
    Column(
        Modifier.padding(start = indent(g.depth)).fillMaxWidth().background(bg, Q.shape.medium).border(BorderStroke(1.dp, if (g.level == 0) c.borderStrong else c.border), Q.shape.medium)
            .clickable(onClick = onClick).heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chevron(g.open)
            Text(g.title, Modifier.weight(1f), style = if (g.level == 0) Q.type.titleMedium else Q.type.titleSmall, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            QChip(g.count, tone = QTone.Neutral)
        }
        Column(Modifier.padding(start = 26.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(g.qqsBilan?.let { "$it  ·  ${texts.colQqs}" } ?: DASH, style = Q.type.titleSmall, color = if (g.qqsBilan == null) c.textMute else c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${texts.colMarkup} ${g.ustamali ?: DASH}  ·  ${texts.colPlain} ${g.ustamasiz ?: DASH}", style = Q.type.bodySmall, color = c.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                g.badge?.let { QChip(it, tone = QTone.Info) }
                g.partial?.let { QChip(it, tone = QTone.Warn) }
            }
        }
    }
}

@Composable
private fun LeafCompact(l: QTreeLeaf, texts: QTreeTexts, onClick: () -> Unit) {
    val c = Q.colors
    val o = l.row
    Column(
        Modifier.padding(start = indent(l.depth)).fillMaxWidth().background(if (l.selected) c.accentSoft else c.surface, Q.shape.medium)
            .border(BorderStroke(1.dp, if (l.selected) c.accent else c.border), Q.shape.medium).clickable(onClick = onClick).heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(o.name, style = Q.type.titleSmall, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            o.type?.takeIf { it.isNotBlank() }?.let { QChip(it) }
            o.rows?.let { QChip(texts.rowsLabel(it)) }
            if ((o.unpriced ?: 0) > 0) QChip(texts.unpricedLabel(o.unpriced ?: 0), tone = QTone.Warn)
            o.factPct?.let { QChip("${texts.colFact} $it", tone = QTone.Accent) }
            o.f2Pct?.let { QChip("${texts.colF2} $it", tone = QTone.Info) }
        }
        Text(o.qqsBilan?.let { "$it  ·  ${texts.colQqs}" } ?: DASH, style = Q.type.titleSmall, color = if (o.qqsBilan == null) c.textMute else c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("${texts.colMarkup} ${o.ustamali ?: DASH}  ·  ${texts.colPlain} ${o.ustamasiz ?: DASH}", style = Q.type.bodySmall, color = c.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ---------- wide (table-like) ----------

@Composable
private fun WideHeader(t: QTreeTexts) {
    val c = Q.colors
    Row(Modifier.fillMaxWidth().background(c.surface2).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(t.colObject, Modifier.weight(1f), style = Q.type.labelMedium, color = c.textDim)
        HeadCell(t.colQqs, MONEY_COL); HeadCell(t.colMarkup, MONEY_COL); HeadCell(t.colPlain, MONEY_COL); HeadCell(t.colFact, PCT_COL); HeadCell(t.colF2, PCT_COL)
    }
}

@Composable private fun HeadCell(text: String, w: Dp) = Text(text, Modifier.width(w), style = Q.type.labelMedium, color = Q.colors.textDim, textAlign = TextAlign.End, maxLines = 1)
@Composable private fun Cell(text: String?, w: Dp, strong: Boolean = false) =
    Text(text ?: DASH, Modifier.width(w), style = if (strong) Q.type.titleSmall else Q.type.bodyMedium, color = if (text == null) Q.colors.textMute else Q.colors.text, textAlign = TextAlign.End, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
private fun GroupWide(g: QTreeGroup, onClick: () -> Unit) {
    val c = Q.colors
    Row(
        Modifier.fillMaxWidth().background(if (g.level == 0) c.surface2 else c.surface, Q.shape.small).clickable(onClick = onClick).heightIn(min = 36.dp).padding(start = 10.dp + indent(g.depth), end = 10.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chevron(g.open)
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(g.title, Modifier.weight(1f, fill = false), style = if (g.level == 0) Q.type.titleSmall else Q.type.bodyMedium, fontWeight = if (g.level == 0) FontWeight.SemiBold else FontWeight.Medium, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            QChip(g.count)
            g.badge?.let { QChip(it, tone = QTone.Info) }
            g.partial?.let { QChip(it, tone = QTone.Warn) }
        }
        Cell(g.qqsBilan, MONEY_COL, strong = true); Cell(g.ustamali, MONEY_COL); Cell(g.ustamasiz, MONEY_COL)
        Spacer(Modifier.width(PCT_COL * 2))
    }
}

@Composable
private fun LeafWide(l: QTreeLeaf, texts: QTreeTexts, onClick: () -> Unit) {
    val c = Q.colors
    val o = l.row
    Row(
        Modifier.fillMaxWidth().background(if (l.selected) c.accentSoft else androidx.compose.ui.graphics.Color.Transparent, Q.shape.small).clickable(onClick = onClick)
            .heightIn(min = 32.dp).padding(start = 10.dp + 26.dp + indent(l.depth), end = 10.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(o.name, Modifier.weight(1f, fill = false), style = Q.type.bodyMedium, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            o.type?.takeIf { it.isNotBlank() }?.let { QChip(it) }
            if ((o.unpriced ?: 0) > 0) QChip(texts.unpricedLabel(o.unpriced ?: 0), tone = QTone.Warn)
        }
        Cell(o.qqsBilan, MONEY_COL, strong = true); Cell(o.ustamali, MONEY_COL); Cell(o.ustamasiz, MONEY_COL); Cell(o.factPct, PCT_COL); Cell(o.f2Pct, PCT_COL)
    }
}

// ---------- search + filters + expand/collapse ----------

data class QFilterOption(val id: Long?, val label: String)

data class QTreeFilterTexts(
    val search: String = "Obyekt, shartnoma yoki loyiha", val loyiha: String = "Loyiha", val shartnoma: String = "Shartnoma", val status: String = "Holat",
    val all: String = "Hammasi", val expandAll: String = "Hammasini yoyish", val collapseAll: String = "Yig'ish", val reset: String = "Tozalash",
)

/** Search field + loyiha / shartnoma / holat selectors + expand/collapse all. [status] ids are indexes into [statusOptions] (null = all). */
@Composable
fun QTreeFilters(
    query: String, onQuery: (String) -> Unit,
    loyiha: QFilterOption?, loyihaOptions: List<QFilterOption>, onLoyiha: (QFilterOption) -> Unit,
    shartnoma: QFilterOption?, shartnomaOptions: List<QFilterOption>, onShartnoma: (QFilterOption) -> Unit,
    status: QFilterOption?, statusOptions: List<QFilterOption>, onStatus: (QFilterOption) -> Unit,
    onExpandAll: () -> Unit, onCollapseAll: () -> Unit, modifier: Modifier = Modifier, texts: QTreeFilterTexts = QTreeFilterTexts(), showStructureFilters: Boolean = true,
) {
    val all = QFilterOption(null, texts.all)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QSearchField(query, onQuery, Modifier.fillMaxWidth(), placeholder = texts.search)
        if (showStructureFilters) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                QSelect(loyiha ?: all, listOf(all) + loyihaOptions, { if (it.id == null) texts.loyiha else "${texts.loyiha}: ${it.label}" }, onLoyiha, minWidth = 120)
                QSelect(shartnoma ?: all, listOf(all) + shartnomaOptions, { if (it.id == null) texts.shartnoma else "${texts.shartnoma}: ${it.label}" }, onShartnoma, minWidth = 120)
                QSelect(status ?: all, listOf(all) + statusOptions, { if (it.id == null) texts.status else "${texts.status}: ${it.label}" }, onStatus, minWidth = 100)
                QButton(texts.expandAll, onExpandAll, kind = QButtonKind.Ghost)
                QButton(texts.collapseAll, onCollapseAll, kind = QButtonKind.Ghost)
            }
        }
    }
}

// ---------- context ("Kontekst") panel ----------

data class QScopeTexts(val title: String = "Kontekst", val loyiha: String = "Loyiha", val shartnoma: String = "Shartnoma", val obyekt: String = "Obyekt", val all: String = "Hammasi", val clear: String = "Tozalash")

/** Quick switch of the current context: loyiha, shartnoma, obyekt (each narrows the next). Used in a dialog / sheet by both apps. */
@Composable
fun QScopePanel(
    loyiha: QFilterOption?, loyihaOptions: List<QFilterOption>, onLoyiha: (QFilterOption) -> Unit,
    shartnoma: QFilterOption?, shartnomaOptions: List<QFilterOption>, onShartnoma: (QFilterOption) -> Unit,
    obyekt: QFilterOption?, obyektOptions: List<QFilterOption>, onObyekt: (QFilterOption) -> Unit, onClear: () -> Unit,
    modifier: Modifier = Modifier, texts: QScopeTexts = QScopeTexts(),
) {
    val all = QFilterOption(null, texts.all)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp)) {
        QSelect(loyiha ?: all, listOf(all) + loyihaOptions, { it.label }, onLoyiha, title = texts.loyiha, fill = true)
        QSelect(shartnoma ?: all, listOf(all) + shartnomaOptions, { it.label }, onShartnoma, title = texts.shartnoma, fill = true)
        QSelect(obyekt ?: all, listOf(all) + obyektOptions, { it.label }, onObyekt, title = texts.obyekt, fill = true)
        QButton(texts.clear, onClear, kind = QButtonKind.Ghost)
        Spacer(Modifier.height(2.dp))
    }
}
