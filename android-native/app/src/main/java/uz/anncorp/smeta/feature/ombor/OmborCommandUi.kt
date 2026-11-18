package uz.anncorp.smeta.feature.ombor

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.ui.ObjectDropdown
import uz.anncorp.smeta.core.ui.TouchTarget

/** Typed command field plus a hold-to-talk microphone button. Everything the user says or types goes to the server; the device parses nothing. */
@Composable
internal fun CommandBar(ui: OmborUi, vm: OmborViewModel) {
    val context = LocalContext.current
    var text by rememberSaveable { mutableStateOf("") }
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    val c = ui.cmd
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        c.message?.let { m ->
            Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(messageRes(m)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
                    TextButton(onClick = vm::dismissCommand) { Text(stringResource(R.string.docs_dismiss)) }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = text, onValueChange = { text = it }, singleLine = true, modifier = Modifier.weight(1f).heightIn(min = TouchTarget),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Send),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { if (text.isNotBlank() && !c.working) { vm.sendCommand(text); text = "" } }),
                placeholder = { Text(stringResource(if (c.recording) R.string.ombor_cmd_recording else R.string.ombor_cmd_hint), maxLines = 1) },
                trailingIcon = {
                    if (c.working) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else IconButton(onClick = { vm.sendCommand(text); text = "" }, enabled = text.isNotBlank()) { Icon(Icons.Filled.Send, stringResource(R.string.ombor_cmd_send)) }
                },
            )
            Box(
                Modifier.size(TouchTarget).background(if (c.recording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, CircleShape)
                    .pointerInput(granted) {
                        detectTapGestures(onPress = {
                            if (!granted) { launcher.launch(Manifest.permission.RECORD_AUDIO) }
                            else if (vm.startRecording()) { tryAwaitRelease(); vm.stopRecording() }
                        })
                    },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Mic, stringResource(R.string.ombor_cmd_hold), tint = MaterialTheme.colorScheme.onPrimary) }
        }
        Text(stringResource(R.string.ombor_cmd_hold), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun messageRes(m: CmdMessage): Int = when (m) {
    CmdMessage.NO_MIC -> R.string.ombor_cmd_m_nomic
    CmdMessage.TOO_SHORT -> R.string.ombor_cmd_m_short
    CmdMessage.OFFLINE -> R.string.ombor_cmd_m_offline
    CmdMessage.FORBIDDEN -> R.string.ombor_cmd_m_forbidden
    CmdMessage.NOT_UNDERSTOOD -> R.string.ombor_cmd_m_unclear
    CmdMessage.UNAVAILABLE -> R.string.ombor_cmd_m_unavailable
    CmdMessage.FAILED -> R.string.ombor_cmd_m_failed
    CmdMessage.LOW_STOCK -> R.string.ombor_cmd_m_stock
    CmdMessage.NO_WAREHOUSE -> R.string.ombor_cmd_m_nowarehouse
}

/**
 * Preview card of what the server understood. The user can correct every field (names this warehouse entered before are suggested as they type;
 * a new name is simply accepted). Save: the server writes it (unchanged card = its token; edited card = the server re-validates, then writes).
 * Edit opens the full entry form with these values. A balance question shows the server's answer, or the cached balance when offline.
 */
@Composable
internal fun CommandPreviewDialog(p: CommandPreview, ui: OmborUi, vm: OmborViewModel, onEdit: (OmborOp, StockRow) -> Unit) {
    var name by remember(p) { mutableStateOf(p.name) }
    var unit by remember(p) { mutableStateOf(p.unit) }
    var qty by remember(p) { mutableStateOf(p.qty?.let { formatQty(it).replace(" ", "").replace("\u00A0", "") } ?: "") }
    var objectId by remember(p) { mutableStateOf(p.objectId ?: (ui.scope as? OmborScope.Obyekt)?.id) }
    var mode by remember(p, ui.priceMode) { mutableStateOf(ui.priceMode) }
    val priceStart = remember(p, mode) { (if (mode == "siz") p.price else (p.priceGross ?: p.price))?.let { formatQty(it).replace(" ", "").replace("\u00A0", "") } ?: "" }
    var price by remember(p, mode) { mutableStateOf(priceStart) }
    var askDismissed by remember(p) { mutableStateOf(false) }
    val isMove = p.kind == CommandKind.RECEIVE || p.kind == CommandKind.ISSUE
    val isEdit = p.kind == CommandKind.EDIT
    val op = if (p.kind == CommandKind.ISSUE) OmborOp.ISSUE else OmborOp.RECEIVE
    val obj = ui.objects.firstOrNull { it.id == objectId }
    val qtyValue = parseQuantity(qty)
    val busy = ui.cmd.working
    val canSave = ui.access.write && !busy && when {
        isMove -> name.isNotBlank() && qtyValue != null
        isEdit -> p.token != null
        else -> false
    }
    // Autocomplete: typing a different name asks the server for the names this warehouse entered before.
    LaunchedEffect(name) { if (isMove && name != p.name) vm.suggest(name) }
    val shown = (if (name != p.name) ui.cmd.suggestions else p.alternatives).filter { it.name != name }.take(5)
    AlertDialog(
        onDismissRequest = vm::dismissCommand,
        title = {
            Text(stringResource(when (p.kind) {
                CommandKind.RECEIVE -> R.string.ombor_cmd_k_in; CommandKind.ISSUE -> R.string.ombor_cmd_k_out
                CommandKind.EDIT -> R.string.ombor_cmd_k_edit; else -> R.string.ombor_cmd_k_balance
            }))
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                p.heard?.let { Text(stringResource(R.string.ombor_cmd_heard, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.ombor_cmd_name)) }, modifier = Modifier.fillMaxWidth(), enabled = !isEdit)
                if (shown.isNotEmpty()) {
                    Text(stringResource(R.string.ombor_cmd_suggest), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    shown.forEach { s ->
                        TextButton(onClick = { name = s.name; if (s.unit.isNotBlank()) unit = s.unit }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                            Text(s.name + (s.unit.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""), maxLines = 2, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
                if (p.kind == CommandKind.BALANCE) {
                    val hit = ui.scopeRows.filter { matchesQuery(it.nomi, name) }.take(3)
                    Text(
                        p.answer ?: if (hit.isEmpty()) stringResource(R.string.ombor_cmd_balance_none) else hit.joinToString("\n") { it.nomi + ": " + formatQty(it.qoldiq) + " " + it.birligi },
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface,
                    )
                } else if (isEdit) {
                    p.qty?.let { Text(stringResource(R.string.ombor_cmd_qty) + ": " + formatQty(it), style = MaterialTheme.typography.bodyMedium) }
                    if (p.note.isNotBlank()) Text(p.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(qty, { qty = it }, label = { Text(stringResource(R.string.ombor_cmd_qty)) }, singleLine = true, isError = qty.isNotEmpty() && qtyValue == null, modifier = Modifier.weight(1f))
                        OutlinedTextField(unit, { unit = it }, label = { Text(stringResource(R.string.ombor_cmd_unit)) }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    ObjectDropdown(ui.objects, objectId, stringResource(R.string.ombor_cmd_object), { objectId = it })
                    if (p.party.isNotBlank()) Text(stringResource(R.string.ombor_cmd_party, p.party), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (p.kind == CommandKind.RECEIVE) {
                        // Optional price (QQS bilan by default, the last choice per warehouse is remembered). Never blocks saving.
                        if (p.priceAsk && price.isBlank() && !askDismissed) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(stringResource(R.string.ombor_cmd_price_ask), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
                                TextButton(onClick = { askDismissed = true }) { Text(stringResource(R.string.ombor_cmd_price_skip)) }
                            }
                        }
                        if (p.modeAsk && price == priceStart) Text(stringResource(R.string.ombor_cmd_price_mode_ask), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                        OutlinedTextField(price, { price = it }, label = { Text(stringResource(R.string.ombor_cmd_price)) }, singleLine = true, isError = price.isNotBlank() && parseQuantity(price) == null, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { mode = "bilan" }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_cmd_qqs_in), color = if (mode == "bilan") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                            TextButton(onClick = { mode = "siz" }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_cmd_qqs_ex), color = if (mode == "siz") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        if (p.price != null && p.priceGross != null && price == priceStart) {
                            Text(stringResource(R.string.ombor_cmd_price_both, formatQty(p.price), formatQty(p.priceGross)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                p.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary) }
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            }
        },
        confirmButton = {
            if (p.kind == CommandKind.BALANCE) TextButton(onClick = vm::dismissCommand) { Text(stringResource(R.string.p8_cancel)) }
            else TextButton(enabled = canSave, onClick = {
                vm.saveCommand(p, name, unit, if (isEdit) p.qty else qtyValue?.toDouble(), p.party, p.note, obj?.nom, parseQuantity(price)?.toDouble(), mode, price != priceStart || mode != ui.priceMode)
            }) { Text(stringResource(R.string.ombor_cmd_save)) }
        },
        dismissButton = {
            Row {
                if (isMove) TextButton(onClick = { vm.dismissCommand(); onEdit(op, StockRow(objectId, name, unit, null)) }) { Text(stringResource(R.string.ombor_cmd_edit)) }
                if (p.kind != CommandKind.BALANCE) TextButton(onClick = vm::dismissCommand) { Text(stringResource(R.string.p8_cancel)) }
            }
        },
    )
}