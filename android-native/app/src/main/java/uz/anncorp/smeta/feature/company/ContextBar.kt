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
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.qurai.ui.screens.QFilterOption
import uz.anncorp.qurai.ui.screens.QScopePanel
import uz.anncorp.qurai.ui.screens.QScopeTexts
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.WorkScope
import uz.anncorp.smeta.core.data.loyihaOptions
import uz.anncorp.smeta.core.data.scopeSummary
import uz.anncorp.smeta.core.data.scopedLeaves
import uz.anncorp.smeta.core.data.shartnomaOptions
import uz.anncorp.smeta.feature.work.ScopeViewModel

/**
 * "Kontekst" line under the workplace bar (the website's context switch): shows the chosen loyiha > shartnoma > obyekt and opens a sheet to change it
 * quickly. Hidden until the company has objects. The same choice narrows the Obyektlar tree.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContextBar(vm: ScopeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var open by rememberSaveable { mutableStateOf(false) }
    if (ui.leaves.isEmpty()) return
    val noL = stringResource(R.string.ier_no_loyiha); val noS = stringResource(R.string.ier_no_shartnoma); val all = stringResource(R.string.ier_all)
    val summary = scopeSummary(ui.scope, ui.hier, ui.leaves, noL, noS)
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clickable { open = true }.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.AccountTree, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(10.dp))
            Text(summary ?: stringResource(R.string.ier_context_all), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = if (summary == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(Icons.Filled.ArrowDropDown, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (open) ModalBottomSheet(onDismissRequest = { open = false }, containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp)) {
            Text(stringResource(R.string.ier_context), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(vertical = 8.dp))
            val s = ui.scope
            val lOpts = loyihaOptions(ui.leaves, ui.hier).map { QFilterOption(it.id, it.title ?: noL) }
            val sOpts = shartnomaOptions(ui.leaves, ui.hier, s.loyihaId).map { QFilterOption(it.id, it.title ?: noS) }
            val oOpts = scopedLeaves(ui.leaves, ui.hier, s).map { QFilterOption(it.id, it.name) }
            QScopePanel(
                lOpts.firstOrNull { it.id == s.loyihaId }, lOpts, { vm.set(s.copy(loyihaId = it.id, shartnomaId = null)) },
                sOpts.firstOrNull { it.id == s.shartnomaId }, sOpts, { vm.set(s.copy(shartnomaId = it.id)) },
                oOpts.firstOrNull { it.id == s.obyektId }, oOpts, { vm.set(s.copy(obyektId = it.id)) },
                { vm.set(WorkScope()) },
                texts = QScopeTexts(stringResource(R.string.ier_context), stringResource(R.string.ier_loyiha), stringResource(R.string.ier_shartnoma), stringResource(R.string.ier_obyekt), all, stringResource(R.string.ier_context_clear)),
            )
        }
    }
}