package uz.anncorp.smeta.feature.onboarding

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.OnboardError
import uz.anncorp.smeta.core.ui.QurLogo

@StringRes
fun OnboardError.messageRes(): Int = when (this) {
    OnboardError.NAME_SHORT -> R.string.ob_err_name
    OnboardError.INN_INVALID -> R.string.ob_err_inn
    OnboardError.INN_TAKEN -> R.string.ob_err_inn_taken
    OnboardError.ALREADY_OWN -> R.string.ob_err_already_own
    OnboardError.CODE_INVALID -> R.string.ob_err_code
    OnboardError.CODE_EXPIRED -> R.string.ob_err_code_expired
    OnboardError.CODE_FULL -> R.string.ob_err_code_full
    OnboardError.DAILY_LIMIT -> R.string.ob_err_limit
    OnboardError.NO_RIGHT -> R.string.ob_err_right
    OnboardError.NETWORK -> R.string.err_network
    OnboardError.SERVER -> R.string.err_server
}

private enum class Mode { CHOOSE, CREATE, JOIN }

/**
 * Shown to an account that has no workplace yet (a fresh Google/Telegram/e-mail sign-up). Same choices as the website's
 * "Kompaniyangizni oching": open your own company (you become its head), join with an invite code, or carry on without one.
 */
@Composable
fun OnboardingScreen(busy: Boolean, error: OnboardError?, onCreate: (String, String) -> Unit, onJoin: (String) -> Unit, onSkip: () -> Unit, onClearError: () -> Unit, onInvites: (() -> Unit)? = null,
    trial: uz.anncorp.smeta.core.data.SinovState? = null, trialBusy: Boolean = false, trialError: uz.anncorp.smeta.core.data.SinovError? = null, onTrial: () -> Unit = {}, forced: Boolean = false,
) {
    var mode by rememberSaveable { mutableStateOf(Mode.CHOOSE) }
    var name by rememberSaveable { mutableStateOf("") }
    var inn by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().statusBarsPadding(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(16.dp))
                QurLogo(56.dp)
                Spacer(Modifier.height(16.dp))
                Text(stringResource(R.string.ob_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.ob_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(24.dp))
                when (mode) {
                    Mode.CHOOSE -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (trial != null) TrialCard(busy = trialBusy, error = trialError, onStart = onTrial)
                        Button(onClick = { onClearError(); mode = Mode.CREATE }, modifier = Modifier.fillMaxWidth().height(56.dp), shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.ob_create), style = MaterialTheme.typography.titleMedium) }
                        OutlinedButton(onClick = { onClearError(); mode = Mode.JOIN }, modifier = Modifier.fillMaxWidth().height(56.dp), shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.ob_join), style = MaterialTheme.typography.titleMedium) }
                        if (onInvites != null && uz.anncorp.smeta.core.data.Features.USERNAME) OutlinedButton(onClick = onInvites, modifier = Modifier.fillMaxWidth().height(56.dp), shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.pe_invites_title), style = MaterialTheme.typography.titleMedium) }
                        TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(if (forced) R.string.p1_back else R.string.ob_skip)) }
                    }
                    Mode.CREATE -> {
                        Text(stringResource(R.string.ob_create_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(name, { name = it; onClearError() }, singleLine = true, enabled = !busy, label = { Text(stringResource(R.string.ob_company_name)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(inn, { inn = it.filter(Char::isDigit).take(9); onClearError() }, singleLine = true, enabled = !busy, label = { Text(stringResource(R.string.ob_inn)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done))
                        ErrorBox(error)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { onCreate(name, inn) }, enabled = !busy && name.trim().length >= 2 && (inn.isEmpty() || inn.length == 9), modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium) { Busy(busy, R.string.ob_create_go) }
                        TextButton(onClick = { onClearError(); mode = Mode.CHOOSE }, enabled = !busy) { Text(stringResource(R.string.p1_back)) }
                    }
                    Mode.JOIN -> {
                        Text(stringResource(R.string.ob_join_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(code, { code = it; onClearError() }, singleLine = true, enabled = !busy, label = { Text(stringResource(R.string.ob_code)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done))
                        ErrorBox(error)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { onJoin(code) }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium) { Busy(busy, R.string.ob_join_go) }
                        TextButton(onClick = { onClearError(); mode = Mode.CHOOSE }, enabled = !busy) { Text(stringResource(R.string.p1_back)) }
                    }
                }
            }
        }
    }
}

@StringRes
fun uz.anncorp.smeta.core.data.SinovError.messageRes(): Int = when (this) {
    uz.anncorp.smeta.core.data.SinovError.LIMIT -> R.string.sn_err_limit
    uz.anncorp.smeta.core.data.SinovError.ALREADY_HAS -> R.string.sn_err_already
    uz.anncorp.smeta.core.data.SinovError.NO_DEMO -> R.string.sn_err_no_demo
    uz.anncorp.smeta.core.data.SinovError.AUTH -> R.string.sn_err_auth
    uz.anncorp.smeta.core.data.SinovError.NETWORK -> R.string.err_network
    uz.anncorp.smeta.core.data.SinovError.SERVER -> R.string.err_server
}

/** One-tap trial start: personal trial workplace + [uz.anncorp.smeta.core.data.SINOV_TOKEN] tokens, no company name or tax id (same card as the website). */
@Composable
private fun TrialCard(busy: Boolean, error: uz.anncorp.smeta.core.data.SinovError?, onStart: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.sn_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(stringResource(R.string.sn_hint, uz.anncorp.smeta.core.data.SINOV_TOKEN), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            if (error != null) Text(stringResource(error.messageRes()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            Button(onClick = onStart, enabled = !busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = MaterialTheme.shapes.medium) {
                if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                else Text(stringResource(R.string.sn_start, uz.anncorp.smeta.core.data.SINOV_TOKEN), style = MaterialTheme.typography.titleMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            Text(stringResource(R.string.sn_once), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun Busy(busy: Boolean, @StringRes label: Int) {
    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
    else Text(stringResource(label), style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun ErrorBox(error: OnboardError?) {
    if (error == null) return
    Spacer(Modifier.height(12.dp))
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(error.messageRes()), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
    }
}
