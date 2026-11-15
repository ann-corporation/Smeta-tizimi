package uz.anncorp.smeta.feature.lock

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.security.AppLockController
import uz.anncorp.smeta.core.security.BiometricGate
import uz.anncorp.smeta.core.security.PromptTexts
import uz.anncorp.smeta.core.security.QulfOutcome

tailrec fun Context.findActivity(): Activity? = when (this) { is Activity -> this; is ContextWrapper -> baseContext.findActivity(); else -> null }

/** Set by MainActivity: the whole app is FLAG_SECURE while the lock is on; SecureScreen must not clear it then. */
object ScreenSecurity { @Volatile var global = false }

/** FLAG_SECURE while this composable is in the composition (approval / payment screens): no screenshots, blank recents thumbnail. */
@Composable
fun SecureScreen() {
    val a = LocalContext.current.findActivity()
    DisposableEffect(a) {
        a?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (!ScreenSecurity.global) a?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

/** Mounted once above the NavHost: the full-screen lock (content hidden) or the step-up confirm sheet. */
@Composable
fun AppLockLayer(c: AppLockController, onSignOut: () -> Unit = {}) {
    val locked by c.locked.collectAsStateWithLifecycle()
    val step by c.stepUp.collectAsStateWithLifecycle()
    val qulf by c.qulf.collectAsStateWithLifecycle()
    val activity = LocalContext.current.findActivity() as? FragmentActivity
    val hasDevice = c.hasDeviceKey() && (qulf?.devices?.any { it.kind == "android" } ?: true)
    val pt = promptTexts()
    if (locked) {
        SecureScreen()
        PinScreen(
            title = stringResource(R.string.qulf_locked_title), hint = stringResource(R.string.qulf_locked_hint), onPin = { c.unlockWithPin(it) },
            offerBiometric = activity != null && BiometricGate.unlockAvailable(activity), autoBiometric = true,
            onBiometric = {
                val t = pt
                if (hasDevice) c.assertWithDevice(activity!!, t, forStepUp = false) || BiometricGate.unlock(activity, t.title, t.subtitle, t.cancel).also { if (it) c.unlockLocal() }
                else BiometricGate.unlock(activity!!, t.title, t.subtitle, t.cancel).also { if (it) c.unlockLocal() }
            },
            pinAllowed = qulf?.pinSet ?: true, fullScreen = true, onCancel = null,
            pinLength = qulf?.pinLength, attemptsLeft = qulf?.attemptsLeft, blockedSeconds = if (qulf?.pinStatus == "BLOKLANGAN") qulf?.secondsLeft ?: 0 else 0, onSignOut = onSignOut,
        )
    } else if (step != null) {
        val methods = step!!.methods
        SecureScreen()
        PinScreen(
            title = stringResource(R.string.qulf_confirm_title), hint = stringResource(R.string.qulf_confirm_hint), onPin = { c.stepUpWithPin(it) },
            offerBiometric = hasDevice && activity != null && "qurilma" in methods, autoBiometric = hasDevice && "qurilma" in methods,
            onBiometric = { c.assertWithDevice(activity!!, pt, forStepUp = true) },
            pinAllowed = "pin" in methods, fullScreen = false, onCancel = { c.completeStepUp(false) },
            pinLength = qulf?.pinLength, attemptsLeft = qulf?.attemptsLeft, blockedSeconds = if (qulf?.pinStatus == "BLOKLANGAN") qulf?.secondsLeft ?: 0 else 0,
        )
    }
}

@Composable
fun promptTexts() = PromptTexts(stringResource(R.string.qulf_prompt_title), stringResource(R.string.qulf_prompt_subtitle), stringResource(R.string.qulf_cancel))

@Composable
private fun PinScreen(
    title: String, hint: String, onPin: suspend (String) -> QulfOutcome, offerBiometric: Boolean, autoBiometric: Boolean,
    onBiometric: suspend () -> Boolean, pinAllowed: Boolean, fullScreen: Boolean, onCancel: (() -> Unit)?,
    pinLength: Int? = null, attemptsLeft: Int? = null, blockedSeconds: Int = 0, onSignOut: (() -> Unit)? = null,
) {
    var pin by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    fun biometric() { scope.launch { busy = true; val ok = onBiometric(); busy = false; if (!ok) error = R.string.qulf_bio_failed } }
    LaunchedEffect(Unit) { if (autoBiometric && offerBiometric) { delay(250); biometric() } }
    fun submit() {
        if (pin.length < 4 || busy || blockedSeconds > 0) return
        scope.launch {
            busy = true; error = null
            val r = onPin(pin); busy = false; pin = ""
            if (!r.ok) error = when { r.network -> R.string.qulf_offline; r.code == "BLOKLANGAN" -> R.string.qulf_pin_blocked; r.code == "QAYTA_KIRISH_KERAK" -> R.string.qulf_relogin; else -> R.string.qulf_pin_wrong }
        }
    }
    // PIN length known (server `pin_uzunlik`): submit automatically on the last digit.
    LaunchedEffect(pin) { if (pinLength != null && pin.length == pinLength) submit() }
    // Opaque surface that swallows all touches: nothing underneath is visible or clickable.
    Surface(color = if (fullScreen) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.background.copy(alpha = 0.97f),
        modifier = Modifier.fillMaxSize().pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } }) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(title, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(8.dp))
            Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            if (pinAllowed) {
                Spacer(Modifier.height(20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    repeat(pinLength ?: pin.length.coerceIn(4, 6)) { i -> Box(Modifier.size(12.dp).clip(CircleShape).background(if (i < pin.length) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) }
                }
                Spacer(Modifier.height(16.dp))
                Keypad(onDigit = { if (pin.length < (pinLength ?: 6) && !busy && blockedSeconds <= 0) pin += it }, onDelete = { if (!busy) pin = pin.dropLast(1) }, onOk = ::submit, canOk = pin.length >= 4 && !busy && blockedSeconds <= 0)
            }
            if (blockedSeconds > 0) { Spacer(Modifier.height(10.dp)); Text(stringResource(R.string.qulf_pin_blocked_min, (blockedSeconds + 59) / 60), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center) }
            else if (pinAllowed && attemptsLeft != null && attemptsLeft < 5) { Spacer(Modifier.height(6.dp)); Text(stringResource(R.string.qulf_attempts_left, attemptsLeft), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            error?.let { Spacer(Modifier.height(10.dp)); Text(stringResource(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center) }
            Spacer(Modifier.height(12.dp))
            if (offerBiometric) OutlinedButton(onClick = ::biometric, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.qulf_biometric)) }
            if (onCancel != null) TextButton(onClick = onCancel) { Text(stringResource(R.string.qulf_cancel)) }
            // Never a trap: the full-screen lock always offers a way out (forgot PIN -> sign out -> fresh login -> set a new PIN without the old one within 10 min).
            if (onCancel == null && onSignOut != null) {
                if (pinAllowed) TextButton(onClick = onSignOut) { Text(stringResource(R.string.qulf_forgot_pin)) }
                TextButton(onClick = onSignOut) { Text(stringResource(R.string.qulf_sign_out)) }
            }
        }
    }
}

@Composable
private fun Keypad(onDigit: (String) -> Unit, onDelete: () -> Unit, onOk: () -> Unit, canOk: Boolean) {
    val rows = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { r -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { r.forEach { d -> Key(d) { onDigit(d) } } } }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Key("⌫", onDelete)
            Key("0") { onDigit("0") }
            Button(onClick = onOk, enabled = canOk, modifier = Modifier.size(width = 72.dp, height = 56.dp)) { Text(stringResource(R.string.qulf_ok)) }
        }
    }
}

@Composable
private fun Key(label: String, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.medium, modifier = Modifier.size(width = 72.dp, height = 56.dp).clickable(onClick = onClick)) {
        Box(contentAlignment = Alignment.Center) { Text(label, style = MaterialTheme.typography.titleLarge) }
    }
}
