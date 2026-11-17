package uz.anncorp.smeta.feature.f2

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.F2RegistryRepository
import uz.anncorp.smeta.core.data.MoneyRepository
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.RegistryFilter
import uz.anncorp.smeta.core.data.RegistryRow
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.buildRegistry
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.filterRegistry
import uz.anncorp.smeta.core.data.registryTotals
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.LegendDot
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class RegistryUi(
    val rows: List<RegistryRow>? = null,
    val money: Map<Long, ObjectMoney> = emptyMap(),
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class F2RegistryViewModel @Inject constructor(
    private val repo: F2RegistryRepository, private val objects: ObjectsRepository, private val money: MoneyRepository, private val ctx: WorkContext,
) : ViewModel() {
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())
    private val company = ctx.current

    val state: StateFlow<RegistryUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        money.observeAll(),
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) },
        sync,
    ) { acts, objs, m, ts, s ->
        RegistryUi(acts?.let { buildRegistry(it, objs.associate { o -> o.id to o.nom }) }, m, s.syncing, s.result, ts, false)
    }.combine(company) { ui, w -> ui.copy(noCompany = w == null) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), RegistryUi())

    init { viewModelScope.launch { company.collect { if (it != null) refresh() } } }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.value = Sync(true, null)
            objects.refresh(w.companyId)
            // The percentage and the accepted-F-2 package are the boss-panel numbers; a user without that right simply sees dashes.
            launch { money.refreshCompany(w.companyId) }
            sync.value = Sync(false, repo.refresh(w.companyId))
        }
    }
}

@Composable
private fun filterLabel(f: RegistryFilter): String = stringResource(
    when (f) {
        RegistryFilter.ALL -> R.string.docs_filter_all
        RegistryFilter.WITH_DRAFT -> R.string.p8_reg_f_draft
        RegistryFilter.IN_FLOW -> R.string.p8_reg_f_flow
        RegistryFilter.NO_APPROVED -> R.string.p8_reg_f_none
        RegistryFilter.PROBLEMS -> R.string.p8_reg_f_problems
    },
)

/** Company-wide F-2 registry: one line per object (approved / draft / in progress, the server's F-2 percent), filters, open the object's F-2 list or document. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun F2RegistryScreen(
    onBack: () -> Unit, onOpenF2: (Long) -> Unit, onDocs: (Long) -> Unit, onNakop: (Long) -> Unit, vm: F2RegistryViewModel = hiltViewModel(),
) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(RegistryFilter.ALL) }
    var query by rememberSaveable { mutableStateOf("") }
    var openId by rememberSaveable { mutableStateOf<Long?>(null) }
    val all = ui.rows
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.p8_reg_title), onBack)
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            all == null && ui.syncing -> SkeletonList(4)
            all == null -> when (ui.result) {
                is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.f2_forbidden), stringResource(R.string.f2_forbidden_body))
                else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            }
            all.isEmpty() -> EmptyState(Icons.Outlined.Description, stringResource(R.string.p8_reg_empty), stringResource(R.string.f2_empty_hint))
            else -> {
                val shown = filterRegistry(all, filter, query)
                PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item { RegistrySummary(all, ui.updatedAt) }
                        item {
                            ChipRow {
                                RegistryFilter.entries.forEach { f ->
                                    FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(filterLabel(f) + " (" + filterRegistry(all, f, query).size + ")") })
                                }
                            }
                        }
                        item { OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.p8_reg_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                        if (shown.isEmpty()) item { Text(stringResource(R.string.p8_reg_no_match), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        items(shown, key = { it.objectId }) { r -> RegistryCard(r, ui.money[r.objectId]) { openId = r.objectId } }
                    }
                }
            }
        }
    }
    val sel = all?.firstOrNull { it.objectId == openId }
    if (sel != null) {
        ModalBottomSheet(onDismissRequest = { openId = null }) {
            RegistrySheet(sel, ui.money[sel.objectId], onF2 = { openId = null; onOpenF2(sel.objectId) }, onDocs = { openId = null; onDocs(sel.objectId) }, onNakop = { openId = null; onNakop(sel.objectId) })
        }
    }
}

@Composable
private fun RegistrySummary(rows: List<RegistryRow>, updatedAt: Long?) {
    val t = registryTotals(rows)
    WorkCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(pluralStringResource(R.plurals.p8_reg_objects, t.objects, t.objects), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            LegendDot(ChartColors.fact, stringResource(R.string.p8_reg_approved) + "  " + t.approved)
            LegendDot(MaterialTheme.colorScheme.onSurfaceVariant, stringResource(R.string.f2_st_draft) + "  " + t.draft)
            LegendDot(ChartColors.warn, stringResource(R.string.p8_reg_flow) + "  " + t.inFlow)
            LegendDot(ChartColors.bad, stringResource(R.string.f2_st_rejected) + "  " + t.rejected)
            UpdatedLine(updatedAt, Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun RegistryCard(r: RegistryRow, money: ObjectMoney?, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Count(stringResource(R.string.p8_reg_approved), r.approved, ChartColors.fact)
                Count(stringResource(R.string.f2_st_draft), r.draft, MaterialTheme.colorScheme.onSurfaceVariant)
                Count(stringResource(R.string.p8_reg_flow), r.inFlow, ChartColors.warn)
                if (r.rejected > 0) Count(stringResource(R.string.f2_st_rejected), r.rejected, ChartColors.bad)
            }
            PercentBar(stringResource(R.string.p8_reg_percent), money?.f2Pct, ChartColors.f2)
            if (r.unpriced > 0 || r.hasDiff) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(13.dp))
                    if (r.unpriced > 0) Text(stringResource(R.string.f2_flag_unpriced, r.unpriced), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                    if (r.hasDiff) Text(stringResource(R.string.f2_flag_diff), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }
    }
}

@Composable
private fun Count(label: String, n: Int, color: androidx.compose.ui.graphics.Color) {
    Column {
        Text(n.toString(), style = MaterialTheme.typography.titleMedium, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RegistrySheet(r: RegistryRow, money: ObjectMoney?, onF2: () -> Unit, onDocs: () -> Unit, onNakop: () -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(r.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(listOfNotNull(
            stringResource(R.string.p8_reg_approved) + " " + r.approved, stringResource(R.string.f2_st_draft) + " " + r.draft, stringResource(R.string.p8_reg_flow) + " " + r.inFlow,
            r.lastApprovedMonth?.let { stringResource(R.string.p8_reg_last, f2MonthLabel(it).orEmpty()) },
        ).joinToString("  ·  "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        PercentBar(stringResource(R.string.p8_reg_percent), money?.f2Pct, ChartColors.f2)
        Text(stringResource(R.string.p1_card_f2), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        MoneyDual(displayMoney(money?.f2, null), showVat = true, short = true)
        Spacer(Modifier.height(4.dp))
        Button(onClick = onF2, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_reg_open_list)) }
        OutlinedButton(onClick = onDocs, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.docs_f2_button)) }
        OutlinedButton(onClick = onNakop, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_nk_open)) }
        Spacer(Modifier.width(1.dp))
    }
}
