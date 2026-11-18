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
import androidx.compose.ui.platform.LocalContext
import uz.anncorp.qurai.ui.components.QSearchField
import uz.anncorp.qurai.ui.screens.QObjectList
import uz.anncorp.qurai.ui.screens.QObjectRow
import uz.anncorp.qurai.ui.screens.QObjectTexts
import uz.anncorp.smeta.core.data.formatMoneyShort

/** Objects of the current workplace. [pickForFact] only changes the hint line; the tap target is decided by the caller. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectsScreen(onOpen: (Long) -> Unit, pickForFact: Boolean = false, vm: ObjectsViewModel = hiltViewModel(key = if (pickForFact) "pick" else "browse")) {
    val ui by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        QSearchField(ui.query, vm::setQuery, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), placeholder = stringResource(R.string.p1_objects_search))
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            UpdatedLine(ui.updatedAt, Modifier.weight(1f))
            if (pickForFact) Text(stringResource(R.string.p1_pick_object), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
        PullToRefreshBox(isRefreshing = ui.refreshing, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
                ui.loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                ui.items.isEmpty() -> EmptyOrError(ui, vm)
                else -> {
                    val res = LocalContext.current.resources
                    QObjectList(
                        ui.items.map { o ->
                            val d = displayMoney(ui.money[o.id]?.smeta, o.jami)
                            QObjectRow(o.id, o.nom, o.tur, o.qatorSoni, o.narxsiz, formatMoneyShort(d.vatIncl), formatMoneyShort(d.withMarkup), formatMoneyShort(d.withoutMarkup))
                        },
                        { onOpen(it.id) }, Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 96.dp),
                        texts = QObjectTexts(rowsLabel = { res.getQuantityString(R.plurals.p1_rows, it, it) }, unpricedLabel = { res.getQuantityString(R.plurals.p1_unpriced, it, it) }),
                    )
                }            }
        }
    }
}

@Composable
private fun EmptyOrError(ui: ObjectsUi, vm: ObjectsViewModel) {
    val r = ui.result
    when {
        ui.query.isNotBlank() -> CenterMessage(Icons.Filled.Search, stringResource(R.string.p1_objects_empty_search))
        r is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.p1_objects_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
        r is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_forbidden))
        r is SyncResult.Failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_error), stringResource(R.string.err_server), stringResource(R.string.retry)) { vm.refresh() }
        else -> CenterMessage(null, stringResource(R.string.p1_objects_empty), stringResource(R.string.p1_objects_empty_hint))
    }
}
