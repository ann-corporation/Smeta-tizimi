package uz.anncorp.smeta.feature.work

import android.content.res.Resources
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.qurai.ui.screens.QFilterOption
import uz.anncorp.qurai.ui.screens.QObjectRow
import uz.anncorp.qurai.ui.screens.QObjectTree
import uz.anncorp.qurai.ui.screens.QTreeFilterTexts
import uz.anncorp.qurai.ui.screens.QTreeFilters
import uz.anncorp.qurai.ui.screens.QTreeGroup
import uz.anncorp.qurai.ui.screens.QTreeLeaf
import uz.anncorp.qurai.ui.screens.QTreeRow
import uz.anncorp.qurai.ui.screens.QTreeTexts
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.GroupRow
import uz.anncorp.smeta.core.data.LeafRow
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.TreeRow
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.UpdatedLine

internal fun holatLabel(res: Resources, h: String): String = when (h) {
    "faol" -> res.getString(R.string.ier_h_faol); "tuxtatilgan" -> res.getString(R.string.ier_h_tuxtatilgan)
    "yakunlangan" -> res.getString(R.string.ier_h_yakunlangan); "bekor" -> res.getString(R.string.ier_h_bekor); else -> h
}

/** Domain rows -> display rows: the money was summed from the server's per-object packages (QQS bilan first); unknown stays null = a dash. */
internal fun toQ(res: Resources, rows: List<TreeRow>, selectedId: Long?): List<QTreeRow> = rows.map { r ->
    when (r) {
        is GroupRow -> QTreeGroup(
            r.key, r.depth, r.level, r.title ?: res.getString(if (r.level == 0) R.string.ier_no_loyiha else R.string.ier_no_shartnoma),
            r.holat?.takeIf { it.isNotBlank() }?.let { holatLabel(res, it) }, res.getString(R.string.ier_count, r.objects), r.open,
            r.agg.qqsBilan?.let(::formatMoneyShort), r.agg.ustamali?.let(::formatMoneyShort), r.agg.ustamasiz?.let(::formatMoneyShort),
            if (r.agg.partial) res.getString(R.string.ier_partial, r.agg.missing) else null,
        )
        is LeafRow -> r.leaf.let { l ->
            QTreeLeaf(
                r.key, r.depth,
                QObjectRow(l.id, l.name, l.type, l.rows, l.unpriced, l.qqsBilan?.let(::formatMoneyShort), l.ustamali?.let(::formatMoneyShort), l.ustamasiz?.let(::formatMoneyShort), l.factPct?.let { formatPercent(it) }, l.f2Pct?.let { formatPercent(it) }),
                l.id == selectedId,
            )
        }
    }
}

/**
 * Objects of the current workplace as Loyiha > Shartnoma > Obyekt (collapsible groups with counts and sums, search that keeps the tree,
 * loyiha / shartnoma / holat filters). [pickForFact] only changes the hint line; the tap target is decided by the caller.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectsScreen(onOpen: (Long) -> Unit, pickForFact: Boolean = false, vm: ObjectsViewModel = hiltViewModel(key = if (pickForFact) "pick" else "browse")) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val res = LocalContext.current.resources
    val noL = stringResource(R.string.ier_no_loyiha); val noS = stringResource(R.string.ier_no_shartnoma)
    Column(Modifier.fillMaxSize()) {
        val lOpts = ui.loyihaOptions.map { QFilterOption(it.id, it.title ?: noL) }
        val sOpts = ui.shartnomaOptions.map { QFilterOption(it.id, it.title ?: noS) }
        val stOpts = ui.statuses.mapIndexed { i, s -> QFilterOption(i.toLong(), holatLabel(res, s)) }
        QTreeFilters(
            ui.query, vm::setQuery,
            lOpts.firstOrNull { it.id == ui.scope.loyihaId }, lOpts, { o -> vm.setScope { it.copy(loyihaId = o.id, shartnomaId = null) } },
            sOpts.firstOrNull { it.id == ui.scope.shartnomaId }, sOpts, { o -> vm.setScope { it.copy(shartnomaId = o.id) } },
            stOpts.firstOrNull { ui.statuses.getOrNull(it.id?.toInt() ?: -1) == ui.holat }, stOpts, { o -> vm.setHolat(o.id?.toInt()?.let { ui.statuses.getOrNull(it) }) },
            onExpandAll = { vm.expandAll(true) }, onCollapseAll = { vm.expandAll(false) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            texts = QTreeFilterTexts(
                stringResource(R.string.ier_search), stringResource(R.string.ier_loyiha), stringResource(R.string.ier_shartnoma), stringResource(R.string.ier_status),
                stringResource(R.string.ier_all), stringResource(R.string.ier_expand_all), stringResource(R.string.ier_collapse_all),
            ),
            showStructureFilters = ui.hasHierarchy,
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            UpdatedLine(ui.updatedAt, Modifier.weight(1f))
            if (pickForFact) Text(stringResource(R.string.p1_pick_object), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
        if (!ui.hasHierarchy && ui.items.isNotEmpty()) Text(stringResource(R.string.ier_flat_note), Modifier.padding(horizontal = 20.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        PullToRefreshBox(isRefreshing = ui.refreshing, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
                ui.loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                ui.items.isEmpty() || ui.rows.isEmpty() -> EmptyOrError(ui, vm)
                else -> {
                    val q = remember(ui.rows, ui.currentId, res) { toQ(res, ui.rows, ui.currentId) }
                    QObjectTree(
                        q, vm::toggle, { vm.picked(it); onOpen(it) }, Modifier.fillMaxSize(), compact = true,
                        contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp),
                        texts = QTreeTexts(
                            colObject = stringResource(R.string.ier_obyekt), empty = stringResource(R.string.ier_empty),
                            rowsLabel = { res.getQuantityString(R.plurals.p1_rows, it, it) }, unpricedLabel = { res.getQuantityString(R.plurals.p1_unpriced, it, it) },
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyOrError(ui: ObjectsUi, vm: ObjectsViewModel) {
    val r = ui.result
    val filtered = ui.query.isNotBlank() || ui.scope.loyihaId != null || ui.scope.shartnomaId != null || ui.holat != null
    when {
        ui.items.isNotEmpty() && filtered -> CenterMessage(Icons.Filled.Search, stringResource(R.string.p1_objects_empty_search))
        r is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.p1_objects_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
        r is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_forbidden))
        r is SyncResult.Failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_error), stringResource(R.string.err_server), stringResource(R.string.retry)) { vm.refresh() }
        else -> CenterMessage(null, stringResource(R.string.p1_objects_empty), stringResource(R.string.p1_objects_empty_hint))
    }
}
