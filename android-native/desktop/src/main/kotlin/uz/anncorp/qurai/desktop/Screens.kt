package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.core.data.AuthError
import uz.anncorp.smeta.core.data.AuthOutcome
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.SessionCheck
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.data.f2ListRequest
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.objectsRequest
import uz.anncorp.smeta.core.data.parseF2List
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.feature.ombor.OmborScope
import uz.anncorp.smeta.feature.ombor.StockRow
import uz.anncorp.smeta.feature.ombor.filterStock
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.objectStockRequest
import uz.anncorp.smeta.feature.ombor.parseObjectStock
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class SessionUser(val id: Long, val email: String, val role: String, val offline: Boolean)

/** Last known user, so the app can open offline (the id selects the encrypted cache folder). */
fun saveMe(sv: Services, u: SessionUser) = sv.saveLastUser("${u.id}\n${u.email}\n${u.role}")
fun loadMe(sv: Services): SessionUser? = sv.loadLastUser()?.split("\n")?.takeIf { it.size >= 3 }?.let { v -> v[0].toLongOrNull()?.let { SessionUser(it, v[1], v[2], false) } }

// ---------- strings (Uzbek Latin; i18n of the desktop app comes with W2) ----------
private object S {
    const val login = "Kirish"; const val loginLabel = "Login (email yoki telefon)"; const val pass = "Parol"
    const val bad = "Login yoki parol noto'g'ri"; const val net = "Tarmoqqa ulanib bo'lmadi"; const val rate = "Juda ko'p urinish, biroz kuting"
    const val server = "Server xatosi, keyinroq urinib ko'ring"; const val limit = "Qurilmalar limiti to'lgan"; const val update = "Ilovani yangilash kerak"
    const val off = "Oflayn: oxirgi saqlangan nusxa"; const val forbidden = "Bu bo'limni ko'rishga ruxsat yo'q"; const val nodata = "Ma'lumot yo'q (oflayn va nusxa saqlanmagan)"
}

@Composable
fun BootScreen() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
fun LoginScreen(sv: Services, onDone: (SessionUser) -> Unit) {
    var login by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun submit() {
        if (busy || login.isBlank() || pass.isEmpty()) return
        busy = true; err = null
        scope.launch {
            val s = sv.auth.newSession()
            val out = sv.auth.loginPassword(s, login.trim(), pass)
            pass = ""
            when (out) {
                AuthOutcome.Success -> {
                    val c = sv.session.check()
                    if (c is SessionCheck.Valid) { Log.i("login ok"); onDone(SessionUser(c.info.userId, c.info.email, c.info.rol, false)) } else { err = S.server; busy = false }
                }
                is AuthOutcome.Failure -> {
                    Log.i("login failed ${out.error}")
                    err = when (out.error) {
                        AuthError.NETWORK -> S.net; AuthError.RATE_LIMITED -> S.rate; AuthError.SERVER -> S.server
                        AuthError.DEVICE_LIMIT -> S.limit; AuthError.UPDATE_REQUIRED -> S.update; else -> S.bad
                    }
                    busy = false
                }
            }
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(Modifier.width(380.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("QURAI", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            OutlinedTextField(login, { login = it }, label = { Text(S.loginLabel) }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !busy)
            OutlinedTextField(
                pass, { pass = it }, label = { Text(S.pass) }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(), enabled = !busy,
            )
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = { submit() }, enabled = !busy && login.isNotBlank() && pass.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(44.dp)) {
                if (busy) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp) else Text(S.login)
            }
            Text("v${BuildInfo.VERSION}", style = MaterialTheme.typography.labelSmall)
        }
    }
}

