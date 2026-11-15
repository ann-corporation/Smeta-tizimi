package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

data class PickItem(val label: String, val tag: String?, val value: OmborScope)

/** Searchable single-choice list in a full-width dialog. */
@Composable
fun PickerDialog(title: String, items: List<PickItem>, onPick: (OmborScope) -> Unit, onDismiss: () -> Unit) {
    var q by remember { mutableStateOf("") }
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        androidx.compose.material3.Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Column(Modifier.padding(16.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                OutlinedTextField(
                    value = q, onValueChange = { q = it }, singleLine = true, placeholder = { Text(stringResource(R.string.ombor_pick_search)) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                )
                LazyColumn(Modifier.heightIn(max = 420.dp)) {
                    items(items.filter { matchesQuery(it.label, q) }, key = { it.value.toString() }) { it ->
                        Column(Modifier.fillMaxWidth().clickable { onPick(it.value) }.heightIn(min = TouchTarget).padding(horizontal = 4.dp, vertical = 8.dp), verticalArrangement = Arrangement.Center) {
                            Text(it.label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                            it.tag?.let { t -> Text(t, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary) }
                        }
                    }
                }
            }
        }
    }
}

private fun scopeKey(s: OmborScope?): String = when (s) {
    is OmborScope.Obyekt -> "o:${s.id}"
    is OmborScope.Central -> "c:${s.id}"
    else -> ""
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OmborEntryDialog(op: OmborOp, ui: OmborUi, preset: StockRow?, vm: OmborViewModel, onDismiss: () -> Unit) {
    val opId = rememberSaveable { vm.newOperationId() }
    var name by rememberSaveable { mutableStateOf(preset?.nomi.orEmpty()) }
    var unit by rememberSaveable { mutableStateOf(preset?.birligi.orEmpty()) }
    var qty by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var party by rememberSaveable { mutableStateOf("") }
    var partyType by rememberSaveable { mutableStateOf<String?>(null) }
    var note by rememberSaveable { mutableStateOf("") }
    var tried by rememberSaveable { mutableStateOf(false) }
    var sending by rememberSaveable { mutableStateOf(false) }
    var datePicking by remember { mutableStateOf(false) }
    var choosing by remember { mutableStateOf<String?>(null) }

    val initialSource = when {
        op != OmborOp.ISSUE -> null
        ui.scope !is OmborScope.AllObjects -> ui.scope
        preset?.obyektId != null -> ui.objects.firstOrNull { it.id == preset.obyektId }?.let { OmborScope.Obyekt(it.id, it.nom) }
        else -> null
    }
    var sourceKey by rememberSaveable { mutableStateOf(scopeKey(initialSource)) }
    val source: OmborScope? = ui.scopes.firstOrNull { scopeKey(it) == sourceKey }
    var targetId by rememberSaveable {
        mutableStateOf<Long?>(if (op == OmborOp.RECEIVE) (ui.scope as? OmborScope.Obyekt)?.id else null)
    }
    val target = ui.objects.firstOrNull { it.id == targetId }

    // Material suggestions come from what is actually in stock (never invented): the chosen source for an issue, every object for a receive.
    val pool: List<StockRow> = when {
        op == OmborOp.RECEIVE -> ui.allObjectRows
        source is OmborScope.Obyekt -> ui.allObjectRows.filter { it.obyektId == source.id }
        source is OmborScope.Central && ui.scope == source -> ui.scopeRows
        else -> emptyList()
    }
    val suggestions = pool.filter { matchesQuery(it.nomi, name) && !(it.nomi == name && it.birligi == unit) }
        .distinctBy { it.nomi to it.birligi }.take(6)
    val picked = pool.firstOrNull { it.nomi == name && it.birligi == unit }
    val qtyValue = parseQuantity(qty)
    val errors = validateEntry(op, name, unit, qty, date, source, targetId)
    val over = op == OmborOp.ISSUE && exceedsStock(qtyValue, picked?.qoldiq)

    Dialog(onDismissRequest = { if (!sending) onDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = { WorkTopBar(stringResource(if (op == OmborOp.RECEIVE) R.string.ombor_receive_title else R.string.ombor_issue_title), onDismiss) },
            modifier = Modifier.imePadding(),
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (op == OmborOp.ISSUE) {
                    PickerField(stringResource(R.string.ombor_field_source), source?.let { labelOf(it) }, tried && EntryError.SOURCE in errors) { choosing = "source" }
                }
                if (op == OmborOp.RECEIVE || source is OmborScope.Central) {
                    PickerField(
                        stringResource(if (op == OmborOp.RECEIVE) R.string.ombor_field_object else R.string.ombor_field_target_object),
                        target?.nom, tried && EntryError.TARGET in errors,
                    ) { choosing = "target" }
                }

                OutlinedTextField(
                    value = name, onValueChange = { name = it }, singleLine = true, label = { Text(stringResource(R.string.ombor_field_material)) },
                    isError = tried && EntryError.NAME in errors, modifier = Modifier.fillMaxWidth(),
                )
                if (suggestions.isNotEmpty()) {
                    Text(stringResource(R.string.ombor_suggest), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    suggestions.forEach { s ->
                        WorkCard(onClick = { name = s.nomi; unit = s.birligi }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(s.nomi, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                                Text("${formatQty(s.qoldiq)} ${s.birligi}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = qty, onValueChange = { qty = it }, singleLine = true, label = { Text(stringResource(R.string.ombor_field_qty)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), isError = tried && EntryError.QUANTITY in errors,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = unit, onValueChange = { unit = it }, singleLine = true, label = { Text(stringResource(R.string.ombor_field_unit)) },
                        isError = tried && EntryError.UNIT in errors, modifier = Modifier.weight(1f),
                    )
                }
                if (picked != null) Text(stringResource(R.string.ombor_stock_here, formatQty(picked.qoldiq), picked.birligi), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (over) Text(stringResource(R.string.ombor_over_stock, formatQty(picked?.qoldiq), picked?.birligi.orEmpty()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)

                PickerField(stringResource(R.string.ombor_field_date), date, tried && EntryError.DATE in errors) { datePicking = true }

                OutlinedTextField(
                    value = party, onValueChange = { party = it }, singleLine = true,
                    label = { Text(stringResource(if (op == OmborOp.RECEIVE) R.string.ombor_field_supplier else R.string.ombor_field_receiver)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (op == OmborOp.ISSUE && source is OmborScope.Obyekt) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        RECEIVER_TYPES.forEach { t ->
                            FilterChip(selected = partyType == t, onClick = { partyType = if (partyType == t) null else t }, label = { Text(stringResource(receiverLabel(t))) })
                        }
                    }
                }
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text(stringResource(R.string.ombor_field_note)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)

                // Placeholder for the nakladnaya photo (the photo feature attaches via OmborRepository.photoHook later).
                OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_photo_soon)) }

                if (tried && errors.isNotEmpty()) {
                    Text(stringResource(errorRes(errors.first())), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
                Text(stringResource(R.string.ombor_queue_note), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(
                    enabled = !sending,
                    onClick = {
                        tried = true
                        if (errors.isEmpty()) {
                            sending = true
                            vm.submit(op, name, unit, qty, date, source, target, party, partyType, note, opId) { ok -> if (ok) onDismiss() else sending = false }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
                ) { Text(stringResource(R.string.ombor_save_queue)) }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (datePicking) {
        val st = rememberDatePickerState(initialSelectedDateMillis = runCatching { LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull())
        DatePickerDialog(
            onDismissRequest = { datePicking = false },
            confirmButton = { TextButton(onClick = { st.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }; datePicking = false }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { datePicking = false }) { Text(stringResource(R.string.ombor_close)) } },
        ) { DatePicker(st) }
    }
    when (choosing) {
        "source" -> PickerDialog(
            stringResource(R.string.ombor_field_source),
            ui.warehouses.map { PickItem(it.nomi, stringResource(R.string.ombor_central_tag), OmborScope.Central(it.id, it.nomi)) } +
                ui.objects.map { PickItem(it.nom, null, OmborScope.Obyekt(it.id, it.nom)) },
            onPick = { sourceKey = scopeKey(it); choosing = null }, onDismiss = { choosing = null },
        )
        "target" -> PickerDialog(
            stringResource(R.string.ombor_pick_title), ui.objects.map { PickItem(it.nom, null, OmborScope.Obyekt(it.id, it.nom)) },
            onPick = { targetId = (it as? OmborScope.Obyekt)?.id; choosing = null }, onDismiss = { choosing = null },
        )
    }
}

private fun labelOf(s: OmborScope): String = when (s) {
    is OmborScope.Obyekt -> s.nom
    is OmborScope.Central -> s.nom
    OmborScope.AllObjects -> ""
}

@Composable
private fun PickerField(label: String, value: String?, error: Boolean, onClick: () -> Unit) {
    val ph = stringResource(R.string.ombor_choose)
    OutlinedButton(
        onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface),
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value?.takeIf { it.isNotBlank() } ?: ph, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
        }
        Icon(Icons.Filled.ArrowDropDown, null)
    }
}

private fun receiverLabel(t: String): Int = when (t) {
    "usta" -> R.string.ombor_receiver_usta
    "brigada" -> R.string.ombor_receiver_brigada
    "prarab" -> R.string.ombor_receiver_prarab
    else -> R.string.ombor_receiver_boshqa
}

private fun errorRes(e: EntryError): Int = when (e) {
    EntryError.NAME -> R.string.ombor_err_name
    EntryError.UNIT -> R.string.ombor_err_unit
    EntryError.QUANTITY -> R.string.ombor_err_qty
    EntryError.SOURCE -> R.string.ombor_err_source
    EntryError.TARGET -> R.string.ombor_err_target
    EntryError.DATE -> R.string.ombor_err_date
}
