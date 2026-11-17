package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard

/** Incoming or outgoing list (the tab body). */
@Composable
internal fun MovesList(moves: List<OmborMove>, objectNames: Map<Long, String>, showObject: Boolean) {
    if (moves.isEmpty()) {
        Text(stringResource(R.string.ombor_moves_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(moves, key = { it.id }) { m -> MoveCard(m, if (showObject) m.objectId?.let { objectNames[it] } else null) }
    }
}

@Composable
internal fun MoveCard(m: OmborMove, objectName: String?) {
    WorkCard(modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(m.nomi, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                Text(
                    listOfNotNull(formatMovement(m.date), objectName, m.note, m.by).joinToString("  ·  "),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2,
                )
            }
            Text(
                (if (m.isIncoming) "+" else "−") + formatQty(m.qty) + if (m.birligi.isNotBlank()) " " + m.birligi else "",
                style = MaterialTheme.typography.titleSmall, color = if (m.isIncoming) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}

/** Item card: current balance, quick receive / issue and the movement history of this material. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ItemSheet(row: StockRow, objectName: String?, history: List<OmborMove>, objectNames: Map<Long, String>, canWrite: Boolean, onReceive: () -> Unit, onIssue: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(row.nomi, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            objectName?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
            Text(
                stringResource(R.string.ombor_item_stock, formatQty(row.qoldiq), row.birligi),
                style = MaterialTheme.typography.titleLarge, color = if ((row.qoldiq ?: 0.0) < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            )
            if (canWrite) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onReceive, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_btn_receive)) }
                OutlinedButton(onClick = onIssue, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.ombor_btn_issue)) }
            }
            Text(stringResource(R.string.ombor_item_history), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 6.dp))
            if (history.isEmpty()) Text(stringResource(R.string.ombor_item_no_history), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            history.take(50).forEach { MoveCard(it, it.objectId?.let { id -> objectNames[id] }) }
            Text("", Modifier.padding(bottom = 16.dp))
        }
    }
}
