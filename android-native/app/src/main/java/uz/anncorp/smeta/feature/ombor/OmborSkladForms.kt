package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard

private val ISO_DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")

@Composable
private fun berdimErrorText(code: String): String = stringResource(when (code) {
    "QOLDIQ_YETMAYDI" -> R.string.bd_e_short; "OBJECT_SCOPE_MISMATCH" -> R.string.bd_e_obj; "WAREHOUSE_SCOPE_MISMATCH" -> R.string.bd_e_wh
    "OPERATION_ID_CONFLICT" -> R.string.bd_e_conflict; "PERMISSION_DENIED" -> R.string.bd_e_perm; else -> R.string.bd_e_unknown
})

@Composable
internal fun omborErrorText(code: String): String = stringResource(when (code) {
    "QOLDIQ_YETMAYDI" -> R.string.ox_short; "PERMISSION_DENIED" -> R.string.ox_perm; "DATE_IN_FUTURE" -> R.string.ox_future; "INVALID_INPUT" -> R.string.ox_invalid
    "OPERATION_ID_CONFLICT" -> R.string.ox_conflict2; "NETWORK" -> R.string.ox_net; "TOKEN_YETMAYDI" -> R.string.ox_tokens; "DATE_INVALID" -> R.string.ox_date; else -> R.string.ox_default
})

/** Site MarkaziyBerdimForm: object (required, never preselected) + material from the central stock + quantity + «Kimga berildi» + date. */
@Composable
fun BerdimForm(ui: SkladUi, vm: OmborSkladViewModel) {
    var objectId by rememberSaveable { mutableStateOf<Long?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var picked by remember { mutableStateOf<StockRow?>(null) }
    var qty by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(java.time.LocalDate.now().toString()) }
    var pickObject by remember { mutableStateOf(false) }
    LaunchedEffect(ui.skladId, query) { vm.searchCentral(query) }
    // after a successful write the form is empty again and the central list is re-read (the stock changed)
    LaunchedEffect(ui.berdimSeq) { if (ui.berdimSeq > 0) { qty = ""; to = ""; picked = null; if (query.isNotEmpty()) query = "" else vm.searchCentral("") } }
    val q = berdimQty(qty)
    val over = q != null && picked?.qoldiq != null && q.toDouble() > picked!!.qoldiq!!
    val ready = objectId != null && picked != null && q != null && !over && ISO_DATE.matches(date)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.bd_hint, ui.warehouse?.nomi ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { pickObject = true }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text(stringResource(R.string.bd_obj) + ": " + (ui.objects.firstOrNull { it.id == objectId }?.nom ?: stringResource(R.string.pk2_1)), maxLines = 1)
        }
        OutlinedTextField(query, { query = it; picked = null }, label = { Text(stringResource(R.string.bd_mat)) }, placeholder = { Text(stringResource(R.string.bd_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (ui.centralError) Text(stringResource(R.string.bd_readerr), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        ui.central.forEach { v ->
            val sel = picked?.nomi == v.nomi && picked?.birligi == v.birligi
            WorkCard(onClick = { picked = v }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(v.nomi + if (sel) "  ✓" else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(formatQty(v.qoldiq) + " " + v.birligi, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        if (!ui.centralLoading && !ui.centralError && ui.central.isEmpty()) Text(stringResource(R.string.bd_none), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(qty, { qty = it }, label = { Text(picked?.let { stringResource(R.string.bd_qty_u, it.birligi) } ?: stringResource(R.string.bd_qty)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
        if (over) Text(stringResource(R.string.bd_over, formatQty(picked?.qoldiq), picked?.birligi ?: ""), color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(to, { to = it.take(300) }, label = { Text(stringResource(R.string.bd_to)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(date, { date = it }, label = { Text(stringResource(R.string.bd_date)) }, singleLine = true, isError = !ISO_DATE.matches(date), modifier = Modifier.fillMaxWidth())
        ui.berdimError?.let { Text(berdimErrorText(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.berdim(objectId!!, picked!!, qty, to, date); }, enabled = ready && !ui.berdimBusy, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk_s_berdim)) }
            OutlinedButton(onClick = { qty = ""; to = ""; picked = null; query = "" }, enabled = !ui.berdimBusy, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.bd_cancel)) }
        }
    }
    if (pickObject) Dialog(onDismissRequest = { pickObject = false }) {
        var oq by remember { mutableStateOf("") }
        androidx.compose.material3.Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.bd_obj), style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(oq, { oq = it }, label = { Text(stringResource(R.string.pk2_3)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(ui.objects.filter { matchesQuery(it.nom, oq) }, key = { it.id }) { o ->
                        WorkCard(onClick = { objectId = o.id; pickObject = false }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(o.nom + if (o.id == objectId) "  ✓" else "", Modifier.padding(14.dp)) }
                    }
                }
            }
        }
    }
}

/** Site OmborKiritish (text part): one input + suggestions from this warehouse's history, then one card with a single «Saqlash». */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun KirimPanel(kind: String, ui: SkladUi, vm: OmborSkladViewModel) {
    val kirim = kind == "prixod"
    var text by rememberSaveable(kind) { mutableStateOf("") }
    var supplier by rememberSaveable(kind) { mutableStateOf<String?>(null) }
    var card by rememberSaveable(kind) { mutableStateOf(false) }
    var name by rememberSaveable(kind) { mutableStateOf("") }; var unit by rememberSaveable(kind) { mutableStateOf("") }; var qty by rememberSaveable(kind) { mutableStateOf("") }
    var price by rememberSaveable(kind) { mutableStateOf("") }; var party by rememberSaveable(kind) { mutableStateOf("") }; var date by rememberSaveable(kind) { mutableStateOf(vm.today()) }
    var balance by rememberSaveable(kind) { mutableStateOf<Double?>(null) }; var asked by rememberSaveable(kind) { mutableStateOf(false) }
    var localError by remember { mutableStateOf<Int?>(null) }
    val opId = rememberSaveable(kind, card) { vm.newOperationId() }
    LaunchedEffect(ui.skladId, text, supplier, kind, card) { if (!card && (text.isNotBlank() || supplier != null)) vm.suggest(text, kind, supplier) else vm.clearSuggest() }
    fun reset() { text = ""; supplier = null; card = false; name = ""; unit = ""; qty = ""; price = ""; party = ""; balance = null; asked = false; localError = null; vm.clearSuggest() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!card) {
            OutlinedTextField(text, { text = it }, label = { Text(stringResource(R.string.ki_input)) }, placeholder = { Text(stringResource(if (kirim) R.string.ki_ph_in else R.string.ki_ph_out)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                trailingIcon = { if (text.isNotEmpty()) TextButton(onClick = { text = "" }) { Text("×") } })
            supplier?.let { s -> Row(verticalAlignment = Alignment.CenterVertically) { Text(stringResource(if (kirim) R.string.ki_supplier else R.string.ki_to) + ": " + s, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); TextButton(onClick = { supplier = null }) { Text(stringResource(R.string.ki_cancel)) } } }
            ui.suggest?.items.orEmpty().forEach { e ->
                WorkCard(onClick = {
                    name = e.name; unit = e.unit; qty = e.qtyMedian?.let { formatQty(it) } ?: ""; balance = e.balance
                    price = if (kirim && e.priceLast != null) formatQty(if (ui.priceMode == PriceMode.WITH) e.priceLastGross ?: e.priceLast else e.priceLast) else ""
                    party = supplier ?: e.supplier ?: ""; card = true; vm.clearSuggest()
                }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                    Column(Modifier.padding(10.dp)) {
                        Row { Text(e.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium); Text(e.unit, style = MaterialTheme.typography.labelMedium) }
                        Text(listOfNotNull(
                            e.qtyMedian?.let { stringResource(R.string.ki_usually) + " " + formatQty(it) },
                            if (kirim && e.priceLast != null) stringResource(R.string.ki_price_l) + " " + formatMoney(e.priceLast) + " (" + stringResource(R.string.ki_vat_with) + " " + formatMoney(e.priceLastGross) + ")" else null,
                            e.supplier, if (!kirim && e.balance != null) stringResource(R.string.ki_balance) + ": " + formatQty(e.balance) else null,
                        ).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (supplier == null) ui.suggest?.suppliers.orEmpty().takeIf { it.isNotEmpty() }?.let { list ->
                Text(stringResource(if (kirim) R.string.ki_suppliers else R.string.ki_receivers), style = MaterialTheme.typography.labelMedium)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { list.forEach { s -> FilterChip(false, { supplier = s.name; text = "" }, label = { Text(s.name) }) } }
            }
            if (text.isNotBlank()) OutlinedButton(onClick = { name = text.trim(); unit = ""; qty = ""; price = ""; party = supplier ?: ""; balance = null; card = true; vm.clearSuggest() }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                Text("+ " + stringResource(R.string.ki_new) + ": «" + text.trim() + "»")
            }
        } else {
            val net = priceNet(numberOf(price), ui.priceMode, ui.vat)
            WorkCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(if (kirim) R.string.ki_in_cap else R.string.ki_out_cap) + ": " + name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                        TextButton(onClick = { reset() }) { Text("×") }
                    }
                    if (!kirim && balance != null) Text(stringResource(R.string.ki_balance) + ": " + formatQty(balance) + " " + unit, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(qty, { qty = it }, label = { Text(stringResource(R.string.bd_qty)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                        OutlinedTextField(unit, { unit = it }, label = { Text(stringResource(R.string.ki_unit)) }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    if (kirim) OutlinedTextField(price, { price = it }, label = { Text(stringResource(R.string.ki_price)) }, placeholder = { Text(stringResource(R.string.ki_price_ph)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(party, { party = it }, label = { Text(stringResource(if (kirim) R.string.ki_supplier else R.string.ki_to_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    if (kirim) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            FilterChip(ui.priceMode == PriceMode.WITH, { vm.setPriceMode(PriceMode.WITH) }, label = { Text(stringResource(R.string.ki_vat_with)) })
                            FilterChip(ui.priceMode == PriceMode.WITHOUT, { vm.setPriceMode(PriceMode.WITHOUT) }, label = { Text(stringResource(R.string.ki_vat_wo)) })
                        }
                        if (net != null) Text(stringResource(R.string.ki_vat_wo) + ": " + formatMoney(net) + " · " + stringResource(R.string.ki_vat_with) + " (${ui.vat.toInt()}%): " + formatMoney(priceGross(net, ui.vat)) +
                            (qty.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }?.let { " · " + stringResource(R.string.ki_total) + " (" + stringResource(R.string.ki_vat_wo) + "): " + formatMoney(net * it) } ?: ""), style = MaterialTheme.typography.labelSmall)
                        if (asked && price.isBlank()) Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(R.string.ki_price_ask), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                            TextButton(onClick = { save(vm, kind, name, unit, qty, price, ui, date, party, opId, ::reset) { localError = it } }) { Text(stringResource(R.string.ki_skip)) }
                        }
                    }
                    OutlinedTextField(date, { date = it }, label = { Text(stringResource(R.string.bd_date)) }, singleLine = true, isError = !ISO_DATE.matches(date) || date > vm.today(), modifier = Modifier.fillMaxWidth())
                    localError?.let { Text(stringResource(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    ui.kirimError?.let { Text(omborErrorText(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Button(onClick = {
                        // price is optional; asked once softly when empty (site narxSoraldi), the second Saqlash saves anyway
                        if (kirim && price.isBlank() && !asked && checkKirim(name, unit, qty, price) == null) asked = true
                        else save(vm, kind, name, unit, qty, price, ui, date, party, opId, ::reset) { localError = it }
                    }, enabled = !ui.kirimBusy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.ki_save)) }
                }
            }
        }
    }
}

private fun save(vm: OmborSkladViewModel, kind: String, name: String, unit: String, qty: String, price: String, ui: SkladUi, date: String, party: String, opId: String, reset: () -> Unit, error: (Int?) -> Unit) {
    when (checkKirim(name, unit, qty, price)) {
        KirimIssue.REQUIRED -> { error(R.string.ki_need); return }
        KirimIssue.PRICE -> { error(R.string.ki_bad_price); return }
        null -> error(null)
    }
    val p = price.replace(',', '.').replace(Regex("[\\s\u00A0\u202F]"), "").trim().ifEmpty { null }
    vm.saveKirim(KirimInput(kind, name, unit, qty.replace(',', '.').trim(), p, ui.priceMode, date, party.trim().ifEmpty { null }, opId), reset)
}
