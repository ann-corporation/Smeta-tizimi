package uz.anncorp.smeta.feature.company

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.feature.home.RoleChip

/** Company / role switcher: every row is one workplace the account belongs to, with the role it holds there. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkplaceSheet(workplaces: List<Workplace>, selected: Workplace?, onPick: (Workplace) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
            Text(
                stringResource(R.string.workplace_switch), style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )
            Spacer(Modifier.height(4.dp))
            if (workplaces.isEmpty()) {
                Text(stringResource(R.string.workplace_none), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
            }
            workplaces.forEach { w ->
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(w) }.padding(horizontal = 24.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(w.nom.ifBlank { "—" }, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (w.rol.isNotBlank()) RoleChip(w.rol)
                    Spacer(Modifier.width(8.dp))
                    if (w.companyId == selected?.companyId) Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    else Spacer(Modifier.width(24.dp))
                }
            }
        }
    }
}
