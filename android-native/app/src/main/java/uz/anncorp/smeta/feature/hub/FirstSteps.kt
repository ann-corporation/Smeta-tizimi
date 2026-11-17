package uz.anncorp.smeta.feature.hub

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SinovError
import uz.anncorp.smeta.core.data.SinovState
import uz.anncorp.smeta.feature.onboarding.messageRes

enum class FirstStepId { DEMO, UPLOAD, F2, AI, REAL }

data class FirstStep(val id: FirstStepId, val done: Boolean, val available: Boolean)

/** Pure: the checklist rows. The AI step is hidden when the assistant is off; the sample step is shown disabled until the server has a sample. */
fun firstSteps(s: SinovState, jarvis: Boolean): List<FirstStep> = buildList {
    add(FirstStep(FirstStepId.DEMO, done = s.demoOpened, available = s.demoOpened || s.demoAvailable))
    add(FirstStep(FirstStepId.UPLOAD, done = false, available = true))
    add(FirstStep(FirstStepId.F2, done = false, available = true))
    if (jarvis) add(FirstStep(FirstStepId.AI, done = false, available = true))
    add(FirstStep(FirstStepId.REAL, done = false, available = true))
}

@StringRes
private fun FirstStepId.label(): Int = when (this) {
    FirstStepId.DEMO -> R.string.fs_demo
    FirstStepId.UPLOAD -> R.string.fs_upload
    FirstStepId.F2 -> R.string.fs_f2
    FirstStepId.AI -> R.string.fs_ai
    FirstStepId.REAL -> R.string.fs_real
}

@StringRes
private fun FirstStep.action(): Int = when (id) {
    FirstStepId.DEMO -> if (done) R.string.fs_open else R.string.fs_open_demo
    FirstStepId.UPLOAD -> R.string.fs_go
    FirstStepId.F2 -> R.string.fs_go
    FirstStepId.AI -> R.string.fs_go
    FirstStepId.REAL -> R.string.fs_go
}

/** "Birinchi qadamlar": shown on the hub while the account only has the trial workplace; also shows the token balance. */
@Composable
fun FirstStepsCard(state: SinovState, jarvis: Boolean, busy: Boolean, error: SinovError?, onStep: (FirstStepId) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.fs_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(stringResource(R.string.fs_balance, Math.round(state.balance ?: 0.0)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            if (error != null) Text(stringResource(error.messageRes()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            firstSteps(state, jarvis).forEach { step ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.CheckCircle, null, Modifier.size(20.dp), tint = if (step.done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)
                    Text(stringResource(step.id.label()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                    if (step.available) OutlinedButton(onClick = { onStep(step.id) }, enabled = !busy, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp)) { Text(stringResource(step.action()), maxLines = 1) }
                    else Text(stringResource(R.string.fs_soon), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(stringResource(R.string.fs_note), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
