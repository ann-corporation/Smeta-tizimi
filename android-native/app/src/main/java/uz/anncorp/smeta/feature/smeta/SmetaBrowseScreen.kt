package uz.anncorp.smeta.feature.smeta

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.UnfoldLess
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.FaktRepository
import uz.anncorp.smeta.core.data.MoneyRepository
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.Rollup
import uz.anncorp.smeta.core.data.RowsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.expandableIds
import uz.anncorp.smeta.core.data.fallbackNodes
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.data.formatVolumeSigned
import uz.anncorp.smeta.core.data.rollups
import uz.anncorp.smeta.core.data.toQator
import uz.anncorp.smeta.core.data.visibleNodes
import uz.anncorp.smeta.core.data.volumeSplit
import uz.anncorp.smeta.core.db.DraftEntity
import uz.anncorp.smeta.core.db.NodeEntity
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.InfoTip
import uz.anncorp.smeta.core.ui.LegendDot
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.StackedVolumeBar
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.work.VolumeDialog
import javax.inject.Inject

/** Display strings of a row, formatted ONCE off the main thread when the tree loads (formatting 25 000 rows while scrolling is what made the list janky). */
class NodeTexts(val nom: String, val v1: String, val v2: String, val v3: String, val v4: String, val sum: String?)

private val NO_TEXTS = NodeTexts("", "", "", "", "", null)

private fun textsOf(list: List<NodeEntity>): Map<Long, NodeTexts> {
    val out = HashMap<Long, NodeTexts>(list.size * 2)
    for (n in list) out[n.id] = when {
        n.isRz -> NodeTexts(n.nom.uppercase(), "", "", "", "", null)
        n.isBl -> NodeTexts(n.nom.uppercase(), formatVolume(n.hajm), formatVolume(n.faktHajm), formatVolume(n.f2Hajm), formatVolume(n.qoldiq), n.summa?.let { formatMoney(it) })
        else -> NodeTexts(n.nom, formatVolume(n.norma), formatVolume(n.hajm), n.narx?.let { formatMoney(it) } ?: "\u2014", n.summa?.let { formatMoney(it) } ?: "\u2014", null)
    }
    return out
}

private class TreeData(val nodes: List<NodeEntity>, val rollups: Map<Long, Rollup>, val expandable: Set<Long>, val bl: Int, val texts: Map<Long, NodeTexts> = emptyMap())

data class SmetaUi(
    val obyekt: ObyektEntity? = null,
    val money: ObjectMoney? = null,
    val visible: List<NodeEntity> = emptyList(),
    val rollups: Map<Long, Rollup> = emptyMap(),
    internal val texts: Map<Long, NodeTexts> = emptyMap(),
    val expanded: Set<Long> = emptySet(),
    val total: Int = 0,
    val blCount: Int = 0,
    val query: String = "",
    val drafted: Map<Long, DraftEntity> = emptyMap(),
    /** Server-computed per-node sums (QQS bilan first); null until the first answer. */
    val sums: uz.anncorp.smeta.core.data.NodeSumsPack? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
)

/**
 * Full estimate tree from the local Room cache (filled by the object packet): sections collapsed by default, expand / collapse all,
 * search that keeps the parent path. The visible list is flattened off the main thread and drawn by a LazyColumn with stable keys,
 * so a 26 000-row object stays smooth.
 */
@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class SmetaBrowseViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val rows: RowsRepository, money: MoneyRepository, private val fakt: FaktRepository,
    private val nodeSums: uz.anncorp.smeta.core.data.NodeSumsRepository,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val query = MutableStateFlow("")
    private val expanded = MutableStateFlow<Set<Long>>(emptySet())
    private val sync = MutableStateFlow<Pair<Boolean, SyncResult?>>(true to null)

    private val tree = combine(rows.nodes(id), rows.all(id)) { nodes, flat ->
        val list = if (nodes.isNotEmpty()) nodes else fallbackNodes(flat)
        TreeData(list, rollups(list), expandableIds(list), list.count { it.isBl }, textsOf(list))
    }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, TreeData(emptyList(), emptyMap(), emptySet(), 0))

    private val visible = combine(tree, expanded, query.debounce(150)) { t, e, q -> visibleNodes(t.nodes, e, q) }.flowOn(Dispatchers.Default)

    val state: StateFlow<SmetaUi> = combine(tree, visible, expanded, query) { t, v, e, q ->
        SmetaUi(visible = v, rollups = t.rollups, texts = t.texts, expanded = e, total = t.nodes.size, blCount = t.bl, query = q)
    }.combine(combine(objects.observeOne(id), money.observe(id), rows.lastUpdated(id), fakt.drafts(id)) { o, m, ts, d -> arrayOf(o, m, ts, d) }) { ui, x ->
        @Suppress("UNCHECKED_CAST")
        ui.copy(obyekt = x[0] as ObyektEntity?, money = x[1] as ObjectMoney?, updatedAt = x[2] as Long?, drafted = (x[3] as List<DraftEntity>).associateBy { it.qatorId })
    }.combine(sync) { ui, s -> ui.copy(syncing = s.first, result = s.second) }
        .combine(nodeSums.observe(id)) { ui, s -> ui.copy(sums = s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SmetaUi())

    init { refresh() }

    fun setQuery(q: String) { query.value = q }
    fun toggle(nodeId: Long) { expanded.update { if (nodeId in it) it - nodeId else it + nodeId } }
    fun expandAll() { expanded.value = tree.value.expandable }
    fun collapseAll() { expanded.value = emptySet() }
    fun addToDraft(n: NodeEntity, hajm: Double) { viewModelScope.launch { fakt.addToDraft(n.toQator(), hajm) } }
    fun removeFromDraft(qatorId: Long) { viewModelScope.launch { fakt.removeFromDraft(id, qatorId) } }

    fun refresh() {
        viewModelScope.launch { sync.value = true to null; sync.value = false to rows.sync(id) }
        viewModelScope.launch { nodeSums.refresh(id) }
    }
}

private class Group(val head: NodeEntity?, val rows: List<NodeEntity>)

/** Splits the visible list at every top-level node so each section header can stick while its rows scroll. */
private fun groups(list: List<NodeEntity>): List<Group> {
    val out = ArrayList<Group>()
    var head: NodeEntity? = null; var cur = ArrayList<NodeEntity>()
    for (x in list) {
        if (x.depth == 0 && x.isRz) {
            if (head != null || cur.isNotEmpty()) out += Group(head, cur)
            head = x; cur = ArrayList()
        } else cur += x
    }
    if (head != null || cur.isNotEmpty()) out += Group(head, cur)
    return out
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun SmetaBrowseScreen(onBack: () -> Unit, onDraft: (Long) -> Unit = {}, onJarvis: (Long) -> Unit = {}, vm: SmetaBrowseViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<NodeEntity?>(null) }
    val searching = ui.query.isNotBlank()
    val grouped = remember(ui.visible) { groups(ui.visible) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(
            ui.obyekt?.nom ?: stringResource(R.string.mod_smeta_native), onBack,
            actions = {
                IconButton(onClick = { onJarvis(vm.id) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.AutoAwesome, stringResource(R.string.ja_from_object)) }
                IconButton(onClick = vm::expandAll, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.UnfoldMore, stringResource(R.string.sm_expand_all)) }
                IconButton(onClick = vm::collapseAll, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.UnfoldLess, stringResource(R.string.sm_collapse_all)) }
            },
        )
        OutlinedTextField(
            value = ui.query, onValueChange = vm::setQuery, singleLine = true,
            placeholder = { Text(stringResource(R.string.p1_fakt_search)) },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            trailingIcon = { if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, stringResource(R.string.p5_clear)) } },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = TouchTarget),
        )
        PullToRefreshBox(isRefreshing = ui.syncing && ui.total > 0, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                ui.total == 0 && ui.syncing -> SkeletonList(5)
                ui.total == 0 -> when (ui.result) {
                    is SyncResult.Offline -> EmptyState(Icons.Outlined.AccountTree, stringResource(R.string.p1_fakt_offline_empty), null, stringResource(R.string.retry)) { vm.refresh() }
                    is SyncResult.Forbidden -> EmptyState(Icons.Filled.Warning, stringResource(R.string.p1_fakt_forbidden))
                    else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), null, stringResource(R.string.retry)) { vm.refresh() }
                }
                searching && ui.visible.isEmpty() -> EmptyState(Icons.Filled.Search, stringResource(R.string.p1_fakt_empty), stringResource(R.string.p5_smeta_search_hint))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp, 4.dp, 12.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    item(key = "top") { TopCard(ui) }
                    grouped.forEach { g ->
                        g.head?.let { h ->
                            stickyHeader(key = "h${h.id}") { RzRow(h, ui.texts[h.id] ?: NO_TEXTS, h.id in ui.expanded || searching, ui.rollups[h.id], ui.sums?.nodes?.get(h.id)) { vm.toggle(h.id) } }
                        }
                        items(g.rows, key = { it.id }, contentType = { if (it.isRz) 0 else if (it.isBl) 1 else 2 }) { n ->
                            when {
                                n.isRz -> RzRow(n, ui.texts[n.id] ?: NO_TEXTS, n.id in ui.expanded || searching, ui.rollups[n.id], ui.sums?.nodes?.get(n.id)) { vm.toggle(n.id) }
                                n.isBl -> BlRow(n, ui.texts[n.id] ?: NO_TEXTS, n.id in ui.expanded, ui.drafted[n.id], ui.sums?.nodes?.get(n.id), onToggle = { vm.toggle(n.id) }, onFakt = { editing = n })
                                else -> ResRow(n, ui.texts[n.id] ?: NO_TEXTS)
                            }
                        }
                    }
                }
            }
        }
        if (ui.drafted.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(pluralStringResource(R.plurals.p1_draft_bar, ui.drafted.size, ui.drafted.size), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                Button(onClick = { onDraft(vm.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_open)) }
            }
        }
    }
    editing?.let { n ->
        VolumeDialog(
            title = n.nom, kod = n.kod, unit = n.birlik, smeta = n.hajm, fakt = n.faktHajm, left = n.qoldiq, initial = ui.drafted[n.id]?.hajm,
            f2 = n.f2Hajm, almashtirilgan = n.almashtirilgan,
            onDismiss = { editing = null }, onConfirm = { v -> vm.addToDraft(n, v); editing = null },
            onRemove = if (ui.drafted.containsKey(n.id)) ({ vm.removeFromDraft(n.id); editing = null }) else null,
        )
    }
}

@Composable
private fun TopCard(ui: SmetaUi) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.m_object_value), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            // Object value: the server package, QQS-inclusive first. Row amounts below are markup-free server values, labelled as such.
            MoneyDual(displayMoney(ui.money?.smeta, ui.obyekt?.jami), showVat = true, hint = true)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                UpdatedLine(ui.updatedAt, Modifier.weight(1f))
                InfoTip(stringResource(R.string.sm_tree_tip_t), stringResource(R.string.sm_tree_tip_b))
            }
            if (ui.sums != null && !ui.sums.hasMarkup) Text(stringResource(R.string.sm_ns_no_markup), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(bottom = 4.dp))
            Text(stringResource(R.string.sm_counts, ui.visible.size, ui.total, ui.blCount), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            VolumeLegend()
        }
    }
}

/** Section row (RZ): chevron, UPPERCASE name, work count and the section's fact / F-2 progress (server row amounts). Sticky at the top level. */
@Composable
private fun RzRow(n: NodeEntity, t: NodeTexts, open: Boolean, r: Rollup?, sums: uz.anncorp.smeta.core.data.NodeSums?, onToggle: () -> Unit) {
    Surface(
        onClick = onToggle, color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().padding(start = (n.depth * 10).dp).heightIn(min = TouchTarget),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t.nom, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (r != null) {
                Text(pluralStringResource(R.plurals.sm_works, r.blCount, r.blCount), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                PercentBar(stringResource(R.string.p1_card_fakt), r.factPercent, ChartColors.fact, barHeight = 5.dp)
                Spacer(Modifier.height(4.dp))
                PercentBar(stringResource(R.string.p1_card_f2), r.f2Percent, ChartColors.f2, barHeight = 5.dp)
            }
            if (sums != null && sums.smeta.qqsBilan != null) NodeSumsBlock(sums)
        }
    }
}

/** Work row (BL): code, UPPERCASE name, unit, smeta / fakt / F-2 / left volumes, stacked bar, markup-free amount and a direct fact-entry button. */
@Composable
private fun BlRow(n: NodeEntity, t: NodeTexts, open: Boolean, draft: DraftEntity?, sums: uz.anncorp.smeta.core.data.NodeSums?, onToggle: () -> Unit, onFakt: () -> Unit) {
    Surface(
        onClick = onToggle, enabled = n.hasChildren, color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().padding(start = (n.depth * 10).dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    n.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                    Text(t.nom, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 5, overflow = TextOverflow.Ellipsis)
                }
                n.birlik?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp)) }
                if (n.hasChildren) Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth()) {
                VolumeCell(stringResource(R.string.p1_row_smeta), t.v1, Modifier.weight(1f))
                VolumeCell(stringResource(R.string.p1_row_fakt), t.v2, Modifier.weight(1f))
                VolumeCell(stringResource(R.string.p1_card_f2_short), t.v3, Modifier.weight(1f))
                VolumeCell(stringResource(R.string.p1_row_left), t.v4, Modifier.weight(1f), bad = (n.qoldiq ?: 0.0) < 0)
            }
            volumeSplit(n.hajm, n.faktHajm, n.f2Hajm, n.almashtirilgan)?.let { sp ->
                Spacer(Modifier.height(8.dp))
                StackedVolumeBar(sp.f2, sp.factOnly, sp.open, sp.over, barHeight = 8.dp)
            }
            Spacer(Modifier.height(6.dp))
            if (sums != null && sums.smeta.qqsBilan != null) NodeSumsBlock(sums)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (sums != null && sums.smeta.qqsBilan != null) { /* the three forms are shown above; the button stays on this row */ Spacer(Modifier.weight(1f)) }
                else if (n.summa == null && (n.hajm ?: 0.0) > 0.0) {
                    Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.p5_row_unpriced), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
                } else {
                    Text(stringResource(R.string.sm_sum_plain), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(6.dp))
                    Text(t.sum ?: "\u2014", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                }
                if (draft != null) {
                    Icon(Icons.Filled.CheckCircle, null, tint = if (draft.hajm < 0.0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary, modifier = Modifier.size(16.dp))
                    Text(formatVolumeSigned(draft.hajm), style = MaterialTheme.typography.labelLarge, color = if (draft.hajm < 0.0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(start = 4.dp, end = 8.dp))
                }
                Button(onClick = onFakt, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp), modifier = Modifier.heightIn(min = 48.dp)) {
                    Icon(Icons.Filled.Create, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.p5_enter_fakt_short), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                }
            }
        }
    }
}

/** Resource row (RS / MAT / OB) under its work: category chip, code, name, norm, quantity, unit, unit price and amount (markup-free). */
@Composable
private fun ResRow(n: NodeEntity, t: NodeTexts) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLowest, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().padding(start = (n.depth * 10).dp)) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Surface(shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                    Text(resLabel(n), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    n.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary) }
                    Text(t.nom, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth()) {
                VolumeCell(stringResource(R.string.sm_norm), t.v1, Modifier.weight(1f))
                VolumeCell(stringResource(R.string.sm_qty) + n.birlik?.let { " ($it)" }.orEmpty(), t.v2, Modifier.weight(1.2f))
                VolumeCell(stringResource(R.string.sm_price), t.v3, Modifier.weight(1.3f))
                VolumeCell(stringResource(R.string.sm_amount), t.v4, Modifier.weight(1.4f))
            }
        }
    }
}

@Composable
private fun resLabel(n: NodeEntity): String = n.kat?.takeIf { it.isNotBlank() } ?: when (n.tur) { "mat" -> "MAT"; "ob" -> "OB"; else -> "RS" }

@Composable
private fun VolumeCell(label: String, value: String, modifier: Modifier = Modifier, bad: Boolean = false) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = if (bad) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface, maxLines = 1)
    }
}

/** Legend shared by the stacked bars (F-2 accepted / done but not accepted / open). */
@Composable
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
fun VolumeLegend(modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        LegendDot(ChartColors.f2, stringResource(R.string.p1_card_f2_short))
        LegendDot(ChartColors.fact, stringResource(R.string.p5_leg_done_not_accepted))
        LegendDot(ChartColors.track, stringResource(R.string.p5_leg_open))
    }
}

/** Smeta / fakt / F-2 amounts of a node, QQS bilan first (server numbers). Unknown forms are a dash, never 0. */
@Composable
private fun NodeSumsBlock(s: uz.anncorp.smeta.core.data.NodeSums) {
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        FormsLine(stringResource(R.string.sm_ns_smeta), s.smeta, strong = true)
        if (s.fakt.ustamasiz != null || s.fakt.qqsBilan != null) FormsLine(stringResource(R.string.p1_card_fakt), s.fakt)
        if (s.f2.ustamasiz != null || s.f2.qqsBilan != null) FormsLine(stringResource(R.string.p1_card_f2_short), s.f2)
    }
}

@Composable
private fun FormsLine(label: String, f: uz.anncorp.smeta.core.data.Forms, strong: Boolean = false) {
    Column {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(label + " - " + stringResource(R.string.m_vat_incl), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(f.qqsText, style = if (strong) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        }
        Row {
            Text(stringResource(R.string.m_markup), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(f.ustamaliText, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
        Row {
            Text(stringResource(R.string.m_plain), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(f.ustamasizText, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}