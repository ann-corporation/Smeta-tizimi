package uz.anncorp.smeta.feature.ombor

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import androidx.compose.runtime.collectAsState
import java.time.LocalDate

/**
 * Android «Ombor» = site /admin/logistika -> «Sklad (qoldiq)» (frontend/src/test02/TestSklad.tsx), per C:\Temp\android-paritet\SAYT_OMBOR_ETALON.md.
 * Order: section tabs, title, warehouse picker + BERDIM / KELDI, 4 KPI cards, 7 tabs; «Omborchi» holds the sub-tabs.
 */
@Composable
fun OmborSkladScreen(onZayavka: () -> Unit, onM29: () -> Unit = {}, vm: OmborSkladViewModel = hiltViewModel(), omborVm: OmborViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var picking by rememberSaveable { mutableStateOf(false) }
    val omborUi by omborVm.state.collectAsStateWithLifecycle()
    // The voice / text command acts on the warehouse chosen here (old OmborViewModel keeps the command logic; nothing is parsed on the device).
    LaunchedEffect(ui.skladId, ui.warehouses) { ui.warehouse?.let { omborVm.setScope(OmborScope.Central(it.id, it.nomi)) } }
    var wasWorking by remember { mutableStateOf(false) }
    LaunchedEffect(omborUi.cmd.working) { if (wasWorking && !omborUi.cmd.working) vm.reload(); wasWorking = omborUi.cmd.working }
    ui.doneMessage?.let { m -> val t = stringResource(m); LaunchedEffect(m) { Toast.makeText(context, t, Toast.LENGTH_SHORT).show(); vm.consumeMessage() } }
    val sum = skladSummary(ui.rows)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // 0. section tabs (site WrapperLogistika)
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(false, onZayavka, label = { Text(stringResource(R.string.sk_sec_zayavka)) })
                FilterChip(true, {}, label = { Text(stringResource(R.string.sk_sec_sklad)) })
                FilterChip(false, {}, enabled = false, label = { Text(stringResource(R.string.sk_sec_birja)) })
                FilterChip(false, {}, enabled = false, label = { Text(stringResource(R.string.sk_sec_alias)) })
            }
        }
        // 1. title
        item {
            Text(stringResource(R.string.sk_title), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.sk_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // 2. warehouse picker + BERDIM / KELDI
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { picking = true }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                    Text(stringResource(R.string.sk_wh) + ": " + (ui.warehouse?.nomi ?: stringResource(R.string.sk_all_wh)), modifier = Modifier.weight(1f), maxLines = 1)
                    androidx.compose.material3.Icon(Icons.Filled.ArrowDropDown, null)
                }
                OutlinedButton(onClick = { vm.open(SkladSub.BERDIM) }, enabled = ui.access.write, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk_berdim_btn)) }
                Button(onClick = { vm.open(SkladSub.IN) }, enabled = ui.access.write, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk_keldi_btn)) }
                if (ui.hint) Text(stringResource(R.string.sk_pick_first), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                // «ombor yo'q» only AFTER the list has loaded (the site shows it while loading: a bug that is not repeated here).
                if (ui.loaded && ui.warehouses.isEmpty()) Text(stringResource(R.string.sk_no_wh), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // 3. KPI
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi(stringResource(R.string.sk_kpi_pos), sum.positions.toString(), null, Modifier.weight(1f))
                    Kpi(stringResource(R.string.sk_kpi_neg), sum.negative.toString(), stringResource(R.string.sk_kpi_neg_sub), Modifier.weight(1f), bad = sum.negative > 0)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi(stringResource(R.string.sk_kpi_zero), sum.zero.toString(), null, Modifier.weight(1f))
                    Kpi(stringResource(R.string.sk_kpi_last), formatMovement(sum.last) ?: "—", null, Modifier.weight(1f))
                }
            }
        }
        // 4. seven tabs
        item {
            val names = listOf(R.string.sk_t_keeper, R.string.sk_t_in, R.string.sk_t_stock, R.string.sk_t_cons, R.string.sk_t_obj, R.string.sk_t_hist, R.string.sk_t_m29)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                names.forEachIndexed { i, r ->
                    FilterChip(ui.tab == i, { vm.setTab(i) }, label = { Text(stringResource(r) + if (i == SkladTab.OBJ && ui.rows.isNotEmpty()) " (${ui.rows.size})" else "") })
                }
            }
        }
        if (ui.tab == SkladTab.KEEPER || ui.tab == SkladTab.IN || ui.tab == SkladTab.STOCK) item { WarehouseNotices(ui, vm) }
        when (ui.tab) {
            SkladTab.KEEPER -> if (ui.warehouse == null) item { PickHint(ui) } else keeperContent(ui, vm, omborVm, omborUi)
            SkladTab.IN -> if (ui.warehouse == null) item { PickHint(ui) } else item { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { KirimTab(ui.skladId!!, ui.access.write, ui.dataTick) } }
            SkladTab.STOCK -> if (ui.warehouse == null) item { PickHint(ui) } else item { KirimQoldiqTab(ui.skladId!!, ui.dataTick) }
            SkladTab.CONS -> item { KonsTab(ui.skladId, ui.dataTick) }
            SkladTab.OBJ -> item { ObjQoldiqTab(ui.rows, ui.objects, ui.objId, !ui.loaded, vm::setObj) }
            SkladTab.HIST -> item { JurnalTab(ui.objects, ui.objId, vm::setObj, ui.dataTick) }
            SkladTab.M29 -> item { M29Tab(onM29) }
        }
    }
    omborUi.cmd.question?.let { q -> QuestionDialog(q, omborUi.cmd.working, onAnswer = omborVm::answerQuestion, onDismiss = omborVm::dismissCommand) }
    omborUi.cmd.preview?.let { p -> CommandPreviewDialog(p, omborUi, omborVm, onEdit = { _, _ -> vm.open(SkladSub.IN) }) }
    if (picking) WarehousePicker(ui.warehouses, ui.skladId, onPick = { vm.selectWarehouse(it); picking = false }, onDismiss = { picking = false })
}

@Composable
private fun Kpi(label: String, value: String, sub: String?, modifier: Modifier, bad: Boolean = false) {
    WorkCard(modifier = modifier) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, color = if (bad) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            sub?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

/** Site OmborTanlov: a searchable list in a dialog («Barcha omborlar» first). */
@Composable
private fun WarehousePicker(list: List<Warehouse>, current: Long?, onPick: (Long?) -> Unit, onDismiss: () -> Unit) {
    var q by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss) {
        androidx.compose.material3.Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.sk_wh), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text(stringResource(R.string.pk2_2)) }
                }
                OutlinedTextField(q, { q = it }, label = { Text(stringResource(R.string.pk2_3)) }, placeholder = { Text(stringResource(R.string.pk2_4)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                val all = stringResource(R.string.sk_all_wh)
                val opts = listOf<Pair<Long?, String>>(null to all) + list.map { it.id to it.nomi }
                val shown = opts.filter { matchesQuery(it.second, q) }
                LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(shown, key = { it.first ?: -1L }) { (id, name) ->
                        WorkCard(onClick = { onPick(id) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                            Text(name + if (id == current) "  ✓" else "", Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if (shown.isEmpty()) item { Text(stringResource(R.string.pk2_5), style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}

@Composable
private fun PickHint(ui: SkladUi) {
    Text(stringResource(if (!ui.loaded) R.string.sk2_yuklanmoqda else if (ui.warehouses.isEmpty()) R.string.sk_no_wh else R.string.sk_pick_above), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** Site: the «omborini yaratish» button (only the Navoiy company, only after the list loaded, only while that warehouse is missing), the missing-permission note and «Berdim → obyekt». */
@Composable
private fun WarehouseNotices(ui: SkladUi, vm: OmborSkladViewModel) {
    val omborVm: OmborDataViewModel = hiltViewModel()
    val cid = omborVm.companyId
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (ui.loaded && !ui.error && cid == NAVOIY_KOMPANIYA_ID && ui.warehouses.none { it.nomi == NAVOIY_SKLAD_NOMI } && ui.access.write)
            OutlinedButton(onClick = { vm.createWarehouse(NAVOIY_SKLAD_NOMI) }, enabled = !ui.creating, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_wh_create, NAVOIY_SKLAD_NOMI)) }
        if (!ui.access.read) Text(stringResource(R.string.sk2_view_perm), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
        if (ui.warehouse != null && ui.access.write && ui.tab != SkladTab.STOCK)
            OutlinedButton(onClick = { vm.open(SkladSub.BERDIM) }, enabled = ui.objects.isNotEmpty(), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_berdim_obj)) }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.keeperContent(ui: SkladUi, vm: OmborSkladViewModel, omborVm: OmborViewModel, omborUi: OmborUi) {
    item {
        val subs = listOf(R.string.sk_s_berdim, R.string.sk_t_in, R.string.sk_s_out, R.string.sk_s_today, R.string.sk_s_report, R.string.sk_t_stock, R.string.ol_title)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            subs.forEachIndexed { i, r -> FilterChip(ui.sub == i, { vm.setSub(i) }, label = { Text(stringResource(r)) }) }
        }
    }
    when (ui.sub) {
        SkladSub.BERDIM -> item { BerdimForm(ui, vm) }
        SkladSub.IN -> item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { if (ui.access.write) CommandBar(omborUi, omborVm); KirimPanel("prixod", ui, vm) } }
        SkladSub.OUT -> item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { if (ui.access.write) CommandBar(omborUi, omborVm); KirimPanel("chiqim", ui, vm) } }
        SkladSub.TODAY -> item { HisobotPanel(ui.skladId!!, true, ui.access.write, ui.dataTick) }
        SkladSub.REPORT -> item { HisobotPanel(ui.skladId!!, false, ui.access.write, ui.dataTick) }
        SkladSub.STOCK -> item { QoldiqSubPanel(ui.skladId!!, ui.access.write, ui.dataTick, onChanged = { vm.reload() }) }
        SkladSub.LUGAT -> item { Box(Modifier.fillMaxWidth().height(560.dp)) { OmborLugatPanel(ui.skladId, ui.access.write) } }
    }
}
