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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.core.data.KIND_PHOTO
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.core.ui.formatStamp

@Composable
fun OutboxScreen(onBack: () -> Unit, onEditDraft: (Long) -> Unit, vm: OutboxViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { WorkTopBar(stringResource(R.string.p1_outbox_title), onBack) }) { pad ->
        if (ui.active.isEmpty() && ui.done.isEmpty()) {
            CenterMessage(null, stringResource(R.string.p1_outbox_empty), null, modifier = Modifier.padding(pad))
        } else LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (ui.active.isNotEmpty()) item(key = "h1") { Text(stringResource(R.string.p1_active), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(ui.active, key = { it.id }) { e -> EntryCard(e, vm, onEditDraft) }
            if (ui.done.isNotEmpty()) item(key = "h2") { Spacer(Modifier.height(8.dp)); Text(stringResource(R.string.p1_recent), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(ui.done, key = { "d" + it.id }) { e -> EntryCard(e, vm, onEditDraft) }
        }
    }
}

@Composable
private fun EntryCard(e: OutboxEntity, vm: OutboxViewModel, onEditDraft: (Long) -> Unit) {
    val (label, color) = when (e.state) {
        OutboxState.FAILED -> stringResource(R.string.p1_state_failed) to MaterialTheme.colorScheme.error
        OutboxState.PAUSED -> stringResource(R.string.p1_state_paused) to MaterialTheme.colorScheme.tertiary
        OutboxState.DONE -> stringResource(R.string.p1_state_done) to MaterialTheme.colorScheme.secondary
        else -> stringResource(R.string.p1_state_pending) to MaterialTheme.colorScheme.primary
    }
    WorkCard {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(uz.anncorp.smeta.feature.ombor.outboxTitle(e), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                    Text(if (e.kind == KIND_PHOTO) stringResource(R.string.p2_photo_entry) + " · " + formatStamp(e.createdAt).orEmpty() else pluralStringResource(R.plurals.p1_outbox_lines, e.lineCount, e.lineCount, formatStamp(e.createdAt).orEmpty()), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.16f)) {
                    Text(label, style = MaterialTheme.typography.labelMedium, color = color, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
            if (e.attempts > 0 && e.state != OutboxState.DONE) Text(stringResource(R.string.p1_attempts, e.attempts), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (e.state == OutboxState.FAILED && e.lastError != null) {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.p1_reason, e.lastError), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            if (e.state == OutboxState.DONE) DoneInfo(e.info)
            if (e.state == OutboxState.FAILED) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (e.kind != KIND_PHOTO && !uz.anncorp.smeta.feature.ombor.isOmborKind(e.kind) && !uz.anncorp.smeta.feature.zayavka.isZayavkaKind(e.kind) && !uz.anncorp.smeta.feature.m29.isM29Kind(e.kind) && !uz.anncorp.smeta.feature.naryad.isNaryadKind(e.kind)) OutlinedButton(onClick = { vm.edit(e.id, onEditDraft) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_edit)) }
                    OutlinedButton(onClick = { vm.retry(e.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_retry_now)) }
                    TextButton(onClick = { vm.delete(e.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_remove), color = MaterialTheme.colorScheme.error) }
                }
            } else if (e.state != OutboxState.DONE) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { vm.retry(e.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_send_now)) }
                    TextButton(onClick = { vm.delete(e.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_remove), color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

/** Server-side findings of a sent write: document number, rows over the estimate, rows without a price. */
@Composable
private fun DoneInfo(info: String?) {
    val o = info?.let { runCatching { Json.parseToJsonElement(it).obj() }.getOrNull() } ?: return
    val warn: Color = MaterialTheme.colorScheme.tertiary
    Column(Modifier.padding(top = 6.dp)) {
        o["raqam"].str()?.let { Text(stringResource(R.string.p1_sent_doc, it) + o["jami"].num()?.let { j -> " · " + formatMoney(j) }.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface) }
        o["over"].arr()?.forEach { w ->
            val wo = w.obj() ?: return@forEach
            Text(stringResource(R.string.p1_warn_over, wo["nom"].str().orEmpty()), style = MaterialTheme.typography.bodySmall, color = warn)
        }
        val unpriced = o["narxsiz"].num()?.toInt() ?: 0
        if (unpriced > 0) Text(pluralStringResource(R.plurals.p1_warn_unpriced, unpriced, unpriced), style = MaterialTheme.typography.bodySmall, color = warn)
    }
}
