package uz.anncorp.smeta.feature.qarzdor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import uz.anncorp.smeta.core.data.DebtFilter
import uz.anncorp.smeta.core.data.DebtLine
import uz.anncorp.smeta.core.data.QarzdorRepository
import uz.anncorp.smeta.core.data.RahbarAging
import uz.anncorp.smeta.core.data.RahbarObject
import uz.anncorp.smeta.core.data.RahbarRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.debtTotal
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.filterDebts
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class QarzdorUi(
    val lines: List<DebtLine>? = null,
    val aging: RahbarAging? = null,
    val objects: Map<Long, RahbarObject> = emptyMap(),
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class QarzdorViewModel @Inject constructor(private val repo: QarzdorRepository, private val rahbar: RahbarRepository, private val ctx: WorkContext) : ViewModel() {
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())
    private val company = ctx.current

    val state: StateFlow<QarzdorUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else rahbar.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) },
        sync, company,
    ) { lines, panel, ts, s, w ->
        QarzdorUi(lines, panel?.cards?.aging, panel?.objects.orEmpty().associateBy { it.id }, s.syncing, s.result, ts, w == null)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), QarzdorUi())

    init { viewModelScope.launch { company.collect { if (it != null) refresh() } } }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.value = Sync(true, null)
            launch { rahbar.refresh(w.companyId) }
            sync.value = Sync(false, repo.refresh(w.companyId))
        }
    }
}

@Composable
private fun filterLabel(f: DebtFilter): String = stringResource(
    when (f) { DebtFilter.OWED -> R.string.p8_dq_f_owed; DebtFilter.ALL -> R.string.docs_filter_all; DebtFilter.NO_PAYMENT -> R.string.p8_dq_f_nopay },
)

/** Debtors drill-down: the customers' debt per contract, biggest first, with the object panel (server package) of every object of the contract. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QarzdorScreen(onBack: () -> Unit, onOpenObject: (Long) -> Unit, onOpenWeb: (String, String) -> Unit, vm: QarzdorViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableStateOf(DebtFilter.OWED) }
    var query by rememberSaveable { mutableStateOf("") }
    var openId by rememberSaveable { mutableStateOf<Long?>(null) }
    val webTitle = stringResource(R.string.p8_dq_payables)
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.p8_dq_title), onBack)
        val all = ui.lines
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            all == null && ui.syncing -> SkeletonList(4)
            all == null -> when (ui.result) {
                is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.rb_forbidden), stringResource(R.string.f2_forbidden_body))
                else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            }
            else -> {
                val shown = filterDebts(all, filter, query)
                PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item { TotalCard(all, ui.aging, ui.updatedAt) }
                        item { ChipRow { DebtFilter.entries.forEach { f -> FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(filterLabel(f) + " (" + filterDebts(all, f, query).size + ")") }) } } }
                        item { OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.p8_dq_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                        if (shown.isEmpty()) item { Text(stringResource(if (all.isEmpty()) R.string.p8_dq_empty else R.string.p8_reg_no_match), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        items(shown, key = { it.contractId }) { l -> DebtCard(l) { openId = l.contractId } }
                        item { OutlinedButton(onClick = { onOpenWeb("/admin/qarzdorlik", webTitle) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_dq_payables)) } }
                    }
                }
            }
        }
    }
    val sel = ui.lines?.firstOrNull { it.contractId == openId }
    if (sel != null) {
        ModalBottomSheet(onDismissRequest = { openId = null }) {
            DebtSheet(sel, ui.objects, onObject = { openId = null; onOpenObject(it) })
        }
    }
}

@Composable
private fun TotalCard(lines: List<DebtLine>, aging: RahbarAging?, updatedAt: Long?) {
    val t = debtTotal(lines)
    WorkCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.p8_dq_total), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(formatMoney(t.value), style = MaterialTheme.typography.headlineSmall, color = if ((t.value ?: 0.0) > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
            Text(pluralStringResource(R.plurals.p8_dq_contracts, t.lines, t.lines) + if (t.unknown > 0) "  ·  " + stringResource(R.string.p8_dq_unknown, t.unknown) else "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (aging != null) {
                HorizontalDivider(Modifier.padding(vertical = 6.dp))
                Text(stringResource(R.string.p8_dq_aging), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AgingRow(stringResource(R.string.p8_dq_age1), aging.d0to30)
                AgingRow(stringResource(R.string.p8_dq_age2), aging.d30to60)
                AgingRow(stringResource(R.string.p8_dq_age3), aging.d60plus, bad = aging.d60plus > 0)
            }
            UpdatedLine(updatedAt, Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun AgingRow(label: String, v: Double, bad: Boolean = false) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(formatMoneyShort(v), style = MaterialTheme.typography.bodyMedium, color = if (bad) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun DebtCard(l: DebtLine, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(l.counterparty ?: l.name ?: ("#" + l.contractId), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                Text(listOfNotNull(l.number?.let { stringResource(R.string.p8_dq_contract_no, it) }, l.objects.firstOrNull()?.name).joinToString("  ·  "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Text(formatMoney(l.debt), style = MaterialTheme.typography.titleMedium, color = if ((l.debt ?: 0.0) > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
            }
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DebtSheet(l: DebtLine, objects: Map<Long, RahbarObject>, onObject: (Long) -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(l.counterparty ?: l.name ?: ("#" + l.contractId), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        l.number?.let { Text(stringResource(R.string.p8_dq_contract_no, it) + (l.name?.let { n -> "  ·  $n" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Line(stringResource(R.string.p8_dq_contract_sum), l.contractSum)
        Line(stringResource(R.string.p8_dq_f3), l.f3Sale)
        Line(stringResource(R.string.rb_paid), l.paid)
        Line(stringResource(R.string.p8_dq_debt), l.debt, strong = true)
        Text(stringResource(R.string.p8_dq_last_pay, l.lastPayment?.let { formatIsoStamp(it) } ?: "—"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.p8_dq_objects), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 8.dp))
        if (l.objects.isEmpty()) Text(stringResource(R.string.p8_dq_no_objects), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        l.objects.forEach { o -> ObjectPanel(o.name, objects[o.id]) { onObject(o.id) } }
    }
}

@Composable
private fun Line(label: String, v: Double?, strong: Boolean = false) {
    Row(Modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(formatMoney(v), style = if (strong) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium, color = if (strong && (v ?: 0.0) > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
    }
}

/** The object's line of the boss package: server sum packages (QQS first), percentages, payments. Nothing is added up here. */
@Composable
private fun ObjectPanel(name: String, o: RahbarObject?, onOpen: () -> Unit) {
    WorkCard(onClick = onOpen, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(o?.nom ?: name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (o == null) {
                Text(stringResource(R.string.p8_dq_panel_missing), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(stringResource(R.string.p1_card_f2), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                MoneyDual(displayMoney(o.f2, null), showVat = true, short = true)
                PercentBar(stringResource(R.string.p1_card_fakt), o.factPercent, ChartColors.fact)
                PercentBar(stringResource(R.string.p1_card_f2), o.f2Percent, ChartColors.f2)
                PercentBar(stringResource(R.string.p8_dq_paid_pct), o.paidPercent, ChartColors.warn)
                Row(Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.rb_paid) + ": " + formatMoneyShort(o.paid), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    Text(stringResource(R.string.p8_dq_debt) + ": " + formatMoneyShort(o.debt), style = MaterialTheme.typography.labelMedium, color = if ((o.debt ?: 0.0) > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
