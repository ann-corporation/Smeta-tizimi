package uz.anncorp.smeta.feature.nazorat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.NAZORAT_REMARK_MAX
import uz.anncorp.smeta.core.data.NazoratCheck
import uz.anncorp.smeta.core.data.NazoratDecision
import uz.anncorp.smeta.core.data.NazoratError
import uz.anncorp.smeta.core.data.NazoratItem
import uz.anncorp.smeta.core.data.NazoratRepository
import uz.anncorp.smeta.core.data.NazoratResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.data.remarkIssue
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

enum class NazoratMsg { ACCEPTED, CORRECTION, REJECTED, REMARK_REQUIRED, NO_RIGHT, WRONG_STATE, NETWORK, SERVER, STEP_UP }

data class NazoratUi(
    val loading: Boolean = true,
    val failed: Boolean = false,
    val items: List<NazoratItem> = emptyList(),
    val selected: NazoratItem? = null,
    val check: NazoratCheck? = null,
    val checking: Boolean = false,
    val busy: Boolean = false,
    val message: NazoratMsg? = null,
) {
    val pending get() = items.filter { it.pending }
    val decided get() = items.filter { !it.pending }
}

fun NazoratError.toMessage(): NazoratMsg = when (this) {
    NazoratError.NETWORK -> NazoratMsg.NETWORK
    NazoratError.REMARK_REQUIRED -> NazoratMsg.REMARK_REQUIRED
    NazoratError.NO_RIGHT -> NazoratMsg.NO_RIGHT
    NazoratError.WRONG_STATE, NazoratError.NOT_FOUND -> NazoratMsg.WRONG_STATE
    NazoratError.STEP_UP -> NazoratMsg.STEP_UP
    NazoratError.UNAUTHORIZED, NazoratError.SERVER -> NazoratMsg.SERVER
}

@HiltViewModel
class NazoratViewModel @Inject constructor(private val repo: NazoratRepository, private val ctx: WorkContext) : ViewModel() {
    private val _ui = MutableStateFlow(NazoratUi())
    val ui: StateFlow<NazoratUi> = _ui.asStateFlow()

    init { refresh() }

    private fun companyId() = ctx.current.value?.companyId

    fun refresh() {
        val cid = companyId() ?: run { _ui.update { it.copy(loading = false, failed = true) }; return }
        viewModelScope.launch {
            when (val r = repo.inbox(cid)) {
                is NazoratResult.Ok -> _ui.update { it.copy(loading = false, failed = false, items = r.value, selected = it.selected?.let { s -> r.value.firstOrNull { x -> x.id == s.id } }) }
                is NazoratResult.Err -> _ui.update { it.copy(loading = false, failed = it.items.isEmpty()) }
            }
        }
    }

    fun open(item: NazoratItem) {
        _ui.update { it.copy(selected = item, check = null, checking = item.resource == "f2") }
        val cid = companyId() ?: return
        viewModelScope.launch {
            val r = repo.check(cid, item)
            _ui.update { if (it.selected?.id == item.id) it.copy(checking = false, check = (r as? NazoratResult.Ok)?.value) else it }
        }
    }

    fun close() = _ui.update { it.copy(selected = null, check = null, checking = false) }
    fun consume() = _ui.update { it.copy(message = null) }

    /** The API client asks for the PIN/biometric confirmation when the server demands it, then replays the request. */
    fun decide(decision: NazoratDecision, remark: String) {
        val item = _ui.value.selected ?: return
        val cid = companyId() ?: return
        if (_ui.value.busy) return
        if (remarkIssue(decision, remark)) { _ui.update { it.copy(message = NazoratMsg.REMARK_REQUIRED) }; return }
        _ui.update { it.copy(busy = true) }
        viewModelScope.launch {
            when (val r = repo.decide(cid, item.id, decision, remark)) {
                is NazoratResult.Ok -> {
                    _ui.update { it.copy(busy = false, selected = null, check = null, message = when (decision) { NazoratDecision.ACCEPT -> NazoratMsg.ACCEPTED; NazoratDecision.CORRECT -> NazoratMsg.CORRECTION; NazoratDecision.REJECT -> NazoratMsg.REJECTED }) }
                    refresh()
                }
                is NazoratResult.Err -> _ui.update { it.copy(busy = false, message = r.error.toMessage()) }
            }
        }
    }
}

private fun NazoratMsg.res() = when (this) {
    NazoratMsg.ACCEPTED -> R.string.p10_nz_msg_accepted
    NazoratMsg.CORRECTION -> R.string.p10_nz_msg_correction
    NazoratMsg.REJECTED -> R.string.p10_nz_msg_rejected
    NazoratMsg.REMARK_REQUIRED -> R.string.p10_nz_msg_remark
    NazoratMsg.NO_RIGHT -> R.string.p10_nz_msg_no_right
    NazoratMsg.WRONG_STATE -> R.string.p10_nz_msg_state
    NazoratMsg.NETWORK -> R.string.p10_msg_network
    NazoratMsg.SERVER -> R.string.p10_msg_server
    NazoratMsg.STEP_UP -> R.string.qulf_step_needed
}

private fun statusRes(s: String): Int = when (s) {
    "yuborilgan" -> R.string.p10_nz_s_sent
    "ko_rilmoqda" -> R.string.p10_nz_s_review
    "qabul" -> R.string.p10_nz_s_accepted
    "tuzatish" -> R.string.p10_nz_s_correction
    "rad" -> R.string.p10_nz_s_rejected
    else -> R.string.p10_nz_s_other
}

private fun problemRes(k: String): Int = when (k) {
    "akt_yoq" -> R.string.p10_nz_pr_no_act
    "akt_kutmoqda" -> R.string.p10_nz_pr_act_wait
    "hajm_oshgan" -> R.string.p10_nz_pr_over
    else -> R.string.p10_nz_s_other
}

/** Texnadzor (external party) acceptance: submissions that arrived at my company, a read-only check and the decision with a remark. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NazoratScreen(onBack: () -> Unit, vm: NazoratViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    ui.message?.let { m -> val text = stringResource(m.res()); LaunchedEffect(m) { snack.showSnackbar(text); vm.consume() } }
    BackHandler(enabled = ui.selected != null) { vm.close() }
    Scaffold(
        snackbarHost = { SnackbarHost(snack) }, containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
        topBar = { WorkTopBar(stringResource(R.string.p10_nz_title), if (ui.selected != null) vm::close else onBack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            val sel = ui.selected
            when {
                sel != null -> Detail(sel, ui, vm)
                ui.loading -> SkeletonList(4)
                ui.failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p10_nz_err), null, stringResource(R.string.retry)) { vm.refresh() }
                else -> PullToRefreshBox(isRefreshing = false, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (ui.items.isEmpty()) item { CenterMessage(Icons.Filled.CheckCircle, stringResource(R.string.p10_nz_empty), stringResource(R.string.p10_nz_empty_hint), modifier = Modifier.padding(top = 24.dp)) }
                        if (ui.pending.isNotEmpty()) item { Text(stringResource(R.string.p10_nz_pending, ui.pending.size), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        items(ui.pending, key = { it.id }) { ItemCard(it) { vm.open(it) } }
                        if (ui.decided.isNotEmpty()) item { Text(stringResource(R.string.p10_nz_decided), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp)) }
                        items(ui.decided, key = { it.id }) { ItemCard(it) { vm.open(it) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun ItemCard(item: NazoratItem, onClick: () -> Unit) {
    WorkCard(onClick = onClick) {
        Column(Modifier.padding(16.dp).heightIn(min = TouchTarget), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(item.title.ifBlank { item.resource.uppercase() }, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
            listOfNotNull(item.objectName, item.from, item.month).filter { it.isNotBlank() }.joinToString(" · ").takeIf { it.isNotBlank() }
                ?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2) }
            Text(stringResource(statusRes(item.status)), style = MaterialTheme.typography.labelMedium, color = if (item.pending) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Detail(item: NazoratItem, ui: NazoratUi, vm: NazoratViewModel) {
    var remark by rememberSaveable(item.id) { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        WorkCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.title.ifBlank { item.resource.uppercase() }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                item.objectName?.let { Line(stringResource(R.string.p10_nz_object), it) }
                item.from?.let { Line(stringResource(R.string.p10_nz_from), it) }
                item.month?.let { Line(stringResource(R.string.p10_nz_month), it) }
                item.total?.let { Line(stringResource(R.string.p10_nz_total), formatMoney(it)) }
                Line(stringResource(R.string.p10_nz_status), stringResource(statusRes(item.status)))
                item.decisionNote?.let { Line(stringResource(R.string.p10_nz_note), it) }
            }
        }
        if (item.resource == "f2") {
            WorkCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.p10_nz_check), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val c = ui.check
                    when {
                        ui.checking -> Text(stringResource(R.string.p10_update_checking), style = MaterialTheme.typography.bodySmall)
                        c == null -> Text(stringResource(R.string.p10_nz_check_none), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        else -> {
                            Line(stringResource(R.string.p10_nz_rows), c.rows.toString())
                            Line(stringResource(R.string.p10_nz_hidden), c.hidden.toString())
                            if (c.actMissing > 0) Line(stringResource(R.string.p10_nz_pr_no_act), c.actMissing.toString())
                            if (c.actWaiting > 0) Line(stringResource(R.string.p10_nz_pr_act_wait), c.actWaiting.toString())
                            c.overVolume?.takeIf { it > 0 }?.let { Line(stringResource(R.string.p10_nz_pr_over), it.toString()) }
                            Text(stringResource(if (c.clean) R.string.p10_nz_clean else R.string.p10_nz_issues), style = MaterialTheme.typography.bodyMedium,
                                color = if (c.clean) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.tertiary)
                            c.problems.take(15).forEach { p ->
                                Text("${p.code.orEmpty()} ${p.name.orEmpty()}".trim(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                                Text(buildString {
                                    append(stringResource(problemRes(p.kind)))
                                    if (p.f2Volume != null) append(" · F2 ").append(formatVolume(p.f2Volume))
                                    if (p.factVolume != null) append(" / ").append(stringResource(R.string.p10_nz_fact)).append(' ').append(formatVolume(p.factVolume))
                                    p.unit?.let { append(' ').append(it) }
                                }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (c.problems.size > 15) Text(stringResource(R.string.p10_nz_more, c.problems.size - 15), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        if (item.pending) {
            OutlinedTextField(
                remark, { remark = it.take(NAZORAT_REMARK_MAX) }, label = { Text(stringResource(R.string.p10_nz_remark)) }, minLines = 3, modifier = Modifier.fillMaxWidth(),
                supportingText = { Text(stringResource(R.string.p10_nz_remark_hint)) },
            )
            Button(onClick = { vm.decide(NazoratDecision.ACCEPT, remark) }, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_nz_accept)) }
            OutlinedButton(onClick = { vm.decide(NazoratDecision.CORRECT, remark) }, enabled = !ui.busy && !remarkIssue(NazoratDecision.CORRECT, remark), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_nz_correct)) }
            Button(
                onClick = { vm.decide(NazoratDecision.REJECT, remark) }, enabled = !ui.busy && !remarkIssue(NazoratDecision.REJECT, remark), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
            ) { Text(stringResource(R.string.p10_nz_reject)) }
            Text(stringResource(R.string.p10_nz_pin_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun Line(label: String, value: String) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.4f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(0.6f))
    }
}
