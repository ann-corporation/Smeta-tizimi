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
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QCard
import uz.anncorp.qurai.ui.components.QDivider
import uz.anncorp.qurai.ui.components.QSpinner
import uz.anncorp.qurai.ui.screens.QLoginScreen
import uz.anncorp.qurai.ui.screens.QLoginTexts
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

    val enabled = !state.busy
    val message = when {
        state.fillError -> stringResource(R.string.err_fill_fields)
        state.error != null -> stringResource(state.error!!.messageRes())
        else -> null
    }

    Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        QLoginScreen(
            login = state.login, onLogin = vm::onLogin, password = state.password, onPassword = vm::onPassword, busy = state.busy && !state.telegramWaiting, error = message,
            onSubmit = { focus.clearFocus(); vm.signInPassword() },
            texts = QLoginTexts(
                title = stringResource(R.string.login_title), subtitle = stringResource(R.string.login_subtitle), login = stringResource(R.string.field_login),
                password = stringResource(R.string.field_password), signIn = stringResource(R.string.btn_sign_in), showPassword = stringResource(R.string.show_password),
            ),
            logo = { QurLogo(72.dp) },
            extras = {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    QDivider(Modifier.weight(1f))
                    Text(stringResource(R.string.login_or), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    QDivider(Modifier.weight(1f))
                }
                QButton(stringResource(R.string.btn_google), { vm.signInGoogle(context) }, Modifier.fillMaxWidth(), enabled = enabled)
                QButton(stringResource(R.string.btn_telegram), vm::signInTelegram, Modifier.fillMaxWidth(), enabled = enabled)
                Text(stringResource(R.string.login_new_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                QButton(stringResource(R.string.login_create_account), onSignUp, Modifier.fillMaxWidth(), kind = QButtonKind.Ghost, enabled = enabled)
                QButton(stringResource(R.string.login_have_invite), onInvite, Modifier.fillMaxWidth(), kind = QButtonKind.Ghost, enabled = enabled)
                QButton(stringResource(R.string.login_demo), { uz.anncorp.smeta.core.demo.Demo.enter(context) }, Modifier.fillMaxWidth(), kind = QButtonKind.Ghost, enabled = enabled)
                if (state.telegramWaiting) QCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        QSpinner(28)
                        Text(stringResource(R.string.tg_waiting_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(stringResource(R.string.tg_waiting_body), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                        state.telegramCode?.let { Text(it, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary) }
                        QButton(stringResource(R.string.tg_cancel), vm::cancelTelegram, kind = QButtonKind.Ghost)
                    }
                }
            },
        )
    }
}