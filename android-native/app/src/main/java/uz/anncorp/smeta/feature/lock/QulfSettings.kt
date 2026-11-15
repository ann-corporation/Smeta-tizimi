package uz.anncorp.smeta.feature.lock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.security.AppLockController
import uz.anncorp.smeta.core.security.BiometricGate
import uz.anncorp.smeta.core.security.LockState
import uz.anncorp.smeta.core.security.QulfOutcome
import javax.inject.Inject

@HiltViewModel
class QulfSettingsViewModel @Inject constructor(val lock: AppLockController) : ViewModel()

private val TIMEOUTS = listOf(1, 2, 5, 10, 15, 30, 60)

/** Profile -> "PIN and biometrics": set/change/remove PIN, bind this phone's Keystore key (BiometricPrompt), auto-lock timeout. */
@Composable
fun QulfSettings(vm: QulfSettingsViewModel = hiltViewModel()) {
    val c = vm.lock
    val st by c.qulf.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current.findActivity() as? FragmentActivity
    val pt = promptTexts()
    var oldPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { c.refresh() }

    fun report(r: QulfOutcome, okMsg: Int) {
        msg = when {
            r.ok -> okMsg
            r.network -> R.string.qulf_offline
            r.code == "PIN_FORMAT" -> R.string.qulf_pin_format
            r.code == "PIN_ZAIF" -> R.string.qulf_pin_weak
            r.code == "PIN_NOTOGRI" || r.code == "ESKI_PIN_KERAK" -> R.string.qulf_pin_wrong
            r.code == "BLOKLANGAN" -> R.string.qulf_pin_blocked
            r.code == "QAYTA_KIRISH_KERAK" -> R.string.qulf_relogin
            r.code == "STEP_UP_KERAK" -> R.string.qulf_step_needed
            else -> R.string.qulf_failed
        }
    }
    fun run(okMsg: Int, block: suspend () -> QulfOutcome) { scope.launch { busy = true; val r = block(); busy = false; report(r, okMsg); if (r.ok) { oldPin = ""; newPin = ""; c.refresh() } } }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val pinSet = st?.pinSet == true
        Text(stringResource(if (pinSet) R.string.qulf_pin_set else R.string.qulf_pin_unset), style = MaterialTheme.typography.bodyMedium)
        if (pinSet) OutlinedTextField(oldPin, { oldPin = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.qulf_old_pin)) }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(newPin, { newPin = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.qulf_new_pin)) }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { run(R.string.qulf_pin_saved) { c.setPin(newPin, oldPin) } }, enabled = !busy && newPin.length >= 4) { Text(stringResource(if (pinSet) R.string.qulf_change_pin else R.string.qulf_set_pin)) }
            if (pinSet) OutlinedButton(onClick = { run(R.string.qulf_pin_removed) { c.removePin(oldPin) } }, enabled = !busy && oldPin.length >= 4) { Text(stringResource(R.string.qulf_remove_pin)) }
        }

        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.qulf_timeout), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            val cur = st?.timeoutMin ?: LockState.DEFAULT_MIN
            TIMEOUTS.forEach { m -> FilterChip(selected = cur == m, onClick = { run(R.string.qulf_saved) { c.setTimeout(m) } }, enabled = st?.enabled == true && !busy, label = { Text("$m") }) }
        }

        Spacer(Modifier.height(8.dp))
        val bound = st?.devices?.any { it.kind == "android" } == true
        Text(stringResource(if (bound) R.string.qulf_bio_bound else R.string.qulf_bio_unbound), style = MaterialTheme.typography.bodyMedium)
        if (activity != null && !BiometricGate.strongAvailable(activity)) Text(stringResource(R.string.qulf_bio_unavailable), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else if (activity != null) {
            if (!bound) Button(onClick = { run(R.string.qulf_bio_added) { c.registerDevice(activity, pt, android.os.Build.MODEL ?: "Android") } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.qulf_bio_add)) }
            else OutlinedButton(onClick = { st?.devices?.firstOrNull { it.kind == "android" }?.let { d -> run(R.string.qulf_bio_removed) { c.removeDevice(d.id) } } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.qulf_bio_remove)) }
        }
        msg?.let { Text(stringResource(it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary) }
    }
}