package uz.anncorp.smeta.feature.work

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.data.formatVolumeSigned
import uz.anncorp.smeta.core.data.faktAfter
import uz.anncorp.smeta.core.data.toggleMinus
import uz.anncorp.smeta.core.data.volumeSplit
import uz.anncorp.smeta.core.ui.InfoTip
import uz.anncorp.smeta.core.ui.StackedVolumeBar
import uz.anncorp.smeta.feature.smeta.VolumeLegend
import uz.anncorp.smeta.core.data.parseVolume
import uz.anncorp.smeta.core.db.DraftEntity
import uz.anncorp.smeta.core.db.QatorEntity
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar

@Composable
fun FaktScreen(onBack: () -> Unit, onDraft: (Long) -> Unit, onOutbox: () -> Unit, vm: FaktViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<QatorEntity?>(null) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(ui.title.ifBlank { stringResource(R.string.p1_card_enter_fakt) }, onBack) },
        bottomBar = { if (ui.drafted.isNotEmpty()) DraftBar(ui.drafted.size) { onDraft(vm.id) } },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutboxBanner(b, onOutbox)
            OutlinedTextField(
                value = ui.query, onValueChange = vm::setQuery, singleLine = true,
                placeholder = { Text(stringResource(R.string.p1_fakt_search)) },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = { if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, null) } },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).heightIn(min = TouchTarget),
            )
            if (ui.sections.size > 1) {
                androidx.compose.foundation.lazy.LazyRow(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    item {
                        FilterChip(selected = ui.section == null, onClick = { vm.setSection(null) }, label = { Text(stringResource(R.string.p2_section_all)) })
                    }
                    items(ui.sections) { s ->
                        FilterChip(selected = ui.section == s, onClick = { vm.setSection(if (ui.section == s) null else s) }, label = { Text(s, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 220.dp)) })
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                UpdatedLine(ui.updatedAt, Modifier.weight(1f))
                if (ui.syncing) CircularProgressIndicator(Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    ui.results.isEmpty() && ui.syncing && ui.rowCount == 0 -> uz.anncorp.smeta.core.ui.SkeletonList(5)
                    ui.results.isEmpty() && ui.rowCount == 0 -> when (ui.result) {
                        is SyncResult.Offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.p1_fakt_offline_empty), null, stringResource(R.string.retry)) { vm.refresh() }
                        is SyncResult.Forbidden -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_fakt_forbidden))
                        else -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.err_server), null, stringResource(R.string.retry)) { vm.refresh() }
                    }
                    ui.results.isEmpty() -> CenterMessage(Icons.Filled.Search, stringResource(R.string.p1_fakt_empty))
                    else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 6.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(ui.results, key = { it.rid }) { row -> RowCard(row, ui.drafted[row.qatorId]) { editing = row } }
                    }
                }
            }
        }
    }

    editing?.let { row ->
        VolumeDialog(
            title = row.nom, kod = row.kod, unit = row.birlik, smeta = row.smetaHajm, fakt = row.faktHajm, left = row.qoldiq,
            initial = ui.drafted[row.qatorId]?.hajm,
            f2 = row.f2Hajm, almashtirilgan = row.almashtirilgan,
            onDismiss = { editing = null },
            onConfirm = { v -> vm.addToDraft(row, v); editing = null },
            onRemove = if (ui.drafted.containsKey(row.qatorId)) ({ vm.removeFromDraft(row.qatorId); editing = null }) else null,
        )
    }
}

@Composable
private fun DraftBar(count: Int, onOpen: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(pluralStringResource(R.plurals.p1_draft_bar, count, count), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            Button(onClick = onOpen, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_open)) }
        }
    }
}

@Composable
private fun RowCard(row: QatorEntity, draft: DraftEntity?, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    row.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                    Text(row.nom, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 3)
                }
                row.birlik?.takeIf { it.isNotBlank() }?.let {
                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceContainerHighest, modifier = Modifier.padding(start = 8.dp)) {
                        Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth()) {
                Stat(stringResource(R.string.p1_row_smeta), formatVolume(row.smetaHajm), Modifier.weight(1f))
                Stat(stringResource(R.string.p1_row_fakt), formatVolume(row.faktHajm), Modifier.weight(1f))
                Stat(stringResource(R.string.p1_row_left), formatVolume(row.qoldiq), Modifier.weight(1f), warn = (row.qoldiq ?: 0.0) < 0)
            }
            volumeSplit(row.smetaHajm, row.faktHajm, row.f2Hajm, row.almashtirilgan)?.let { sp ->
                Spacer(Modifier.height(8.dp))
                StackedVolumeBar(sp.f2, sp.factOnly, sp.open, sp.over, barHeight = 8.dp)
            }
            if (draft != null) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.width(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.p1_in_draft) + ": " + formatVolumeSigned(draft.hajm), style = MaterialTheme.typography.labelLarge, color = if (draft.hajm < 0.0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary)
                }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier = Modifier, warn: Boolean = false) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

/**
 * Volume entry for one row. Comma or dot accepted, and a MINUS is allowed: the web (and fakt_yoz_v2) take negative volumes for
 * "normaga keltirish" / recalculation. Decimal keypads often have no minus key, so a big sign key sits next to the field; a
 * typed «-», «−» or «–» works as well. Negative values are red with a true minus sign. Exceeding the estimate, or taking the
 * row's total fact below zero, only WARNS (the server also only warns).
 */
@Composable
fun VolumeDialog(
    title: String, kod: String?, unit: String?, smeta: Double?, fakt: Double, left: Double?, initial: Double?,
    onDismiss: () -> Unit, onConfirm: (Double) -> Unit, onRemove: (() -> Unit)? = null,
    f2: Double? = null, almashtirilgan: Double = 0.0,
) {
    var text by rememberSaveable { mutableStateOf(initial?.let { formatVolume(it).replace("\u00A0", "") } ?: "") }
    val value = parseVolume(text)
    val invalid = text.isNotBlank() && text.trim() != "-" && (value == null || value == 0.0)
    val negative = value != null && value < 0.0
    val exceeds = value != null && value > 0.0 && left != null && value > left + 1e-9
    val after = if (value != null && value != 0.0) faktAfter(fakt, value) else null
    val below = negative && after != null && after < -1e-9
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Column { kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }; Text(title, maxLines = 3, style = MaterialTheme.typography.titleMedium) } },
        text = {
            Column {
                Row(Modifier.fillMaxWidth()) {
                    Stat(stringResource(R.string.p1_row_smeta), formatVolume(smeta), Modifier.weight(1f))
                    Stat(stringResource(R.string.p1_row_fakt), formatVolume(fakt), Modifier.weight(1f))
                    Stat(stringResource(R.string.p1_row_left), formatVolume(left), Modifier.weight(1f), warn = (left ?: 0.0) < 0)
                }
                volumeSplit(smeta, fakt, f2 ?: 0.0, almashtirilgan)?.takeIf { f2 != null }?.let { sp ->
                    Spacer(Modifier.height(8.dp))
                    StackedVolumeBar(sp.f2, sp.factOnly, sp.open, sp.over)
                    Spacer(Modifier.height(4.dp))
                    VolumeLegend()
                }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = text, onValueChange = { text = it }, singleLine = true,
                        label = { Text(stringResource(R.string.p1_volume)) },
                        suffix = { unit?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.titleMedium) } },
                        isError = invalid,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        textStyle = MaterialTheme.typography.headlineSmall.copy(color = if (negative) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface),
                        modifier = Modifier.weight(1f).focusRequester(focus),
                    )
                    Spacer(Modifier.width(8.dp))
                    // Sign key: flips the sign of whatever is typed (Decimal keypads often have no minus).
                    FilledTonalButton(
                        onClick = { text = toggleMinus(text) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                        colors = if (negative) ButtonDefaults.filledTonalButtonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer) else ButtonDefaults.filledTonalButtonColors(),
                        modifier = Modifier.size(TouchTarget),
                    ) { Text("\u00B1", style = MaterialTheme.typography.headlineSmall) }
                    InfoTip(stringResource(R.string.p5_minus_tip_t), stringResource(R.string.p5_minus_tip_b))
                }
                if (invalid) Text(stringResource(R.string.p1_volume_invalid), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                if (negative && !below) {
                    Text(stringResource(R.string.p5_minus_row), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                }
                if (below) {
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.width(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.p5_minus_below_zero, formatVolumeSigned(after)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
                if (exceeds) {
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.width(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.p1_exceeds, formatVolume(left)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { if (value != null && value != 0.0) onConfirm(value) }, enabled = value != null && value != 0.0, modifier = Modifier.heightIn(min = TouchTarget)) {
                Text(stringResource(if (initial == null) R.string.p1_add_to_draft else R.string.p1_update))
            }
        },
        dismissButton = {
            Row {
                if (onRemove != null) TextButton(onClick = onRemove, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_remove), color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p1_cancel)) }
            }
        },
    )
}