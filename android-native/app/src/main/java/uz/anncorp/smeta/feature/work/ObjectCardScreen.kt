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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.Totals
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.InfoTip
import uz.anncorp.smeta.core.ui.LegendDot
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.RingGauge
import uz.anncorp.smeta.core.ui.Skeleton
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ObjectCardScreen(
    onBack: () -> Unit, onEnterFakt: (Long) -> Unit, onPhoto: (Long) -> Unit, onOutbox: () -> Unit,
    onSmeta: (Long) -> Unit = {}, onF2: (Long) -> Unit = {}, onDocs: (Long) -> Unit = {}, onJarvis: (Long) -> Unit = {},
    vm: ObjectCardViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel(),
) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(ui.obyekt?.nom ?: stringResource(R.string.p1_card_title), onBack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutboxBanner(b, onOutbox)
            PullToRefreshBox(isRefreshing = ui.syncing && ui.rows > 0, onRefresh = { vm.refresh() }, modifier = Modifier.weight(1f).fillMaxWidth()) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                    ValueCard(ui)
                    Spacer(Modifier.height(12.dp))
                    ProgressCard(ui)
                    if (ui.sections.size > 1) { Spacer(Modifier.height(12.dp)); SectionsCard(ui) }
                    if (!ui.f2.isNullOrEmpty()) { Spacer(Modifier.height(12.dp)); F2TimelineCard(ui.f2.orEmpty(), onMore = { onF2(vm.id) }) }
                    if (ui.result is SyncResult.Forbidden) { Spacer(Modifier.height(12.dp)); RestrictedCard() }
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        UpdatedLine(ui.updatedAt, Modifier.weight(1f))
                        if (ui.syncing) Skeleton(Modifier.width(40.dp), 8.dp)
                    }
                    if (ui.result is SyncResult.Offline) Text(stringResource(R.string.p1_card_offline), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                    if (ui.result is SyncResult.Failed) Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.err_server), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                        TextButton(onClick = { vm.refresh() }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.retry)) }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Button(onClick = { onEnterFakt(vm.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                    Icon(Icons.Filled.Create, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.p1_card_enter_fakt), style = MaterialTheme.typography.titleSmall)
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onPhoto(vm.id) }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                        Icon(Icons.Filled.CameraAlt, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.p5_btn_photo), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                    }
                    OutlinedButton(onClick = { onSmeta(vm.id) }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                        Icon(Icons.Outlined.AccountTree, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.p5_btn_smeta), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                    }
                    OutlinedButton(onClick = { onF2(vm.id) }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                        Icon(Icons.Outlined.Description, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.p5_btn_f2), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onDocs(vm.id) }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                        Icon(Icons.Outlined.Folder, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.docs_button), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                    }
                    OutlinedButton(onClick = { onJarvis(vm.id) }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                        Icon(Icons.Filled.AutoAwesome, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.mod_jarvis), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun ValueCard(ui: CardUi) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.m_object_value), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                InfoTip(stringResource(R.string.tip_qqs_t), stringResource(R.string.tip_qqs_b), Modifier.size(32.dp))
            }
            Spacer(Modifier.height(2.dp))
            // QQS-inclusive first, then with / without markup. All three come from the server package; without it only the
            // markup-free figure is known (the object list total), the rest stays a dash.
            MoneyDual(displayMoney(ui.money?.smeta, ui.obyekt?.jami), showVat = true, hint = true)
            if ((ui.obyekt?.narxsiz ?: 0) > 0) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.width(16.dp))
                    Spacer(Modifier.width(6.dp))
                    val n = ui.obyekt?.narxsiz ?: 0
                    Text(pluralStringResource(R.plurals.p1_card_unpriced_warn, n, n), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }
    }
}

@Composable
private fun ProgressCard(ui: CardUi) {
    val t: Totals? = ui.totals
    // Prefer the server's own progress percentages (the boss panel read); the cached rows are the offline fallback.
    val factPct = ui.money?.factPct ?: t?.faktPercent
    val f2Pct = ui.money?.f2Pct ?: t?.f2Percent
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.p1_card_progress), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                InfoTip(stringResource(R.string.tip_progress_t), stringResource(R.string.tip_progress_b))
            }
            Spacer(Modifier.height(8.dp))
            if (t == null && ui.money == null) {
                Text(stringResource(R.string.p1_card_no_progress), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                return@Column
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                RingGauge(factPct, f2Pct, ChartColors.fact, ChartColors.f2, size = 116.dp)
                Spacer(Modifier.width(16.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    LegendDot(ChartColors.fact, stringResource(R.string.p1_card_fakt))
                    LegendDot(ChartColors.f2, stringResource(R.string.p1_card_f2))
                    Text(stringResource(R.string.p5_ring_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(14.dp))
            ProgressRow(stringResource(R.string.p1_card_fakt), factPct, ui.money?.fakt, t?.fakt, ChartColors.fact, stringResource(R.string.tip_fakt_t), stringResource(R.string.tip_fakt_b))
            Spacer(Modifier.height(16.dp))
            ProgressRow(stringResource(R.string.p1_card_f2), f2Pct, ui.money?.f2, t?.f2, ChartColors.f2, stringResource(R.string.tip_f2_t), stringResource(R.string.tip_f2_b))
            if (t != null) {
                Spacer(Modifier.height(10.dp))
                Text(pluralStringResource(R.plurals.p1_rows, t.rows, t.rows), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Fact / F-2 line: percent + bar, then the amount both with and without markup (server package; cached-rows sum as the markup-free fallback). */
@Composable
private fun ProgressRow(label: String, percent: Double?, pack: uz.anncorp.smeta.core.data.SumPack?, plainFallback: Double?, color: androidx.compose.ui.graphics.Color, tipTitle: String, tipBody: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        PercentBar(label, percent, color, Modifier.weight(1f))
        InfoTip(tipTitle, tipBody, Modifier.size(32.dp))
    }
    Spacer(Modifier.height(6.dp))
    MoneyDual(displayMoney(pack, plainFallback))
}

/** Progress per section (bo'lim): fact and F-2 percent of each section's estimate, estimate order; top sections first, the rest on demand. */
@Composable
private fun SectionsCard(ui: CardUi) {
    var all by remember { mutableStateOf(false) }
    val shown = if (all) ui.sections else ui.sections.take(5)
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.p5_sections), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                InfoTip(stringResource(R.string.p5_sections), stringResource(R.string.p5_sections_tip))
            }
            Spacer(Modifier.height(8.dp))
            shown.forEach { s ->
                Text(s.name ?: stringResource(R.string.p5_section_other), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                Spacer(Modifier.height(4.dp))
                PercentBar(stringResource(R.string.p1_card_fakt), s.factPercent, ChartColors.fact, barHeight = 6.dp)
                Spacer(Modifier.height(4.dp))
                PercentBar(stringResource(R.string.p1_card_f2), s.f2Percent, ChartColors.f2, barHeight = 6.dp)
                Spacer(Modifier.height(12.dp))
            }
            if (ui.sections.size > 5) TextButton(onClick = { all = !all }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (all) stringResource(R.string.p5_show_less) else stringResource(R.string.p5_show_all, ui.sections.size))
            }
        }
    }
}

/** Last F-2 acts as a vertical timeline (newest first): month, number, status. */
@Composable
private fun F2TimelineCard(acts: List<F2Act>, onMore: () -> Unit) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.p5_f2_timeline), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                TextButton(onClick = onMore, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.p5_all_f2)) }
            }
            acts.take(5).forEachIndexed { i, a ->
                val last = i == minOf(acts.size, 5) - 1
                val dot = MaterialTheme.colorScheme.primary
                Row(Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min).heightIn(min = 52.dp)) {
                    androidx.compose.foundation.Canvas(Modifier.width(24.dp).fillMaxSize()) {
                        val cx = size.width / 2
                        drawCircle(dot, 7f, androidx.compose.ui.geometry.Offset(cx, 14f))
                        if (!last) drawLine(androidx.compose.ui.graphics.Color.Gray.copy(alpha = 0.4f), androidx.compose.ui.geometry.Offset(cx, 14f), androidx.compose.ui.geometry.Offset(cx, size.height), strokeWidth = 3f)
                    }
                    Column(Modifier.weight(1f).padding(bottom = 10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(R.string.f2_act_title, a.raqam ?: ("#" + a.id)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                            uz.anncorp.smeta.feature.f2.StatusChip(a.state)
                        }
                        Text(f2MonthLabel(a.oy) ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
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
