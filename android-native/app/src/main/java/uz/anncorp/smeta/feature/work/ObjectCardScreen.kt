package uz.anncorp.smeta.feature.work

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.Totals
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.data.withVat
import uz.anncorp.smeta.core.ui.MoneyLine
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar

@Composable
fun ObjectCardScreen(onBack: () -> Unit, onEnterFakt: (Long) -> Unit, onOutbox: () -> Unit, vm: ObjectCardViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(ui.obyekt?.nom ?: stringResource(R.string.p1_card_title), onBack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutboxBanner(b, onOutbox)
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
                ValueCard(ui)
                Spacer(Modifier.height(12.dp))
                ProgressCard(ui)
                if (ui.result is SyncResult.Forbidden) { Spacer(Modifier.height(12.dp)); RestrictedCard() }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    UpdatedLine(ui.updatedAt, Modifier.weight(1f))
                    if (ui.syncing) CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp)
                }
                if (ui.result is SyncResult.Offline) Text(stringResource(R.string.p1_card_offline), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                if (ui.result is SyncResult.Failed) Text(stringResource(R.string.err_server), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Button(
                onClick = { onEnterFakt(vm.id) }, modifier = Modifier.fillMaxWidth().padding(16.dp).heightIn(min = TouchTarget),
            ) {
                Icon(Icons.Filled.Create, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.p1_card_enter_fakt), style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

@Composable
private fun ValueCard(ui: CardUi) {
    val net = ui.obyekt?.jami
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.p1_card_value), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // QQS-inclusive value first (owner rule); the QQS-free, markup-free estimate total follows.
            Text(stringResource(R.string.p1_vat_incl), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(if (net == null) stringResource(R.string.p1_no_total) else formatMoney(withVat(net)), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(8.dp))
            MoneyLine(stringResource(R.string.p1_card_smeta_net), net)
            Text(stringResource(R.string.p1_card_markup_note), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if ((ui.obyekt?.narxsiz ?: 0) > 0) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.width(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.p1_card_unpriced_warn, ui.obyekt?.narxsiz ?: 0), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }
    }
}

@Composable
private fun ProgressCard(ui: CardUi) {
    val t: Totals? = ui.totals
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.p1_card_progress), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            if (t == null) {
                Text(stringResource(R.string.p1_card_no_progress), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                return@Column
            }
            ProgressRow(stringResource(R.string.p1_card_fakt), t.fakt, t.faktPercent, MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.height(14.dp))
            ProgressRow(stringResource(R.string.p1_card_f2), t.f2, t.f2Percent, MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.p1_rows, t.rows), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ProgressRow(label: String, value: Double?, percent: Double?, color: androidx.compose.ui.graphics.Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
        Text(formatPercent(percent), style = MaterialTheme.typography.titleMedium, color = color)
    }
    Spacer(Modifier.height(6.dp))
    LinearProgressIndicator(
        progress = { ((percent ?: 0.0) / 100.0).coerceIn(0.0, 1.0).toFloat() },
        modifier = Modifier.fillMaxWidth().height(8.dp), color = color, trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
    )
    Spacer(Modifier.height(4.dp))
    Text(formatMoney(value), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun RestrictedCard() {
    WorkCard {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Filled.Lock, null, tint = MaterialTheme.colorScheme.tertiary)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(stringResource(R.string.p1_card_no_access_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.p1_card_no_access_body), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
