package uz.anncorp.smeta.feature.f2

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.F2Status
import uz.anncorp.smeta.core.data.SumPack
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.f2CanReject
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.f2NextStep
import uz.anncorp.smeta.core.data.f2StepLabel
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.data.serverErrorText
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar

/** F-2 workbench: rows by section, the three server sums, edit volume / price / remove, preview -> Tasdiqlash, texnadzor suggestions, lifecycle step. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun F2DraftScreen(onBack: () -> Unit, vm: F2DraftViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<DraftRow?>(null) }
    var rejecting by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    val page = ui.page
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.f2d_title) + (page?.head?.raqam?.let { " · $it" } ?: ""), onBack)
        when {
            ui.loading && page == null -> SkeletonList(5)
            page == null -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.f2d_load_error), stringResource(R.string.retry)) { vm.load() }
            else -> {
                val removed = ui.edits.removed
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 4.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Head(page, ui, vm) }
                    if (ui.suggestions.isNotEmpty()) item { SuggestionSummaryCard(ui.suggestions) }
                    if (page.rows.isEmpty()) item { Text(stringResource(R.string.f2d_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    ui.sections.forEach { (name, rows) ->
                        item(key = "h" + (name ?: "")) { Text(name ?: stringResource(R.string.f2d_no_section), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp)) }
                        items(rows, key = { it.qatorId }) { r ->
                            RowCard(r, ui.edits.changes[r.qatorId], r.qatorId in removed, page.head.editable, { editing = r }, { vm.restore(r.qatorId) })
                            ui.suggestions.filter { it.qatorId == r.qatorId && !it.stale }.forEach { s -> SuggestionCard(s, busy = ui.review != null, onAccept = { vm.accept(s) }, onReject = { why -> vm.reject(s, why) }, onLater = { vm.later(s) }) }
                        }
                    }
                }
                Footer(page, ui, vm, rejecting, reason, { rejecting = it }, { reason = it })
            }
        }
    }
    editing?.let { r -> ModalBottomSheet(onDismissRequest = { editing = null }) { EditSheet(r, ui.edits.changes[r.qatorId], { c -> vm.setChange(r.qatorId, c); editing = null }, { vm.remove(r.qatorId); editing = null }) } }
    ui.review?.let { rv -> ModalBottomSheet(onDismissRequest = { if (!rv.busy) vm.cancelReview() }) { ReviewSheet(rv, { vm.confirm() }, { vm.cancelReview() }) } }
}

@Composable
private fun Head(page: DraftPage, ui: DraftUi, vm: F2DraftViewModel) {
    val st = F2Status.of(page.head.lifecycle ?: page.head.holat)
    WorkCard {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(listOfNotNull(f2MonthLabel(page.head.oy), page.head.versiya?.let { "v$it" }).joinToString(" · "), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                StatusChip(st)
            }
            if (!page.head.editable) Text(stringResource(R.string.f2d_read_only), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.f2d_sums), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // The three figures come from the server package (QQS bilan, ustamali, ustamasiz); never summed on the phone.
            MoneyDual(displayMoney(page.sums, null), showVat = true)
            if ((page.unpriced ?: 0) > 0) Text(stringResource(R.string.f2d_unpriced, page.unpriced ?: 0), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
            ui.message?.let { Text(messageText(it), style = MaterialTheme.typography.bodySmall, color = if (it == "saved" || it == "step") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun messageText(m: String) = when (m) { "saved" -> stringResource(R.string.f2d_saved); "step" -> stringResource(R.string.f2d_stepped); else -> m }

@Composable
private fun RowCard(r: DraftRow, c: RowChange?, removed: Boolean, editable: Boolean, onEdit: () -> Unit, onRestore: () -> Unit) {
    val changed = c != null && !c.isEmpty
    WorkCard(onClick = if (editable && !removed) onEdit else null, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(listOfNotNull(r.kod, r.nom).joinToString("  "), style = MaterialTheme.typography.bodyMedium, textDecoration = if (removed) TextDecoration.LineThrough else null)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val vol = c?.hajm ?: r.hajm; val price = c?.narx ?: r.narx
                Text(formatVolume(vol) + (r.birlik?.let { " $it" } ?: ""), style = MaterialTheme.typography.labelLarge, color = if (c?.hajm != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                Text(formatMoney(price), style = MaterialTheme.typography.labelLarge, color = if (c?.narx != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                // The row sum is the server's; after a local edit it is stale, so it is hidden until the preview shows the new one.
                if (!changed && !removed) Text(r.summa?.let { formatMoney(it) } ?: "—", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (removed) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.f2d_removed), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                TextButton(onClick = onRestore) { Text(stringResource(R.string.f2d_restore)) }
            }
        }
    }
}

@Composable
private fun EditSheet(r: DraftRow, cur: RowChange?, onApply: (RowChange?) -> Unit, onRemove: () -> Unit) {
    var vol by remember(r.qatorId) { mutableStateOf(cur?.hajm?.let { formatVolume(it).replace(" ", "") } ?: "") }
    var price by remember(r.qatorId) { mutableStateOf(cur?.narx?.let { formatVolume(it).replace(" ", "") } ?: "") }
    val v = if (vol.isBlank()) null else checkVolume(vol); val p = if (price.isBlank()) null else checkPrice(price)
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.f2d_edit_title), style = MaterialTheme.typography.titleMedium)
        Text(listOfNotNull(r.kod, r.nom).joinToString("  "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(vol, { vol = it }, label = { Text(stringResource(R.string.f2d_volume) + (r.birlik?.let { " · $it" } ?: "") + " · " + formatVolume(r.hajm)) }, singleLine = true,
            isError = v?.second != null, supportingText = { v?.second?.let { Text(fieldText(it, false)) } }, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Text))
        OutlinedTextField(price, { price = it }, label = { Text(stringResource(R.string.f2d_price) + " · " + formatMoney(r.narx)) }, singleLine = true,
            isError = p?.second != null, supportingText = { p?.second?.let { Text(fieldText(it, true)) } }, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal))
        val valid = (vol.isBlank() || v?.second == null) && (price.isBlank() || p?.second == null)
        Button(onClick = { onApply(RowChange(v?.first, p?.first)) }, enabled = valid, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_apply)) }
        OutlinedButton(onClick = onRemove, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_remove)) }
    }
}

@Composable
private fun fieldText(i: FieldIssue, price: Boolean) = stringResource(when (i) { FieldIssue.ZERO -> R.string.f2d_vol_zero; FieldIssue.NEGATIVE -> R.string.f2d_price_neg; else -> R.string.f2d_vol_bad })

@Composable
private fun Footer(page: DraftPage, ui: DraftUi, vm: F2DraftViewModel, rejecting: Boolean, reason: String, setRejecting: (Boolean) -> Unit, setReason: (String) -> Unit) {
    val st = F2Status.of(page.head.lifecycle ?: page.head.holat)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (!ui.edits.isEmpty) {
            Button(onClick = { vm.review() }, enabled = editFits(ui.edits), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_review, ui.edits.count)) }
            TextButton(onClick = { vm.discard() }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.f2d_discard)) }
        } else {
            // Lifecycle: the database decides who may press what (permissions, separation of duties); a refusal is shown as the server's sentence.
            f2StepLabel(st)?.let { label -> Button(onClick = { f2NextStep(st)?.let { vm.step(it, null) } }, enabled = !ui.stepBusy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(label) } }
            if (f2CanReject(st)) {
                OutlinedButton(onClick = { setRejecting(!rejecting) }, enabled = !ui.stepBusy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2_reject)) }
                if (rejecting) {
                    OutlinedTextField(reason, setReason, label = { Text(stringResource(R.string.f2_reject_reason)) }, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { if (reason.isNotBlank()) vm.step(F2Status.REJECTED, reason) }, enabled = !ui.stepBusy && reason.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2_reject_confirm)) }
                }
            }
        }
    }
}

@Composable
private fun SuggestionSummaryCard(list: List<Suggestion>) {
    val s = summarize(list)
    WorkCard {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stringResource(R.string.f2d_sug_title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.f2d_sug_summary, s.total, s.resolved) + (if (s.docsAwaited > 0) " · " + stringResource(R.string.f2d_sug_docs, s.docsAwaited) else ""), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.f2d_sug_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SuggestionCard(s: Suggestion, busy: Boolean, onAccept: () -> Unit, onReject: (String) -> Unit, onLater: () -> Unit) {
    var rejecting by remember(s.id) { mutableStateOf(false) }
    var why by remember(s.id) { mutableStateOf("") }
    WorkCard {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val flag = when (s.flag) { SuggestFlag.REMOVE -> R.string.f2d_sug_remove; SuggestFlag.WRONG_VOLUME -> R.string.f2d_sug_wrong; SuggestFlag.NEEDS_DOC -> R.string.f2d_sug_doc; SuggestFlag.OK -> R.string.f2d_sug_accept; null -> null }
            Text(listOfNotNull(stringResource(R.string.f2d_sug_title), flag?.let { stringResource(it) }, if (s.addRow) stringResource(R.string.f2d_sug_add) else null).joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
            if (s.suggestedVolume != null) Text(stringResource(R.string.f2d_sug_vol, formatVolume(s.currentVolume), formatVolume(s.suggestedVolume), s.birlik ?: ""), style = MaterialTheme.typography.bodyMedium)
            s.note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            if (!s.pending) {
                Text(stringResource(if (s.decision == SuggestDecision.ACCEPTED) R.string.f2d_sug_accepted else if (s.decision == SuggestDecision.REJECTED) R.string.f2d_sug_rejected else R.string.f2d_sug_later) + (s.decisionReason?.let { " · $it" } ?: ""), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onAccept, enabled = !busy, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_sug_accept)) }
                    OutlinedButton(onClick = { rejecting = !rejecting }, enabled = !busy, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_sug_reject)) }
                    TextButton(onClick = onLater, enabled = !busy, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_sug_later)) }
                }
                if (rejecting) {
                    OutlinedTextField(why, { why = it }, label = { Text(stringResource(R.string.f2d_sug_reason)) }, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { onReject(why); rejecting = false }, enabled = reasonValid(SuggestDecision.REJECTED, why), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_sug_reject_send)) }
                }
            }
        }
    }
}

@Composable
private fun ReviewSheet(rv: Review, onConfirm: () -> Unit, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.f2d_preview_title) + if (rv.steps > 1) " · " + stringResource(R.string.f2d_step, rv.step + 1, rv.steps) else "", style = MaterialTheme.typography.titleMedium)
        val p = rv.preview
        if (p == null && rv.busy) SkeletonList(2)
        rv.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        if (p != null) {
            p.title?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            LazyColumn(Modifier.heightIn(max = 260.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(p.rows, key = { it.qatorId }) { row ->
                    Column {
                        Text(listOfNotNull(row.kod, row.nom).joinToString("  ").ifBlank { "#${row.qatorId}" }, style = MaterialTheme.typography.bodyMedium)
                        if (row.removed) Text(stringResource(R.string.f2d_removed), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
                        row.changes.forEach { ch -> Text(fieldLabel(ch.field) + ": " + valueText(ch.field, ch.before) + " → " + valueText(ch.field, ch.after) + (row.birlik?.takeIf { ch.field == "certified_quantity" }?.let { " $it" } ?: ""), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
            Totals(p.totals)
            p.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary) }
            if (!p.rejected && p.token != null) Text(stringResource(R.string.f2d_confirm_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            p.message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        }
        Button(onClick = onConfirm, enabled = !rv.busy && rv.preview?.token != null && rv.preview.rejected.not(), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_confirm)) }
        OutlinedButton(onClick = onCancel, enabled = !rv.busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.f2d_discard)) }
    }
}

@Composable
private fun Totals(t: PreviewTotals) {
    if (t.before == null && t.after == null) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) { Text(stringResource(R.string.f2d_before), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); MoneyDual(displayMoney(t.before, null), showVat = true, short = true) }
        Column(Modifier.weight(1f)) { Text(stringResource(R.string.f2d_after), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); MoneyDual(displayMoney(t.after, null), showVat = true, short = true) }
    }
}

@Composable
private fun fieldLabel(f: String): String = when (f) { "certified_quantity" -> stringResource(R.string.f2d_volume_short); "certified_unit_price" -> stringResource(R.string.f2d_price_short); "certified_amount" -> stringResource(R.string.f2d_sum_short); else -> f }
private fun valueText(f: String, v: Double?) = if (f == "certified_quantity") formatVolume(v) else formatMoney(v)
