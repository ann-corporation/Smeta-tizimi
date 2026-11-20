package uz.anncorp.smeta.feature.f2

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
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.graphics.Color
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
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Repository
import uz.anncorp.smeta.core.data.F2Status
import uz.anncorp.smeta.core.data.MoneyRepository
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.DonutChart
import uz.anncorp.smeta.core.ui.DonutSlice
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.InfoTip
import uz.anncorp.smeta.core.ui.LegendDot
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class F2Ui(
    val name: String = "",
    val acts: List<F2Act>? = null,
    val money: ObjectMoney? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
)

@HiltViewModel
class F2ListViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val repo: F2Repository, money: MoneyRepository,
    private val transitions: uz.anncorp.smeta.core.data.F2TransitionRepository, private val ctx: uz.anncorp.smeta.core.data.WorkContext,
    private val api: uz.anncorp.smeta.core.data.BffApi,
    private val modules: uz.anncorp.smeta.core.data.ModulesRepository,
) : ViewModel() {
    /** Result text of the last approval step ("OK" = done); online only, nothing is queued. */
    val stepMsg = MutableStateFlow<String?>(null)
    val stepBusy = MutableStateFlow(false)
    /** Server totals of the opened act (aktId to result); the app never computes QQS or markup. */
    val summa = MutableStateFlow<Pair<Long, uz.anncorp.smeta.core.data.AktSumma?>?>(null)
    fun loadSumma(aktId: Long) {
        summa.value = aktId to null
        viewModelScope.launch {
            // One rule with the approval screen: without f2.read the amount is simply not shown (no "no permission" line on one screen and a figure on the other).
            val allowed = ctx.current.value?.companyId?.let { modules.canSeeAmounts(it) } ?: true
            summa.value = aktId to (if (allowed) uz.anncorp.smeta.core.data.AktSummaRepository(api).load(aktId) else uz.anncorp.smeta.core.data.AktSumma.Unknown("HIDDEN"))
        }
    }
    fun step(a: F2Act, to: F2Status, reason: String?) {
        val w = ctx.current.value ?: return
        if (stepBusy.value) return
        viewModelScope.launch {
            stepBusy.value = true; stepMsg.value = null
            when (val r = transitions.transition(w.companyId, a, to, java.util.UUID.randomUUID().toString(), reason)) {
                is uz.anncorp.smeta.core.data.F2TransitionResult.Done -> { stepMsg.value = "OK"; refresh() }
                is uz.anncorp.smeta.core.data.F2TransitionResult.Error -> stepMsg.value = if (r.offline) uz.anncorp.smeta.core.data.OFFLINE_WRITE_MESSAGE else uz.anncorp.smeta.core.data.serverErrorText(r.code)
            }
            stepBusy.value = false
        }
    }

    val id: Long = checkNotNull(handle["id"])
    private val sync = MutableStateFlow<Pair<Boolean, SyncResult?>>(true to null)

    val state: StateFlow<F2Ui> = combine(repo.observe(id), objects.observeOne(id), money.observe(id), repo.lastUpdated(id), sync) { a, o, m, ts, s ->
        F2Ui(o?.nom.orEmpty(), a, m, s.first, s.second, ts)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), F2Ui())

    init { refresh() }

    fun refresh() { viewModelScope.launch { sync.value = true to null; sync.value = false to repo.refresh(id) } }
}

@Composable
internal fun statusColor(s: F2Status): Color = when (s) {
    F2Status.APPROVED -> ChartColors.fact
    F2Status.REJECTED, F2Status.CANCELLED -> ChartColors.bad
    F2Status.DRAFT, F2Status.SUPERSEDED, F2Status.UNKNOWN -> MaterialTheme.colorScheme.onSurfaceVariant
    F2Status.SUBMITTED, F2Status.CHECKED -> ChartColors.warn
}

@Composable
internal fun statusLabel(s: F2Status): String = stringResource(
    when (s) {
        F2Status.DRAFT -> R.string.f2_st_draft
        F2Status.SUBMITTED -> R.string.f2_st_submitted
        F2Status.CHECKED -> R.string.f2_st_checked
        F2Status.APPROVED -> R.string.f2_st_approved
        F2Status.REJECTED -> R.string.f2_st_rejected
        F2Status.CANCELLED -> R.string.f2_st_cancelled
        F2Status.SUPERSEDED -> R.string.f2_st_superseded
        F2Status.UNKNOWN -> R.string.f2_st_unknown
    },
)

@Composable
private fun statusExplain(s: F2Status): String = stringResource(
    when (s) {
        F2Status.DRAFT -> R.string.f2_ex_draft
        F2Status.SUBMITTED -> R.string.f2_ex_submitted
        F2Status.CHECKED -> R.string.f2_ex_checked
        F2Status.APPROVED -> R.string.f2_ex_approved
        F2Status.REJECTED -> R.string.f2_ex_rejected
        F2Status.CANCELLED -> R.string.f2_ex_cancelled
        F2Status.SUPERSEDED -> R.string.f2_ex_superseded
        F2Status.UNKNOWN -> R.string.f2_ex_unknown
    },
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun F2ListScreen(onBack: () -> Unit, onDocs: (Long) -> Unit = {}, onOpenAct: (Long, Long) -> Unit = { _, _ -> }, vm: F2ListViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var detail by remember { mutableStateOf<F2Act?>(null) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.f2_title) + if (ui.name.isNotBlank()) " · " + ui.name else "", onBack)
        PullToRefreshBox(isRefreshing = ui.syncing && ui.acts != null, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
            val acts = ui.acts
            when {
                acts == null && ui.syncing -> SkeletonList(4)
                acts == null -> when (ui.result) {
                    is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.f2_forbidden), stringResource(R.string.f2_forbidden_body))
                    else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
                }
                acts.isEmpty() -> EmptyState(Icons.Outlined.Description, stringResource(R.string.f2_empty), stringResource(R.string.f2_empty_hint))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item { Summary(ui, acts) }
                    items(acts, key = { it.id }) { a -> ActCard(a) { detail = a } }
                    item {
                        Button(onClick = { onDocs(vm.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.docs_f2_button)) }
                        Text(stringResource(R.string.f2_pdf_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
    }
    detail?.let { a ->
        ModalBottomSheet(onDismissRequest = { detail = null }) {
            DetailSheet(a, onDocs = { detail = null; onDocs(vm.id) }, onRows = { detail = null; onOpenAct(vm.id, a.id) }, vm = vm, onDone = { detail = null })
        }
    }
}

@Composable
private fun Summary(ui: F2Ui, acts: List<F2Act>) {
    val counts = F2Status.entries.map { st -> st to acts.count { it.state == st } }.filter { it.second > 0 }
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.f2_summary), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                InfoTip(stringResource(R.string.tip_f2_t), stringResource(R.string.tip_f2_b))
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                DonutChart(counts.map { (st, n) -> DonutSlice(n.toFloat(), statusColor(st), "") }, size = 96.dp, centre = acts.size.toString())
                Spacer(Modifier.width(16.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { counts.forEach { (st, n) -> LegendDot(statusColor(st), statusLabel(st) + "  " + n) } }
            }
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.p1_card_f2), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // Sum of the accepted acts: the object's server package (QQS first, then with / without markup), never summed on the phone.
            MoneyDual(displayMoney(ui.money?.f2, null), showVat = true, short = true)
            Spacer(Modifier.height(6.dp))
            UpdatedLine(ui.updatedAt)
        }
    }
}

@Composable
private fun ActCard(a: F2Act, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.f2_act_title, a.raqam ?: ("#" + a.id)), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(listOfNotNull(f2MonthLabel(a.oy), a.rows?.let { pluralStringResource(R.plurals.p1_rows, it, it) }).joinToString("  ·  "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if ((a.unpriced ?: 0) > 0 || (a.negativeRows ?: 0) > 0 || a.hasDiff) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if ((a.unpriced ?: 0) > 0) Flag(stringResource(R.string.f2_flag_unpriced, a.unpriced ?: 0))
                        if ((a.negativeRows ?: 0) > 0) Flag(stringResource(R.string.f2_flag_minus, a.negativeRows ?: 0))
                        if (a.hasDiff) Flag(stringResource(R.string.f2_flag_diff))
                    }
                }
            }
            StatusChip(a.state)
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Flag(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(3.dp))
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
    }
}

@Composable
internal fun StatusChip(s: F2Status, modifier: Modifier = Modifier) {
    val c = statusColor(s)
    Surface(shape = RoundedCornerShape(50), color = c.copy(alpha = 0.16f), modifier = modifier.padding(horizontal = 6.dp)) {
        Text(statusLabel(s), style = MaterialTheme.typography.labelMedium, color = c, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

@Composable
private fun DetailSheet(a: F2Act, onDocs: () -> Unit, onRows: () -> Unit, vm: F2ListViewModel, onDone: () -> Unit) {
    val msg by vm.stepMsg.collectAsStateWithLifecycle()
    val busy by vm.stepBusy.collectAsStateWithLifecycle()
    var rejecting by remember(a.id) { mutableStateOf(false) }
    var reason by remember(a.id) { mutableStateOf("") }
    val summa by vm.summa.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(a.id) { vm.stepMsg.value = null; vm.loadSumma(a.id) }
    androidx.compose.runtime.LaunchedEffect(msg) { if (msg == "OK") { vm.stepMsg.value = null; onDone() } }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.f2_act_title, a.raqam ?: ("#" + a.id)), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            StatusChip(a.state)
        }
        Text(statusExplain(a.state), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        DetailLine(stringResource(R.string.f2_month), f2MonthLabel(a.oy) ?: "—")
        DetailLine(stringResource(R.string.f2_rows), a.rows?.toString() ?: "—")
        DetailLine(stringResource(R.string.f2_unpriced), a.unpriced?.toString() ?: "\u2014", warn = (a.unpriced ?: 0) > 0)
        DetailLine(stringResource(R.string.f2_minus_rows), a.negativeRows?.toString() ?: "\u2014")
        if (a.hasDiff) Text(stringResource(R.string.f2_flag_diff_long), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
        summa?.takeIf { it.first == a.id }?.second?.let { s ->
            when (s) {
                is uz.anncorp.smeta.core.data.AktSumma.Known -> {
                    MoneyDual(displayMoney(s.pack, null), showVat = true)
                    if ((s.unpriced ?: 0) > 0) Text(stringResource(R.string.f2_unpriced) + ": " + s.unpriced, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                }
                is uz.anncorp.smeta.core.data.AktSumma.Unknown -> uz.anncorp.smeta.core.data.aktSummaUnknownText(s.code)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        uz.anncorp.smeta.core.data.f2StepLabel(a.state)?.let { label ->
            Button(onClick = { uz.anncorp.smeta.core.data.f2NextStep(a.state)?.let { vm.step(a, it, null) } }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(label) }
        }
        if (uz.anncorp.smeta.core.data.f2CanReject(a.state)) {
            androidx.compose.material3.OutlinedButton(onClick = { rejecting = !rejecting }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2_reject)) }
            if (rejecting) {
                androidx.compose.material3.OutlinedTextField(reason, { reason = it }, label = { Text(stringResource(R.string.f2_reject_reason)) }, modifier = Modifier.fillMaxWidth())
                Button(onClick = { if (reason.isNotBlank()) vm.step(a, F2Status.REJECTED, reason) else vm.stepMsg.value = uz.anncorp.smeta.core.data.serverErrorText("REASON_REQUIRED") }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2_reject_confirm)) }
            }
        }
        msg?.takeIf { it != "OK" }?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Button(onClick = onRows, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_open)) }
        androidx.compose.material3.OutlinedButton(onClick = onDocs, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.docs_f2_button)) }
    }
}

@Composable
private fun DetailLine(label: String, value: String, warn: Boolean = false) {
    Row(Modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = if (warn) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
    }
}
