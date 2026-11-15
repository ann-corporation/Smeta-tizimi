package uz.anncorp.smeta.feature.work

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.db.DraftEntity
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.LocalDate

@Composable
fun DraftScreen(onBack: () -> Unit, onOutbox: () -> Unit, onSaved: () -> Unit, vm: DraftViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<DraftEntity?>(null) }
    val usta = ui.role.equals("usta", ignoreCase = true)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(stringResource(R.string.p1_draft_title), onBack) },
        bottomBar = {
            if (ui.lines.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
                Button(
                    onClick = { vm.save(onSaved) },
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).heightIn(min = TouchTarget),
                ) { Text(stringResource(R.string.p1_save_queue), style = MaterialTheme.typography.titleSmall) }
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutboxBanner(b, onOutbox)
            if (ui.lines.isEmpty()) {
                CenterMessage(null, stringResource(R.string.p1_draft_empty), stringResource(R.string.p1_draft_empty_hint))
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item(key = "head") { DateRow(ui.date, vm::setDate) }
                    item(key = "note") {
                        Row(verticalAlignment = Alignment.Top) {
                            Icon(Icons.Filled.Info, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                stringResource(if (usta) R.string.p1_draft_note_usta else R.string.p1_draft_note), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (ui.exceeding > 0) item(key = "warn") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.width(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(pluralStringResource(R.plurals.p1_exceeding_n, ui.exceeding, ui.exceeding), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary)
                        }
                    }
                    items(ui.lines, key = { it.qatorId }) { d -> DraftLine(d, onEdit = { editing = d }, onRemove = { vm.remove(d.qatorId) }) }
                }
            }
        }
    }

    editing?.let { d ->
        VolumeDialog(
            title = d.nom, kod = d.kod, unit = d.birlik, smeta = d.smetaHajm, fakt = d.faktHajm, left = d.qoldiq, initial = d.hajm,
            onDismiss = { editing = null }, onConfirm = { v -> vm.updateLine(d, v); editing = null },
            onRemove = { vm.remove(d.qatorId); editing = null },
        )
    }
}

@Composable
private fun DateRow(date: LocalDate, onPick: (LocalDate) -> Unit) {
    val today = LocalDate.now()
    Column {
        Text(stringResource(R.string.p1_date), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(selected = date == today, onClick = { onPick(today) }, label = { Text(stringResource(R.string.p1_today)) }, modifier = Modifier.heightIn(min = 48.dp))
            FilterChip(selected = date == today.minusDays(1), onClick = { onPick(today.minusDays(1)) }, label = { Text(stringResource(R.string.p1_yesterday)) }, modifier = Modifier.heightIn(min = 48.dp))
            Text(date.toString(), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun DraftLine(d: DraftEntity, onEdit: () -> Unit, onRemove: () -> Unit) {
    WorkCard(onClick = onEdit, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                d.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                Text(d.nom, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                if (d.exceeds) Text(stringResource(R.string.p1_exceeds, formatVolume(d.qoldiq)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(formatVolume(d.hajm), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(d.birlik.orEmpty(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onRemove, modifier = Modifier.heightIn(min = TouchTarget).width(TouchTarget)) { Icon(Icons.Filled.Delete, stringResource(R.string.p1_remove)) }
        }
    }
}

