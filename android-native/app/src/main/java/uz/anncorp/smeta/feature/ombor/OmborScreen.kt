package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.feature.work.BannerViewModel

private fun OmborScope.label(all: String): String = when (this) {
    OmborScope.AllObjects -> all
    is OmborScope.Obyekt -> nom
    is OmborScope.Central -> nom
}

/** Bottom-bar body of the warehouse module: stock list with search + scan, and the receive / issue actions. */
@Composable
fun OmborScreen(onOutbox: () -> Unit, vm: OmborViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    var scanning by rememberSaveable { mutableStateOf(false) }
    var picking by rememberSaveable { mutableStateOf(false) }
    var entryOp by rememberSaveable { mutableStateOf<String?>(null) }
    var preset by remember { mutableStateOf<StockRow?>(null) }
    var tab by rememberSaveable { mutableStateOf(0) }
    var item by remember { mutableStateOf<StockRow?>(null) }
    val allLabel = stringResource(R.string.ombor_scope_all)

    Column(Modifier.fillMaxSize()) {
        OutboxBanner(b, onOutbox)
        OutlinedTextField(
            value = ui.query, onValueChange = vm::setQuery, singleLine = true,
            placeholder = { Text(stringResource(R.string.ombor_search_hint)) },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            trailingIcon = {
                Row {
                    if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, stringResource(R.string.ombor_clear)) }
                    IconButton(onClick = { scanning = true }) { Icon(Icons.Filled.QrCodeScanner, stringResource(R.string.ombor_scan)) }
                }
            },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = TouchTarget),
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            AssistChip(
                onClick = { picking = true },
                label = { Text(stringResource(R.string.ombor_scope_label, ui.scope.label(allLabel)), maxLines = 1) },
                trailingIcon = { Icon(Icons.Filled.ArrowDropDown, null) },
                modifier = Modifier.weight(1f, fill = false).heightIn(min = 40.dp),
            )
            Box(Modifier.weight(1f))
            if (ui.syncing) CircularProgressIndicator(Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(R.string.ombor_tab_stock, R.string.ombor_tab_in, R.string.ombor_tab_out, R.string.t14_tab_report).forEachIndexed { i, res ->
                FilterChip(selected = tab == i, onClick = { tab = i }, label = { Text(stringResource(res)) })
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                pluralStringResource(R.plurals.ombor_materials, ui.rows.size, ui.rows.size), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
            )
            UpdatedLine(ui.updatedAt)
        }
        if (ui.computedBalance && tab == 0) Text(stringResource(R.string.ombor_computed_note), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(horizontal = 20.dp))
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                tab == 3 -> OmborReportPanel((ui.scope as? OmborScope.Central)?.id ?: ui.warehouses.firstOrNull()?.id, ui.query)
                tab != 0 -> MovesList(filterMoves(ui.moves, tab == 1, ui.scope, ui.query), ui.objectNames, showObject = ui.scope !is OmborScope.Obyekt)
                ui.rows.isEmpty() && ui.syncing && ui.updatedAt == null -> CenterMessage(null, stringResource(R.string.ombor_loading))
                ui.rows.isEmpty() && ui.updatedAt == null -> when (ui.result) {
                    is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.ombor_offline_empty), null, stringResource(R.string.retry)) { vm.refresh() }
                    is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.ombor_forbidden))
                    else -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.err_server), null, stringResource(R.string.retry)) { vm.refresh() }
                }
                ui.rows.isEmpty() -> CenterMessage(Icons.Filled.Search, stringResource(if (ui.query.isBlank()) R.string.ombor_empty else R.string.ombor_empty_search))
                else -> LazyColumn(
                    Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(ui.rows, key = { "${it.obyektId}|${it.nomi}|${it.birligi}" }) { row ->
                        StockCard(row, ui.objectNames[row.obyektId], showObject = ui.scope is OmborScope.AllObjects, onClick = { item = row })
                    }
                }
            }
        }
        // The report tab needs the room: no command bar / action buttons there.
        if (ui.access.write && tab != 3) CommandBar(ui, vm)
        if (ui.access.write && tab != 3) {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { preset = null; entryOp = OmborOp.RECEIVE.name }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_btn_receive)) }
                    OutlinedButton(onClick = { preset = null; entryOp = OmborOp.ISSUE.name }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_btn_issue)) }
                }
            }
        }
    }

    item?.let { row ->
        ItemSheet(
            row, ui.objectNames[row.obyektId], materialHistory(ui.moves, row.nomi, row.birligi, row.obyektId), ui.objectNames, ui.access.write,
            onReceive = { preset = row; entryOp = OmborOp.RECEIVE.name; item = null }, onIssue = { preset = row; entryOp = OmborOp.ISSUE.name; item = null }, onDismiss = { item = null },
        )
    }
    ui.cmd.question?.let { q -> QuestionDialog(q, ui.cmd.working, onAnswer = vm::answerQuestion, onDismiss = vm::dismissCommand) }
    ui.cmd.preview?.let { p -> CommandPreviewDialog(p, ui, vm, onEdit = { op, row -> preset = row; entryOp = op.name }) }
    if (scanning) ScanDialog(onResult = { vm.setQuery(it); scanning = false }, onDismiss = { scanning = false })
    if (picking) ScopePicker(ui, allLabel, onPick = { vm.setScope(it); picking = false }, onDismiss = { picking = false })
    entryOp?.let { name ->
        OmborEntryDialog(
            op = OmborOp.valueOf(name), ui = ui, preset = preset, vm = vm,
            onDismiss = { entryOp = null; preset = null },
        )
    }
}

@Composable
private fun StockCard(row: StockRow, objectName: String?, showObject: Boolean, onClick: (() -> Unit)?) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(row.nomi, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 3)
                if (showObject && objectName != null) Text(objectName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                val last = formatMovement(row.oxirgi)
                Text(
                    if (last != null) stringResource(R.string.ombor_last_movement, last) else stringResource(R.string.ombor_no_movement),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 12.dp)) {
                val neg = (row.qoldiq ?: 0.0) < 0
                Text(formatQty(row.qoldiq), style = MaterialTheme.typography.titleMedium, color = if (neg) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                if (row.birligi.isNotBlank()) Text(uz.anncorp.smeta.core.data.displayUnit(row.birligi), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ScopePicker(ui: OmborUi, allLabel: String, onPick: (OmborScope) -> Unit, onDismiss: () -> Unit) {
    val items = buildList {
        add(PickItem(allLabel, null, OmborScope.AllObjects))
        ui.warehouses.forEach { add(PickItem(it.nomi, stringResource(R.string.ombor_central_tag), OmborScope.Central(it.id, it.nomi))) }
        ui.objects.forEach { add(PickItem(it.nom, null, OmborScope.Obyekt(it.id, it.nom))) }
    }
    PickerDialog(stringResource(R.string.ombor_scope_pick), items, onPick, onDismiss)
}
