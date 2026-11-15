package uz.anncorp.smeta.feature.work

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard

/** Objects of the current workplace. [pickForFact] only changes the hint line; the tap target is decided by the caller. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectsScreen(onOpen: (Long) -> Unit, pickForFact: Boolean = false, onOpenWeb: ((String) -> Unit)? = null, vm: ObjectsViewModel = hiltViewModel(key = if (pickForFact) "pick" else "browse")) {
    val ui by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = ui.query, onValueChange = vm::setQuery, singleLine = true,
            placeholder = { Text(stringResource(R.string.p1_objects_search)) },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            trailingIcon = { if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, null) } },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = TouchTarget),
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            UpdatedLine(ui.updatedAt, Modifier.weight(1f))
            if (pickForFact) Text(stringResource(R.string.p1_pick_object), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
        PullToRefreshBox(isRefreshing = ui.refreshing, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
                ui.loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                ui.items.isEmpty() -> EmptyOrError(ui, vm, onOpenWeb)
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(ui.items, key = { it.id }) { ObjectRow(it, ui.money[it.id]) { onOpen(it.id) } }
                }
            }
        }
    }
}

@Composable
private fun EmptyOrError(ui: ObjectsUi, vm: ObjectsViewModel, onOpenWeb: ((String) -> Unit)?) {
    val r = ui.result
    when {
        ui.query.isNotBlank() -> CenterMessage(Icons.Filled.Search, stringResource(R.string.p1_objects_empty_search))
        r is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.p1_objects_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
        r is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_forbidden))
        r is SyncResult.Failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_error), stringResource(R.string.err_server), stringResource(R.string.retry)) { vm.refresh() }
        else -> if (onOpenWeb != null) CenterMessage(null, stringResource(R.string.hub_first_object), stringResource(R.string.hub_first_object_hint), stringResource(R.string.hub_first_object_action)) { onOpenWeb("/admin/obyektlar") }
        else CenterMessage(null, stringResource(R.string.p1_objects_empty), stringResource(R.string.p1_objects_empty_hint))
    }
}

@Composable
private fun ObjectRow(o: ObyektEntity, money: ObjectMoney?, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(16.dp)) {
            Text(o.nom, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
            o.tur?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Spacer(Modifier.height(8.dp))
            // Owner rule: QQS-inclusive value first, and every sum both with and without markup (server packages, never guessed here).
            MoneyDual(displayMoney(money?.smeta, o.jami), showVat = true, short = true)
            o.qatorSoni?.let {
                Spacer(Modifier.height(4.dp))
                Text(pluralStringResource(R.plurals.p1_rows, it, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if ((o.narxsiz ?: 0) > 0) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.width(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(pluralStringResource(R.plurals.p1_unpriced, o.narxsiz ?: 0, o.narxsiz ?: 0), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }
    }
}


