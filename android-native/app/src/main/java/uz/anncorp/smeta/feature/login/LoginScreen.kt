package uz.anncorp.smeta.feature.login

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.ui.QurLogo
import uz.anncorp.smeta.core.ui.messageRes

@Composable
fun LoginScreen(onSignedIn: () -> Unit, onSignUp: () -> Unit = {}, onInvite: () -> Unit = {}, vm: LoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val focus = LocalFocusManager.current

    LaunchedEffect(Unit) {
        vm.events.collect { e ->
            when (e) {
                LoginEvent.SignedIn -> onSignedIn()
                is LoginEvent.OpenLink -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(e.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try { context.startActivity(intent) } catch (_: ActivityNotFoundException) { /* no browser: user can cancel */ }
                }
            }
        }
    }

    var showPassword by remember { mutableStateOf(false) }
    val enabled = !state.busy

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(32.dp))
                QurLogo(72.dp)
                Spacer(Modifier.height(20.dp))
                Text("QURAI", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.height(36.dp))
                Text(stringResource(R.string.login_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.login_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(24.dp))

                OutlinedTextField(
                    value = state.login, onValueChange = vm::onLogin, enabled = enabled, singleLine = true,
                    label = { Text(stringResource(R.string.field_login)) }, modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.password, onValueChange = vm::onPassword, enabled = enabled, singleLine = true,
                    label = { Text(stringResource(R.string.field_password)) }, modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); vm.signInPassword() }),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                painterResource(if (showPassword) R.drawable.ic_visibility_off else R.drawable.ic_visibility),
                                contentDescription = stringResource(R.string.show_password),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                )

                val message = when {
                    state.fillError -> stringResource(R.string.err_fill_fields)
                    state.error != null -> stringResource(state.error!!.messageRes())
                    else -> null
                }
                if (message != null) {
                    Spacer(Modifier.height(16.dp))
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                        Text(message, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
                    }
                }

                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { focus.clearFocus(); vm.signInPassword() }, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium,
                ) {
                    if (state.busy && !state.telegramWaiting) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Text(stringResource(R.string.btn_sign_in), style = MaterialTheme.typography.titleMedium)
                }

                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
                    Text(stringResource(R.string.login_or), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
                }
                Spacer(Modifier.height(20.dp))

                OutlinedButton(
                    onClick = { vm.signInGoogle(context) }, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium,
                ) { Text(stringResource(R.string.btn_google), style = MaterialTheme.typography.titleSmall) }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = vm::signInTelegram, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium,
                ) { Text(stringResource(R.string.btn_telegram), style = MaterialTheme.typography.titleSmall) }

                Spacer(Modifier.height(24.dp))
                Text(stringResource(R.string.login_new_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onSignUp, enabled = enabled, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.login_create_account), style = MaterialTheme.typography.titleSmall) }
                TextButton(onClick = onInvite, enabled = enabled, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.login_have_invite), style = MaterialTheme.typography.titleSmall) }
                if (state.telegramWaiting) {
                    Spacer(Modifier.height(20.dp))
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
                            Spacer(Modifier.height(12.dp))
                            Text(stringResource(R.string.tg_waiting_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                            Spacer(Modifier.height(4.dp))
                            Text(stringResource(R.string.tg_waiting_body), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                            state.telegramCode?.let {
                                Spacer(Modifier.height(10.dp))
                                Text(it, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                            }
                            TextButton(onClick = vm::cancelTelegram) { Text(stringResource(R.string.tg_cancel)) }
                        }
                    }
                }
            }
        }
    }
}
