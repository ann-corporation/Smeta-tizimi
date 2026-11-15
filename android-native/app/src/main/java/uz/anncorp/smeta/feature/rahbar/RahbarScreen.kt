package uz.anncorp.smeta.feature.rahbar

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.AttentionKind
import uz.anncorp.smeta.core.data.RahbarAttention
import uz.anncorp.smeta.core.data.RahbarObject
import uz.anncorp.smeta.core.data.RahbarPanelData
import uz.anncorp.smeta.core.data.RahbarRepository
import uz.anncorp.smeta.core.data.SumPack
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.data.percentOf
import uz.anncorp.smeta.core.ui.BarGroup
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.DonutChart
import uz.anncorp.smeta.core.ui.DonutSlice
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.GroupedBarChart
import uz.anncorp.smeta.core.ui.InfoTip
import uz.anncorp.smeta.core.ui.LegendDot
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.RingGauge
import uz.anncorp.smeta.core.ui.SkeletonCard
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class RahbarUi(
    val data: RahbarPanelData? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val companyName: String = "",
    val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class RahbarViewModel @Inject constructor(private val repo: RahbarRepository, private val ctx: WorkContext) : ViewModel() {
    private val sync = MutableStateFlow(Triple(true, false, null as SyncResult?))

    val state: StateFlow<RahbarUi> = combine(
        ctx.current.flatMapLatest { w -> if (w == null) flowOf(null) else repo.observe(w.companyId) },
        ctx.current.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) },
        sync, ctx.current,
    ) { data, ts, s, w -> RahbarUi(data, s.first && data == null, s.second, s.third, ts, w?.nom.orEmpty(), w == null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), RahbarUi())

    init { viewModelScope.launch { ctx.current.collect { if (it != null) refresh(initial = true) } } }

    fun refresh(initial: Boolean = false) {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.update { Triple(initial, !initial, it.third) }
            val r = repo.refresh(w.companyId)
            sync.value = Triple(false, false, r)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RahbarScreen(onBack: () -> Unit, onOpenObject: (Long) -> Unit, onOpenApprovals: () -> Unit, vm: RahbarViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.mod_rahbar), onBack)
        PullToRefreshBox(isRefreshing = ui.refreshing, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            val d = ui.data
            when {
                ui.noCompany -> EmptyState(Icons.Outlined.Insights, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
                d == null && ui.loading -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { SkeletonCard(lines = 4); SkeletonCard(lines = 3); SkeletonCard(lines = 5) }
                d == null -> when (ui.result) {
                    is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.rb_forbidden), stringResource(R.string.rb_forbidden_body))
                    is SyncResult.Offline -> EmptyState(Icons.Filled.CloudOff, stringResource(R.string.rb_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
                    else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.p1_objects_error), stringResource(R.string.err_server), stringResource(R.string.retry)) { vm.refresh() }
                }
                else -> PanelBody(ui, d, onOpenObject, onOpenApprovals, onRetry = { vm.refresh() })
            }
        }
    }
}

@Composable
private fun PanelBody(ui: RahbarUi, d: RahbarPanelData, onOpenObject: (Long) -> Unit, onOpenApprovals: () -> Unit, onRetry: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 4.dp, 16.dp, 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    if (ui.companyName.isNotBlank()) Text(ui.companyName, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground, maxLines = 1)
                    UpdatedLine(ui.updatedAt)
                }
                Text(pluralStringResource(R.plurals.rb_objects_n, d.objectCount, d.objectCount), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            if (ui.result is SyncResult.Offline) Text(stringResource(R.string.p1_card_offline), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
            if (ui.result is SyncResult.Failed) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Text(stringResource(R.string.err_server), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                androidx.compose.material3.TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.retry)) }
            }
        }
        item { TotalsCard(d) }
        item { CashCard(d) }
        if (d.approvals.isNotEmpty()) item { ApprovalsCard(d, onOpenApprovals) }
        item { AttentionCard(d, onOpenObject) }
        item { Text(stringResource(R.string.rb_objects), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.padding(top = 4.dp)) }
        if (d.objects.isEmpty()) item { Text(stringResource(R.string.p1_objects_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(d.objects, key = { it.id }) { ObjectPanelCard(it) { onOpenObject(it.id) } }
    }
}

/** One labelled sum package: QQS-inclusive first, then with and without markup (server package, nothing derived here). */
@Composable
private fun PackBlock(label: String, pack: SumPack?, tipTitle: String? = null, tipBody: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (tipTitle != null && tipBody != null) InfoTip(tipTitle, tipBody, Modifier.size(32.dp))
    }
    MoneyDual(displayMoney(pack, null), showVat = true, short = true)
}

@Composable
private fun TotalsCard(d: RahbarPanelData) {
    val c = d.cards
    val factPct = percentOf(c.fact?.qqsBilan, c.smeta?.qqsBilan)
    val f2Pct = c.f2PercentOfSmeta ?: percentOf(c.f2?.qqsBilan, c.smeta?.qqsBilan)
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.rb_company_totals), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                RingGauge(factPct, f2Pct, ChartColors.fact, ChartColors.f2, size = 112.dp)
                Spacer(Modifier.width(16.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    LegendDot(ChartColors.fact, stringResource(R.string.p1_card_fakt) + " " + formatPercent(factPct))
                    LegendDot(ChartColors.f2, stringResource(R.string.p1_card_f2) + " " + formatPercent(f2Pct))
                    Text(stringResource(R.string.rb_ring_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.rb_contracts), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text(if (c.contractsQqs == null) "—" else formatMoneyShort(c.contractsQqs) + "  ·  " + c.contractCount, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.height(8.dp))
            PackBlock(stringResource(R.string.m_object_value), c.smeta, stringResource(R.string.tip_smeta_t), stringResource(R.string.tip_smeta_b))
            Spacer(Modifier.height(10.dp))
            PackBlock(stringResource(R.string.p1_card_fakt), c.fact, stringResource(R.string.tip_fakt_t), stringResource(R.string.tip_fakt_b))
            Spacer(Modifier.height(10.dp))
            PackBlock(stringResource(R.string.p1_card_f2), c.f2, stringResource(R.string.tip_f2_t), stringResource(R.string.tip_f2_b))
            Text(pluralStringResource(R.plurals.rb_f2_count, c.f2Count, c.f2Count), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun CashCard(d: RahbarPanelData) {
    val c = d.cards
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.rb_cash), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(8.dp))
            CashLine(stringResource(R.string.rb_paid), c.paid)
            CashLine(stringResource(R.string.rb_receivable), c.receivable, strong = true)
            CashLine(stringResource(R.string.rb_payable), c.payable)
            c.aging?.let { a ->
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    DonutChart(listOf(DonutSlice(a.d0to30.toFloat(), ChartColors.fact, ""), DonutSlice(a.d30to60.toFloat(), ChartColors.warn, ""), DonutSlice(a.d60plus.toFloat(), ChartColors.bad, "")), size = 84.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        LegendDot(ChartColors.fact, "0–30  " + formatMoneyShort(a.d0to30))
                        LegendDot(ChartColors.warn, "30–60  " + formatMoneyShort(a.d30to60))
                        LegendDot(ChartColors.bad, "60+  " + formatMoneyShort(a.d60plus))
                    }
                }
            }
            if (d.months.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.rb_months), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    InfoTip(stringResource(R.string.rb_months), stringResource(R.string.rb_months_tip))
                }
                GroupedBarChart(
                    d.months.takeLast(6).map { BarGroup(it.month.takeLast(5).replace('-', '/'), listOf(it.done, it.paid, it.cost)) },
                    listOf(ChartColors.f2, ChartColors.fact, ChartColors.warn),
                )
                Spacer(Modifier.height(6.dp))
                @OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class) androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LegendDot(ChartColors.f2, stringResource(R.string.rb_leg_done)); LegendDot(ChartColors.fact, stringResource(R.string.rb_leg_paid)); LegendDot(ChartColors.warn, stringResource(R.string.rb_leg_cost))
                }
            }
            d.forecast?.let { f ->
                Spacer(Modifier.height(12.dp))
                Text(stringResource(R.string.rb_forecast, f.days), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                CashLine(stringResource(R.string.rb_fc_unpaid), f.unpaidF2)
                CashLine(stringResource(R.string.rb_fc_expected), f.expected, strong = true)
            }
        }
    }
}

@Composable
private fun CashLine(label: String, v: Double?, strong: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        // Unknown stays a dash and says why: the finance register is simply not filled in yet.
        Text(if (v == null) stringResource(R.string.rb_not_entered) else formatMoneyShort(v), style = if (strong) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = if (v == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun ApprovalsCard(d: RahbarPanelData, onOpen: () -> Unit) {
    WorkCard(onClick = onOpen, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.rb_approvals), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(stringResource(R.string.rb_approvals_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(d.approvals.size.toString(), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun attentionLabel(code: String): String = stringResource(
    when (AttentionKind.of(code)) {
        AttentionKind.UNHANDED -> R.string.rb_att_unhanded
        AttentionKind.F2_OVER_FACT -> R.string.rb_att_f2_over
        AttentionKind.OVER_ESTIMATE -> R.string.rb_att_over_est
        AttentionKind.NO_F3 -> R.string.rb_att_no_f3
        AttentionKind.CONTRACT_LIMIT -> R.string.rb_att_limit
        AttentionKind.PAY_LATE -> R.string.rb_att_late
        AttentionKind.REGISTRY_DIFF -> R.string.rb_att_registry
        AttentionKind.UNPRICED -> R.string.rb_att_unpriced
        AttentionKind.STOCK_NEGATIVE -> R.string.rb_att_stock
        AttentionKind.OTHER -> R.string.rb_att_other
    },
)

@Composable
private fun AttentionCard(d: RahbarPanelData, onOpenObject: (Long) -> Unit) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.rb_attention), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                InfoTip(stringResource(R.string.rb_attention), stringResource(R.string.rb_attention_tip))
            }
            if (d.attention.isEmpty()) {
                Text(stringResource(R.string.rb_attention_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(top = 6.dp))
            } else {
                d.attention.take(8).forEach { a -> AttentionRow(a, onOpenObject) }
            }
        }
    }
}

@Composable
private fun AttentionRow(a: RahbarAttention, onOpenObject: (Long) -> Unit) {
    val critical = AttentionKind.of(a.code).let { it == AttentionKind.F2_OVER_FACT || it == AttentionKind.PAY_LATE || it == AttentionKind.STOCK_NEGATIVE }
    val tint = if (critical) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).let { m -> a.objectId?.let { id -> m.clickable { onOpenObject(id) } } ?: m }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Warning, null, tint = tint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(attentionLabel(a.code), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(listOfNotNull(a.nom, a.count?.let { "×$it" }, a.impact?.let { formatMoneyShort(it) }).joinToString("  ·  "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        if (a.objectId != null) Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ObjectPanelCard(o: RahbarObject, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(o.nom, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                if (o.critical > 0 || o.signals > 0) {
                    Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(50), color = if (o.critical > 0) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainerHighest, modifier = Modifier.padding(start = 8.dp)) {
                        Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Warning, null, tint = if (o.critical > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text((if (o.critical > 0) o.critical else o.signals).toString(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            // Object value: QQS-inclusive first, then with / without markup (server package).
            MoneyDual(displayMoney(o.smeta, null), showVat = true, short = true)
            Spacer(Modifier.height(10.dp))
            PercentBar(stringResource(R.string.p1_card_fakt), o.factPercent, ChartColors.fact)
            Spacer(Modifier.height(8.dp))
            PercentBar(stringResource(R.string.p1_card_f2), o.f2Percent, ChartColors.f2)
            if (o.paid != null || o.debt != null) {
                Spacer(Modifier.height(10.dp))
                Row {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.rb_paid), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(if (o.paid == null) "—" else formatMoneyShort(o.paid), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.rb_debt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(if (o.debt == null) "—" else formatMoneyShort(o.debt), style = MaterialTheme.typography.bodyMedium, color = if ((o.debt ?: 0.0) > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
            if (o.f2Drafts > 0) Text(pluralStringResource(R.plurals.rb_f2_drafts, o.f2Drafts, o.f2Drafts), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        }
    }
}
