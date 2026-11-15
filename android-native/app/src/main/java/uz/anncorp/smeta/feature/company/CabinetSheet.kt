package uz.anncorp.smeta.feature.company

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.WsCabinet
import uz.anncorp.smeta.core.ui.TouchTarget

/**
 * Cabinet switcher: a role is the RELATIONSHIP per object/contract, not a company type - the same company can be the contractor here,
 * a subcontractor there and the client elsewhere. Every row is one cabinet (company x party) the server derived for this user.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CabinetSheet(cabinets: List<WsCabinet>, onPick: (WsCabinet) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
            Text(stringResource(R.string.ws_cabinet_switch), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
            Text(stringResource(R.string.ws_cabinet_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 24.dp, vertical = 2.dp))
            cabinets.forEach { c ->
                Row(Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable { onPick(c) }.padding(horizontal = 24.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(c.partyName.ifBlank { c.party }, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(c.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.width(8.dp))
                    if (c.current) Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary) else Spacer(Modifier.width(24.dp))
                }
            }
        }
    }
}