package uz.anncorp.smeta.feature.resurs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.CAT_OTHER
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.ResursCategory
import uz.anncorp.smeta.core.data.ResursLine
import uz.anncorp.smeta.core.data.ResursRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.filterResources
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.core.data.formatVolumeSigned
import uz.anncorp.smeta.core.data.openResources
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class ResursUi(
    val name: String = "",
    val cats: List<ResursCategory>? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
)

@HiltViewModel
class ResursViewModel @Inject constructor(handle: SavedStateHandle, objects: ObjectsRepository, private val repo: ResursRepository) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())

    val state: StateFlow<ResursUi> = combine(repo.observe(id), objects.observeOne(id), repo.lastUpdated(id), sync) { c, o, ts, s ->
        ResursUi(o?.nom.orEmpty(), c, s.syncing, s.result, ts)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ResursUi())

    init { refresh() }

    fun refresh() { viewModelScope.launch { sync.value = Sync(true, null); sync.value = Sync(false, repo.refresh(id)) } }
}

/** Short category title: the code is the web's own (labour / machines / materials ...), shown with a plain-language name. */
@Composable
private fun categoryName(cat: String): String = stringResource(
    when (cat) {
        "ЧЕЛ" -> R.string.p8_rv_cat_lab
        "МАШ" -> R.string.p8_rv_cat_mach
        "МАТ" -> R.string.p8_rv_cat_mat
        "ОБ" -> R.string.p8_rv_cat_eq
        "КАБ" -> R.string.p8_rv_cat_cable
        "М/К" -> R.string.p8_rv_cat_metal
        else -> R.string.p8_rv_cat_other
    },
)

/** Resource statement of an object (labour, machines, materials, equipment...): estimate / F-2 / left quantities, same grouping as the web statement. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun ResursScreen(onBack: () -> Unit, vm: ResursViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var onlyOpen by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.p8_rv_title) + if (ui.name.isNotBlank()) " · " + ui.name else "", onBack)
        val all = ui.cats
        when {
            all == null && ui.syncing -> SkeletonList(4)
            all == null -> when (ui.result) {
                is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.f2_forbidden), stringResource(R.string.f2_forbidden_body))
                else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            }
            all.isEmpty() -> EmptyState(Icons.Outlined.Description, stringResource(R.string.p8_rv_empty), stringResource(R.string.p8_rv_empty_hint))
            else -> {
                val base = if (onlyOpen) openResources(all) else all
                val shown = filterResources(base, query)
                PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item {
                            Text(stringResource(R.string.p8_rv_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            UpdatedLine(ui.updatedAt, Modifier.padding(top = 4.dp))
                        }
                        item {
                            ChipRow {
                                FilterChip(selected = !onlyOpen, onClick = { onlyOpen = false }, label = { Text(stringResource(R.string.docs_filter_all)) })
                                FilterChip(selected = onlyOpen, onClick = { onlyOpen = true }, label = { Text(stringResource(R.string.p8_rv_open_only)) })
                            }
                        }
                        item { OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.p8_rv_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                        if (shown.isEmpty()) item { Text(stringResource(R.string.p8_reg_no_match), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        shown.forEach { c ->
                            item(key = "h" + c.cat) { CategoryHeader(c) }
                            items(c.lines, key = { c.cat + "|" + it.name + "|" + it.unit.orEmpty() }) { l -> LineCard(l) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryHeader(c: ResursCategory) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(
            (if (c.cat == CAT_OTHER) "" else c.cat + " — ") + categoryName(c.cat) + " (" + pluralStringResource(R.plurals.p8_rv_resources, c.lines.size, c.lines.size) + ")",
            style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            stringResource(R.string.p8_rv_cat_sums, formatMoneyShort(c.estSum), formatMoneyShort(c.f2Sum), formatMoneyShort(c.leftSum)),
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LineCard(l: ResursLine) {
    WorkCard(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(l.name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 3)
            Text(listOfNotNull(l.code, l.unit).joinToString("  ·  "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Qty(stringResource(R.string.p8_rv_est), l.estQty, Modifier.weight(1f))
                Qty(stringResource(R.string.p1_card_f2), l.f2Qty, Modifier.weight(1f))
                Qty(stringResource(R.string.p8_rv_left), l.leftQty, Modifier.weight(1f), strong = true)
            }
            if (l.unpricedRows > 0) Text(stringResource(R.string.p8_rv_unpriced, l.unpricedRows), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
        }
    }
}

@Composable
private fun Qty(label: String, v: Double, modifier: Modifier, strong: Boolean = false) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(formatVolumeSigned(v), style = if (strong) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium, color = if (v < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}
