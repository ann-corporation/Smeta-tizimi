package uz.anncorp.smeta.feature.signup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.AuthError
import uz.anncorp.smeta.core.ui.messageRes

/** Shared frame: back arrow, title, hint, body, optional error, primary action. */
@Composable
internal fun FormFrame(title: String, hint: String?, onBack: () -> Unit, error: String?, busy: Boolean, action: String, onAction: () -> Unit, body: @Composable () -> Unit) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 8.dp)) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.p1_back)) }
                Spacer(Modifier.height(8.dp))
                Text(title, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
                if (hint != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(24.dp))
                body()
                if (error != null) {
                    Spacer(Modifier.height(16.dp))
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                        Text(error, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
                    }
                }
                Spacer(Modifier.height(20.dp))
                Button(onClick = onAction, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Text(action, style = MaterialTheme.typography.titleMedium)
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
internal fun Field(value: String, onChange: (String) -> Unit, label: String, enabled: Boolean = true, type: KeyboardType = KeyboardType.Text, ime: ImeAction = ImeAction.Next, secret: Boolean = false, isError: Boolean = false) {
    OutlinedTextField(
        value = value, onValueChange = onChange, enabled = enabled, singleLine = true, isError = isError,
        label = { Text(label) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = type, imeAction = ime),
    )
    Spacer(Modifier.height(12.dp))
}

/** E-mail sign-up: e-mail -> 6-digit code -> name + password. Same server flow as the website. */
@Composable
fun SignUpScreen(onBack: () -> Unit, onSignedIn: () -> Unit, vm: SignUpViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.events.collect { onSignedIn() } }
    val error = when {
        s.fillError -> stringResource(when (s.step) {
            SignUpStep.EMAIL -> R.string.err_email_bad
            SignUpStep.CODE -> R.string.err_code_format
            SignUpStep.DETAILS -> R.string.err_name_password
        })
        s.error != null -> stringResource(s.error!!.messageRes())
        else -> null
    }
    when (s.step) {
        SignUpStep.EMAIL -> FormFrame(stringResource(R.string.su_title), stringResource(R.string.su_email_hint), onBack, error, s.busy, stringResource(R.string.su_send_code), vm::sendCode) {
            Field(s.email, vm::onEmail, stringResource(R.string.su_email), !s.busy, KeyboardType.Email, ImeAction.Done, isError = s.fillError)
        }
        SignUpStep.CODE -> FormFrame(stringResource(R.string.su_code_title), stringResource(R.string.su_code_hint, s.email.trim()), vm::back, error, s.busy, stringResource(R.string.su_continue), vm::confirmCode) {
            Field(s.code, vm::onCode, stringResource(R.string.su_code), !s.busy, KeyboardType.NumberPassword, ImeAction.Done, isError = s.fillError)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) { TextButton(onClick = vm::sendCode, enabled = !s.busy) { Text(stringResource(R.string.su_resend)) } }
        }
        SignUpStep.DETAILS -> FormFrame(stringResource(R.string.su_details_title), stringResource(R.string.su_details_hint), vm::back, error, s.busy, stringResource(R.string.su_create), vm::create) {
            Field(s.name, vm::onName, stringResource(R.string.su_name), !s.busy, isError = s.fillError)
            Field(s.password, vm::onPassword, stringResource(R.string.field_password), !s.busy, KeyboardType.Password, ImeAction.Done, secret = true, isError = s.fillError)
            Text(stringResource(R.string.su_password_rule), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Invitation: a /taklif link, or the invited phone number plus the 8-digit code, and a new password. */
@Composable
fun InviteScreen(onBack: () -> Unit, onSignedIn: () -> Unit, vm: SignUpViewModel = hiltViewModel()) {
    val s by vm.invite.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.events.collect { onSignedIn() } }
    val error = when {
        s.fillError -> stringResource(R.string.err_invite_fill)
        s.error != null -> stringResource(s.error!!.messageRes())
        else -> null
    }
    FormFrame(stringResource(R.string.inv_title), stringResource(R.string.inv_hint), onBack, error, s.busy, stringResource(R.string.inv_join), vm::acceptInvite) {
        Field(s.linkOrPhone, vm::onInviteTarget, stringResource(R.string.inv_link_or_phone), !s.busy, KeyboardType.Text)
        Field(s.code, vm::onInviteCode, stringResource(R.string.inv_code), !s.busy, KeyboardType.NumberPassword)
        Field(s.password, vm::onInvitePassword, stringResource(R.string.inv_new_password), !s.busy, KeyboardType.Password, ImeAction.Done, secret = true)
        Text(stringResource(R.string.inv_existing_account), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
