package uz.anncorp.smeta.feature.approval

import androidx.annotation.StringRes
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApprovalDetail
import uz.anncorp.smeta.core.data.ApprovalDoc
import uz.anncorp.smeta.core.data.ApprovalItem
import uz.anncorp.smeta.core.data.ApprovalStep
import uz.anncorp.smeta.core.data.Decision
import uz.anncorp.smeta.core.data.DecisionError
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar

@StringRes
internal fun docTypeRes(tur: String): Int? = when (tur) {
    "f2" -> R.string.p2_doc_f2
    "fakt" -> R.string.p2_doc_fakt
    "aosr" -> R.string.p2_doc_aosr
    "forma3" -> R.string.p2_doc_forma3
    else -> null
}

@StringRes
internal fun stepRes(holat: String): Int? = when (holat) {
    "kutilmoqda" -> R.string.p2_step_kutilmoqda
    "navbat" -> R.string.p2_step_navbat
    "tasdiqlandi" -> R.string.p2_step_tasdiqlandi
    "rad" -> R.string.p2_step_rad
    "qaytarildi" -> R.string.p2_step_qaytarildi
    else -> null
}

@StringRes
internal fun errorRes(e: DecisionError): Int = when (e) {
    DecisionError.OFFLINE -> R.string.p2_appr_err_offline
    DecisionError.NOT_YOUR_TURN -> R.string.p2_appr_err_turn
    DecisionError.CHANGED -> R.string.p2_appr_err_changed
    DecisionError.ROLE -> R.string.p2_appr_err_role
    DecisionError.FORBIDDEN -> R.string.p2_appr_err_forbidden
    DecisionError.FAILED -> R.string.p2_appr_err_generic
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalsScreen(onOpen: (Long) -> Unit, vm: InboxViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refresh() }
    PullToRefreshBox(isRefreshing = ui.loading && ui.items.isNotEmpty(), onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        when {
            ui.loading && ui.items.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            ui.items.isEmpty() -> when (ui.result) {
                is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.p1_objects_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
                is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p2_appr_err_forbidden))
                is SyncResult.Failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p2_appr_err_load), null, stringResource(R.string.retry)) { vm.refresh() }
                else -> CenterMessage(Icons.Filled.CheckCircle, stringResource(R.string.p2_appr_empty), stringResource(R.string.p2_appr_empty_hint))
            }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(ui.items, key = { it.id }) { ApprovalRow(it) { onOpen(it.id) } }
            }
        }
    }
}

@Composable
private fun ApprovalRow(a: ApprovalItem, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(16.dp)) {
            Text(docTypeRes(a.tur)?.let { stringResource(it) } ?: a.tur, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(a.sarlavha.ifBlank { "#${a.id}" }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                a.egasi?.takeIf { it.isNotBlank() }?.let { Text(stringResource(R.string.p2_appr_from, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    ?: Spacer(Modifier.weight(1f))
                if (a.kechikkan) Text(stringResource(R.string.p2_appr_overdue), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                else a.muddat?.takeIf { it.isNotBlank() }?.let { Text(stringResource(R.string.p2_appr_due, it.take(10)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}

@Composable
fun ApprovalDetailScreen(onBack: () -> Unit, vm: ApprovalDetailViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    var confirm by rememberSaveable { mutableStateOf<Decision?>(null) }
    val doneMsg = ui.done?.let {
        stringResource(when (it) { Decision.APPROVE -> R.string.p2_appr_done_approve; Decision.RETURN -> R.string.p2_appr_done_return; Decision.REJECT -> R.string.p2_appr_done_reject })
    }
    val errMsg = ui.error?.let { e -> if (e == DecisionError.FAILED) stringResource(R.string.p2_appr_err_generic, ui.errorCode ?: "?") else stringResource(errorRes(e)) }

    LaunchedEffect(doneMsg) { if (doneMsg != null) { snack.showSnackbar(doneMsg); onBack() } }
    LaunchedEffect(errMsg) { if (errMsg != null) { snack.showSnackbar(errMsg); vm.clearError() } }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(stringResource(R.string.p2_appr_detail), onBack) },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        val d = ui.detail
        when {
            ui.loading && d == null -> Column(Modifier.padding(pad).fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            d == null -> CenterMessage(Icons.Filled.Warning, stringResource(if (ui.result is SyncResult.Offline) R.string.p2_appr_err_offline else R.string.p2_appr_err_load), null, stringResource(R.string.retry), Modifier.padding(pad)) { vm.load() }
            else -> Column(Modifier.padding(pad).fillMaxSize()) {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
                    DocCard(d, ui.doc)
                    Spacer(Modifier.height(12.dp))
                    StepsCard(d.steps)
                }
                if (d.myTurn) ActionBar(online = ui.online, busy = ui.deciding, onDecision = { confirm = it })
                else Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Text(stringResource(R.string.p2_appr_not_my_turn), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp))
                }
            }
        }
    }

    confirm?.let { dec ->
        ConfirmDialog(dec, onDismiss = { confirm = null }, onConfirm = { comment -> confirm = null; vm.decide(dec, comment) })
    }
}

@Composable
private fun DocCard(d: ApprovalDetail, doc: ApprovalDoc?) {
    val typeKey = doc?.tur?.ifBlank { null } ?: d.tur
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(d.sarlavha.ifBlank { "#${d.id}" }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(10.dp))
            Fact(stringResource(R.string.p2_appr_type), docTypeRes(typeKey)?.let { stringResource(it) } ?: typeKey.ifBlank { "—" })
            Fact(stringResource(R.string.p2_appr_number), doc?.raqam ?: "—")
            Fact(stringResource(R.string.p2_appr_object), doc?.obyekt ?: "—")
            Fact(stringResource(R.string.p2_appr_date), doc?.sana ?: "—")
            Fact(stringResource(R.string.p2_appr_total), formatMoney(doc?.jami), emphasize = true)
            Text(stringResource(R.string.p2_appr_total_note), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun Fact(label: String, value: String, emphasize: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(112.dp))
        Text(value, style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StepsCard(steps: List<ApprovalStep>) {
    if (steps.isEmpty()) return
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.p2_appr_steps), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            steps.sortedBy { it.tartib }.forEach { s ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
                    Text("${s.tartib}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(24.dp))
                    Column(Modifier.weight(1f)) {
                        Text(s.rol.uppercase(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                        s.izoh?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Text(stepRes(s.holat)?.let { stringResource(it) } ?: s.holat, style = MaterialTheme.typography.labelMedium, color = if (s.holat == "navbat") MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun ActionBar(online: Boolean, busy: Boolean, onDecision: (Decision) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
            if (!online) Text(stringResource(R.string.p2_appr_online_only), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(bottom = 8.dp))
            val enabled = online && !busy
            Button(onClick = { onDecision(Decision.APPROVE) }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                if (busy) CircularProgressIndicator(Modifier.height(20.dp).width(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text(stringResource(R.string.p2_appr_approve), style = MaterialTheme.typography.titleSmall)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { onDecision(Decision.RETURN) }, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.p2_appr_return)) }
                OutlinedButton(
                    onClick = { onDecision(Decision.REJECT) }, enabled = enabled, modifier = Modifier.weight(1f).heightIn(min = TouchTarget),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.p2_appr_reject)) }
            }
        }
    }
}

@Composable
private fun ConfirmDialog(decision: Decision, onDismiss: () -> Unit, onConfirm: (String?) -> Unit) {
    var comment by rememberSaveable { mutableStateOf("") }
    val title = when (decision) { Decision.APPROVE -> R.string.p2_appr_confirm_approve; Decision.RETURN -> R.string.p2_appr_confirm_return; Decision.REJECT -> R.string.p2_appr_confirm_reject }
    val valid = !decision.needsComment || comment.isNotBlank()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(title)) },
        text = {
            OutlinedTextField(
                value = comment, onValueChange = { comment = it.take(2000) }, minLines = 2, maxLines = 5,
                label = { Text(stringResource(if (decision.needsComment) R.string.p2_appr_comment_required else R.string.p2_appr_comment)) },
                isError = decision.needsComment && comment.isBlank(), modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = { TextButton(onClick = { onConfirm(comment.trim().ifEmpty { null }) }, enabled = valid) { Text(stringResource(R.string.p2_appr_confirm_yes)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.p1_cancel)) } },
    )
}
