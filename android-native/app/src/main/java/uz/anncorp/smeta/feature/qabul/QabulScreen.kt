package uz.anncorp.smeta.feature.qabul

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.PendingFakt
import uz.anncorp.smeta.core.data.QabulBatch
import uz.anncorp.smeta.core.data.QabulDecision
import uz.anncorp.smeta.core.data.QabulRepository
import uz.anncorp.smeta.core.data.QabulResult
import uz.anncorp.smeta.core.data.STALE_DAYS
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.batchPending
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.formatVolumeSigned
import uz.anncorp.smeta.core.data.remarkValid
import uz.anncorp.smeta.core.data.waitingDays
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.util.UUID
import javax.inject.Inject

/** What the last decision did: shown once in a banner. */
sealed interface QabulNote {
    data class Done(val accepted: Boolean, val count: Int) : QabulNote
    data object Offline : QabulNote
    data object Forbidden : QabulNote
    data object Changed : QabulNote
    data object Failed : QabulNote
}

data class QabulUi(
    val batches: List<QabulBatch>? = null,
    val names: Map<Long, String> = emptyMap(),
    val labels: Map<Pair<Long, Long>, Pair<String, String?>> = emptyMap(),
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val busy: Boolean = false,
    val note: QabulNote? = null,
    val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class QabulViewModel @Inject constructor(private val repo: QabulRepository, private val objects: ObjectsRepository, private val ctx: WorkContext) : ViewModel() {
    private data class Local(val syncing: Boolean = true, val result: SyncResult? = null, val busy: Boolean = false, val note: QabulNote? = null, val labels: Map<Pair<Long, Long>, Pair<String, String?>> = emptyMap())
    private val local = MutableStateFlow(Local())
    private val company = ctx.current
    /** The operation id of an attempt stays the same while it is retried (the server answers a repeated id with the first result). */
    private var pendingOp: Pair<List<Long>, String>? = null

    val state: StateFlow<QabulUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) },
        local, company,
    ) { pending, objs, ts, l, w ->
        QabulUi(pending?.let { batchPending(it) }, objs.associate { it.id to it.nom }, l.labels, l.syncing, l.result, ts, l.busy, l.note, w == null)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), QabulUi())

    init {
        viewModelScope.launch { company.collect { if (it != null) refresh() } }
        // Row names come from the cached estimate tree of each object (nothing is fetched for them).
        viewModelScope.launch {
            state.collect { s ->
                val missing = s.batches.orEmpty().flatMap { b -> b.items.map { b.objectId to it.rowId } }.distinct().filter { it !in local.value.labels }
                if (missing.isNotEmpty()) {
                    val found = missing.mapNotNull { k -> repo.rowLabel(k.first, k.second)?.let { k to it } }.toMap()
                    if (found.isNotEmpty()) local.update { it.copy(labels = it.labels + found) }
                }
            }
        }
    }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            local.update { it.copy(syncing = true, result = null) }
            objects.refresh(w.companyId)
            local.update { it.copy(syncing = false, result = repo.refresh(w.companyId)) }
        }
    }

    fun decide(batch: QabulBatch, d: QabulDecision, remark: String) {
        val w = ctx.current.value ?: return
        if (local.value.busy || !remarkValid(d, remark)) return
        val ids = batch.ids
        val op = pendingOp?.takeIf { it.first == ids }?.second ?: UUID.randomUUID().toString().also { pendingOp = ids to it }
        local.update { it.copy(busy = true, note = null) }
        viewModelScope.launch {
            val r = repo.decide(w.companyId, ids, d, remark.takeIf { it.isNotBlank() }, op)
            val note = when (r) {
                is QabulResult.Done -> QabulNote.Done(d == QabulDecision.ACCEPT, ids.size)
                QabulResult.Offline -> QabulNote.Offline
                QabulResult.Forbidden -> QabulNote.Forbidden
                QabulResult.Changed -> QabulNote.Changed
                is QabulResult.Failed -> QabulNote.Failed
            }
            if (r is QabulResult.Done || r is QabulResult.Changed) { pendingOp = null; repo.forget(w.companyId, ids.toSet()) }
            local.update { it.copy(busy = false, note = note) }
            if (r is QabulResult.Done || r is QabulResult.Changed) refresh()
        }
    }

    fun dismissNote() = local.update { it.copy(note = null) }
}

/** Acceptance of the fact a foreman or master entered: per object and day, accept (fact is written) or reject with a remark the master sees. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun QabulScreen(onBack: () -> Unit, onPhoto: (Long) -> Unit, vm: QabulViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }   // "objectId|date|a" accept, "...|r" reject
    var remark by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.p8_qb_title), onBack)
        ui.note?.let { n -> NoteBanner(n, vm::dismissNote) }
        val batches = ui.batches
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            batches == null && ui.syncing -> SkeletonList(3)
            batches == null -> when (ui.result) {
                is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.p8_qb_forbidden), stringResource(R.string.p8_qb_forbidden_body))
                else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            }
            batches.isEmpty() -> EmptyState(Icons.Filled.CheckCircle, stringResource(R.string.p8_qb_empty), stringResource(R.string.p8_qb_empty_hint))
            else -> PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        Text(stringResource(R.string.p8_qb_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        UpdatedLine(ui.updatedAt, Modifier.padding(top = 4.dp))
                    }
                    items(batches, key = { it.objectId.toString() + "|" + it.date }) { b ->
                        BatchCard(b, ui, onAccept = { confirm = "${b.objectId}|${b.date}|a"; remark = "" }, onReject = { confirm = "${b.objectId}|${b.date}|r"; remark = "" }, onPhoto = { onPhoto(b.objectId) })
                    }
                }
            }
        }
    }
    val target = confirm?.split("|")?.let { p -> findBatch(ui, p[0].toLongOrNull(), p[1])?.let { it to (p[2] == "a") } }
    if (target != null) {
        val (batch, accept) = target
        val decision = if (accept) QabulDecision.ACCEPT else QabulDecision.REJECT
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(stringResource(if (accept) R.string.p8_qb_accept_title else R.string.p8_qb_reject_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(if (accept) R.string.p8_qb_accept_body else R.string.p8_qb_reject_body, batch.items.size, ui.names[batch.objectId].orEmpty()), style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(remark, { remark = it.take(500) }, label = { Text(stringResource(if (accept) R.string.p8_qb_remark_opt else R.string.p8_qb_remark)) }, minLines = 2, modifier = Modifier.fillMaxWidth(), isError = !accept && remark.isNotEmpty() && !remarkValid(decision, remark))
                }
            },
            confirmButton = {
                TextButton(enabled = remarkValid(decision, remark) && !ui.busy, onClick = { vm.decide(batch, decision, remark); confirm = null }) {
                    Text(stringResource(if (accept) R.string.p8_qb_accept else R.string.p8_qb_reject))
                }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text(stringResource(R.string.p8_cancel)) } },
        )
    }
}

private fun findBatch(ui: QabulUi, objectId: Long?, date: String): QabulBatch? = ui.batches?.firstOrNull { it.objectId == objectId && it.date == date }

@Composable
private fun NoteBanner(n: QabulNote, onDismiss: () -> Unit) {
    val (text, error) = when (n) {
        is QabulNote.Done -> stringResource(if (n.accepted) R.string.p8_qb_done_ok else R.string.p8_qb_done_rej, n.count) to false
        QabulNote.Offline -> stringResource(R.string.p8_qb_err_offline) to true
        QabulNote.Forbidden -> stringResource(R.string.p8_qb_forbidden_body) to true
        QabulNote.Changed -> stringResource(R.string.p8_qb_err_changed) to true
        QabulNote.Failed -> stringResource(R.string.p8_qb_err_failed) to true
    }
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp, 16.dp, 0.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, style = MaterialTheme.typography.bodyMedium, color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.docs_dismiss)) }
        }
    }
}

@Composable
private fun BatchCard(b: QabulBatch, ui: QabulUi, onAccept: () -> Unit, onReject: () -> Unit, onPhoto: () -> Unit) {
    WorkCard(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(ui.names[b.objectId] ?: ("#" + b.objectId), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            Text(
                formatIsoStamp(b.date) + "  ·  " + pluralStringResource(R.plurals.p1_rows, b.items.size, b.items.size),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            b.items.forEach { it -> PendingLine(it, ui.labels[b.objectId to it.rowId]) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onAccept, enabled = !ui.busy, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                    if (ui.busy) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp) else Text(stringResource(R.string.p8_qb_accept))
                }
                OutlinedButton(onClick = onReject, enabled = !ui.busy, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_qb_reject)) }
            }
            TextButton(onClick = onPhoto, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.p8_qb_photo)) }
        }
    }
}

@Composable
private fun PendingLine(p: PendingFakt, label: Pair<String, String?>?) {
    val days = waitingDays(p.created)
    val stale = days != null && days >= STALE_DAYS
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label?.first?.takeIf { it.isNotBlank() } ?: ("#" + p.rowId), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
            Text(formatVolumeSigned(p.qty) + (label?.second?.let { " $it" } ?: ""), style = MaterialTheme.typography.bodyMedium, color = if (p.qty < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
        }
        p.note?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (p.photoId != null) Text(stringResource(R.string.p8_qb_has_photo), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
        if (stale) Text(stringResource(R.string.p8_qb_stale, days ?: 0), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
    }
}
