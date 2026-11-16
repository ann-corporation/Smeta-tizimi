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
}

/**
 * Preview card of what the server understood. The user can correct every field; Save queues the normal receive / issue (works offline, outbox),
 * Edit opens the full entry form with these values. A balance question shows the server's answer, or the cached balance when offline.
 */
@Composable
internal fun CommandPreviewDialog(p: CommandPreview, ui: OmborUi, vm: OmborViewModel, onEdit: (OmborOp, StockRow) -> Unit) {
    var name by remember(p) { mutableStateOf(p.name) }
    var unit by remember(p) { mutableStateOf(p.unit) }
    var qty by remember(p) { mutableStateOf(p.qty?.let { formatQty(it).replace(" ", "").replace(" ", "") } ?: "") }
    var objectId by remember(p) { mutableStateOf(p.objectId ?: (ui.scope as? OmborScope.Obyekt)?.id) }
    val opId = remember(p) { vm.newOperationId() }
    val isMove = p.kind == CommandKind.RECEIVE || p.kind == CommandKind.ISSUE
    val op = if (p.kind == CommandKind.ISSUE) OmborOp.ISSUE else OmborOp.RECEIVE
    val obj = ui.objects.firstOrNull { it.id == objectId }
    val qtyOk = parseQuantity(qty) != null
    val canSave = isMove && name.isNotBlank() && qtyOk && obj != null && ui.access.write
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
                OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.ombor_cmd_name)) }, modifier = Modifier.fillMaxWidth())
                if (p.kind == CommandKind.BALANCE) {
                    val hit = ui.scopeRows.filter { matchesQuery(it.nomi, name) }.take(3)
                    Text(
                        p.answer ?: if (hit.isEmpty()) stringResource(R.string.ombor_cmd_balance_none) else hit.joinToString("\n") { it.nomi + ": " + formatQty(it.qoldiq) + " " + it.birligi },
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface,
                    )
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(qty, { qty = it }, label = { Text(stringResource(R.string.ombor_cmd_qty)) }, singleLine = true, isError = qty.isNotEmpty() && !qtyOk, modifier = Modifier.weight(1f))
                        OutlinedTextField(unit, { unit = it }, label = { Text(stringResource(R.string.ombor_cmd_unit)) }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    ObjectDropdown(ui.objects, objectId, stringResource(R.string.ombor_cmd_object), { objectId = it })
                    if (p.party.isNotBlank()) Text(stringResource(R.string.ombor_cmd_party, p.party), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        confirmButton = {
            if (p.kind == CommandKind.BALANCE) TextButton(onClick = vm::dismissCommand) { Text(stringResource(R.string.p8_cancel)) }
            else TextButton(enabled = canSave, onClick = {
                val source: OmborScope? = if (op == OmborOp.ISSUE) obj?.let { OmborScope.Obyekt(it.id, it.nom) } else null
                vm.submit(op, name.trim(), unit.trim(), qty, java.time.LocalDate.now().toString(), source, if (op == OmborOp.RECEIVE) obj else null, p.party, null, p.note, opId) { vm.dismissCommand() }
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
