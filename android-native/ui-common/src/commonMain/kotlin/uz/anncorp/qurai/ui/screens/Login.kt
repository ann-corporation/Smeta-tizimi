package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QError
import uz.anncorp.qurai.ui.components.QIconButton
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

data class QLoginTexts(
    val title: String = "Tizimga kirish", val subtitle: String = "Hisobingiz bilan kiring", val login: String = "Login yoki email", val password: String = "Parol",
    val signIn: String = "Kirish", val showPassword: String = "Parolni ko'rsatish", val version: String? = null,
)

/**
 * The sign-in page of both apps (same card, fields, spacing as the site's /kirish): logo slot, login + password, error banner, primary button,
 * then [extras] for platform sign-in methods (Google / Telegram on the phone). Wide windows centre a 380dp card, phones fill the width.
 */
@Composable
fun QLoginScreen(
    login: String, onLogin: (String) -> Unit, password: String, onPassword: (String) -> Unit, busy: Boolean, error: String?, onSubmit: () -> Unit,
    modifier: Modifier = Modifier, texts: QLoginTexts = QLoginTexts(), logo: (@Composable () -> Unit)? = null, extras: (@Composable () -> Unit)? = null,
) {
    var show by remember { mutableStateOf(false) }
    val c = Q.colors
    Box(modifier.fillMaxSize(), contentAlignment = if (Q.layout.wide) Alignment.Center else Alignment.TopCenter) {
        Column(
            Modifier.widthIn(max = 420.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = QuraiTokens.SPACE_6.dp, vertical = QuraiTokens.SPACE_6.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp),
        ) {
            logo?.invoke()
            Text("QURAI", style = Q.type.headlineMedium, color = c.text)
            Column(Modifier.fillMaxWidth().padding(top = QuraiTokens.SPACE_4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(texts.title, style = Q.type.titleLarge, color = c.text)
                Text(texts.subtitle, style = Q.type.bodyMedium, color = c.textDim)
            }
            QInput(login, onLogin, Modifier.fillMaxWidth(), label = texts.login, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
            QInput(
                password, onPassword, Modifier.fillMaxWidth(), label = texts.password, enabled = !busy,
                visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                trailing = { QIconButton(if (show) QIcons.EyeOff else QIcons.Eye, texts.showPassword, { show = !show }) },
            )
            if (error != null) QError(error)
            QButton(texts.signIn, onSubmit, Modifier.fillMaxWidth(), kind = QButtonKind.Primary, enabled = !busy && login.isNotBlank() && password.isNotEmpty(), loading = busy)
            extras?.invoke()
            if (texts.version != null) Text(texts.version, Modifier.fillMaxWidth(), style = Q.type.labelSmall, color = c.textMute, textAlign = TextAlign.Center)
        }
    }
}
