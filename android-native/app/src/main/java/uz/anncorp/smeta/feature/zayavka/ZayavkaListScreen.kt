package uz.anncorp.smeta.feature.zayavka

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.ObjectDropdown
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.StatusChip
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.Tone
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.work.BannerViewModel
import java.time.LocalDate

internal fun statusTone(code: String): Tone = when (statusGroup(code)) {
    StatusGroup.DONE -> Tone.GOOD
    StatusGroup.CANCELLED -> Tone.BAD
    StatusGroup.DELIVERING -> Tone.INFO
    else -> Tone.WARN
}

@Composable
private fun groupLabel(g: StatusGroup): String = stringResource(
    when (g) {
        StatusGroup.ALL -> R.string.docs_filter_all
        StatusGroup.OPEN -> R.string.dl_zay_g_open
        StatusGroup.DELIVERING -> R.string.dl_zay_g_delivering
        StatusGroup.DONE -> R.string.dl_zay_g_done
        StatusGroup.CANCELLED -> R.string.dl_zay_g_cancelled
    },
)

/** Tracking of material requests: filters (status group, object, text), a card per request with delivery progress, and a status timeline sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZayavkaListScreen(onBack: () -> Unit, onNew: () -> Unit, onOutbox: () -> Unit, vm: ZayavkaViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    var group by rememberSaveable { mutableStateOf(StatusGroup.ALL) }
    var objectId by rememberSaveable { mutableStateOf<Long?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var openId by rememberSaveable { mutableStateOf<Long?>(null) }
    val names = ui.objects.associate { it.id to it.nom }
    val counts = groupCounts(ui.requests)
    val shown = filterRequests(ui.requests, group, objectId, query)
    val today = LocalDate.now()

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.zay_title), onBack)
        if (b.visible) OutboxBanner(b, onOutbox)
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            ui.syncing && ui.requests.isEmpty() -> SkeletonList(4)
            else -> PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (ui.canWrite) item {
                        Button(onClick = onNew, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Icon(Icons.Filled.Add, null); Text(stringResource(R.string.dl_zay_new)) }
                    }
                    item {
                        ChipRow {
                            StatusGroup.values().forEach { g ->
                                FilterChip(selected = group == g, onClick = { group = g }, label = { Text(groupLabel(g) + " (" + (counts[g] ?: 0) + ")") })
                            }
                        }
                    }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.dl_zay_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            if (ui.objects.size > 1) ObjectDropdown(ui.objects, objectId, stringResource(R.string.dl_all_objects), { objectId = it }, allLabel = stringResource(R.string.dl_all_objects))
                        }
                    }
                    if (shown.isEmpty()) item {
                        Text(
                            stringResource(if (ui.requests.isEmpty() && ui.result != SyncResult.Ok) R.string.zay_load_failed else R.string.dl_zay_empty),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    items(shown, key = { it.id }) { r -> RequestCard(r, names[r.obyektId].orEmpty(), isOverdue(r, today)) { openId = r.id } }
                }
            }
        }
    }

    openId?.let { id ->
        val r = ui.requests.firstOrNull { it.id == id }
        if (r != null) {
            val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            ModalBottomSheet(onDismissRequest = { openId = null }, sheetState = sheet) {
                RequestDetail(r, names[r.obyektId].orEmpty(), isOverdue(r, today))
            }
        }
    }
}

@Composable
private fun RequestCard(r: ZayavkaRow, objectName: String, overdue: Boolean, onClick: () -> Unit) {
    WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = onClick) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.item, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                StatusChip(statusLabel(r.status), statusTone(r.status))
            }
            Text(
                formatQty(r.qty) + " " + r.unit.orEmpty() + if (r.delivered != null && r.delivered > 0) "  (" + stringResource(R.string.zay_delivered, formatQty(r.delivered)) + ")" else "",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface,
            )
            deliveredFraction(r)?.let { f -> if (f > 0f) LinearProgressIndicator(progress = { f }, modifier = Modifier.fillMaxWidth()) }
            Text(objectName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            r.required?.let {
                Text(
                    stringResource(if (overdue) R.string.dl_zay_overdue else R.string.zay_need_by, formatIsoStamp(it)),
                    style = MaterialTheme.typography.labelMedium, color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RequestDetail(r: ZayavkaRow, objectName: String, overdue: Boolean) {
    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(r.item, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(objectName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.dl_zay_asked, formatQty(r.qty), r.unit.orEmpty()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(stringResource(R.string.dl_zay_delivered_total, formatQty(r.delivered), r.unit.orEmpty()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        r.remaining?.let { Text(stringResource(R.string.dl_zay_remaining, formatQty(it), r.unit.orEmpty()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
        deliveredFraction(r)?.let { LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) }
        r.priority?.let { Text(stringResource(R.string.dl_zay_priority, priorityLabel(it)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
        r.required?.let {
            Text(stringResource(if (overdue) R.string.dl_zay_overdue else R.string.zay_need_by, formatIsoStamp(it)), style = MaterialTheme.typography.bodyMedium, color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
        }
        r.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(stringResource(R.string.dl_zay_timeline), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 10.dp))
        timeline(r.status).forEach { s -> TimelineRow(s, r) }
        r.created?.let { Text(stringResource(R.string.dl_zay_created, formatIsoStamp(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)) }
        r.updated?.let { Text(stringResource(R.string.dl_zay_updated, formatIsoStamp(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun TimelineRow(s: TimelineStep, r: ZayavkaRow) {
    val color = when (s.state) {
        StepState.DONE -> MaterialTheme.colorScheme.secondary
        StepState.CURRENT -> MaterialTheme.colorScheme.primary
        StepState.CANCELLED -> MaterialTheme.colorScheme.error
        StepState.TODO -> MaterialTheme.colorScheme.outlineVariant
    }
    Row(Modifier.fillMaxWidth().heightIn(min = 36.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(14.dp).clip(CircleShape).background(color))
        Text(
            statusLabel(s.code) + when (s.state) {
                StepState.CURRENT -> "  -  " + stringResource(R.string.dl_zay_now)
                StepState.DONE -> "  -  " + stringResource(R.string.dl_zay_passed)
                else -> ""
            },
            style = MaterialTheme.typography.bodyMedium, color = if (s.state == StepState.TODO) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
        )
    }
}
