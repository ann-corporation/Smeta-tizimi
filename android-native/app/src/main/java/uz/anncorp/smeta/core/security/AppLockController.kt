package uz.anncorp.smeta.core.security

import android.content.SharedPreferences
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Non-secret lock preferences (cached copy of the server setting so the lock works before/without the network). No PIN or key material here. */
class LockPrefs(private val sp: SharedPreferences) {
    fun enabled() = sp.getBoolean("enabled", false)
    fun timeoutMin() = sp.getInt("timeout", LockState.DEFAULT_MIN)
    fun lastActive(): Long = sp.getLong("last_active", System.currentTimeMillis())
    fun save(enabled: Boolean, timeoutMin: Int) { sp.edit().putBoolean("enabled", enabled).putInt("timeout", timeoutMin).apply() }
    fun saveLastActive(t: Long) { sp.edit().putLong("last_active", t).apply() }
    fun clear() { sp.edit().clear().apply() }
}

data class PromptTexts(val title: String, val subtitle: String, val cancel: String)
data class StepUpRequest(val methods: List<String>)

/**
 * UI-facing owner of the lock state machine + step-up requests. Lifecycle: [onStart]/[onStop] from the Activity, [touch] on interaction, [tick] ~1/s.
 * Unlock: server PIN check ([unlockWithPin], needs network) or local BiometricPrompt ([unlockLocal], works offline). Step-up (money/signature):
 * ApiClient calls [request] on 403 STEP_UP_KERAK -> UI shows the confirm sheet -> PIN or Keystore device-key assertion -> server token in [TasdiqStore].
 */
class AppLockController(
    private val repo: QulfRepository,
    private val tasdiq: TasdiqStore,
    private val prefs: LockPrefs,
    private val deviceKey: DeviceKey,
    private val clock: () -> Long = System::currentTimeMillis,
) : StepUpHandler {
    private val state = LockState(clock, prefs.lastActive()).also { it.configure(prefs.enabled(), prefs.timeoutMin()) }
    private val _locked = MutableStateFlow(state.onForeground())
    val locked: StateFlow<Boolean> = _locked.asStateFlow()
    private val _qulf = MutableStateFlow<QulfState?>(null)
    val qulf: StateFlow<QulfState?> = _qulf.asStateFlow()
    private val _stepUp = MutableStateFlow<StepUpRequest?>(null)
    val stepUp: StateFlow<StepUpRequest?> = _stepUp.asStateFlow()
    private var pending: CompletableDeferred<Boolean>? = null

    /** FLAG_SECURE (no screenshots, blank recents thumbnail) while the lock is on. */
    val protectScreen get() = state.enabled

    fun onStart() { _locked.value = state.onForeground() }
    fun onStop() { state.onBackground(); prefs.saveLastActive(clock()) }
    fun touch() { state.touch() }
    fun tick() { _locked.value = state.tick() }
    fun lockNow() { state.lockNow(); _locked.value = state.locked }

    /** Pull the server setting (PIN set? timeout? devices?). A transient failure keeps the cached values. */
    suspend fun refresh() {
        val s = repo.state() ?: return
        _qulf.value = s
        state.configure(s.enabled, s.timeoutMin)
        prefs.save(s.enabled, s.timeoutMin)
        _locked.value = state.locked
    }

    /** Sign-out / revoked device: forget everything local. */
    fun reset() {
        tasdiq.clear(); prefs.clear(); state.configure(false, LockState.DEFAULT_MIN); state.unlock()
        _qulf.value = null; _locked.value = false
        pending?.complete(false)
    }

    suspend fun unlockWithPin(pin: String): QulfOutcome {
        val r = repo.verifyPin(pin)
        if (r.ok) { state.unlock(); _locked.value = false }
        return r
    }
    fun unlockLocal() { state.unlock(); _locked.value = false }

    // ---- step-up -------------------------------------------------------------------------------------------------------
    override suspend fun request(methods: List<String>): Boolean {
        pending?.let { return it.await() }
        val d = CompletableDeferred<Boolean>()
        pending = d
        _stepUp.value = StepUpRequest(methods)
        return try { d.await() } finally { pending = null; _stepUp.value = null }
    }
    fun completeStepUp(ok: Boolean) { pending?.complete(ok) }

    suspend fun stepUpWithPin(pin: String): QulfOutcome {
        val r = repo.verifyPin(pin)
        if (r.ok) completeStepUp(true)
        return r
    }

    /** True when a Keystore device key is registered for this install. */
    fun hasDeviceKey() = deviceKey.exists()

    /** Biometric (device key) assertion: one strong-biometric check -> server verifies the signature -> tasdiq token. */
    suspend fun assertWithDevice(a: FragmentActivity, t: PromptTexts, forStepUp: Boolean): Boolean {
        val cid = deviceKey.credentialId() ?: return false
        val ch = repo.assertStart() ?: return false
        if (cid !in ch.credentialIds) return false
        val sig = try { deviceKey.signature() } catch (e: Throwable) { if (DeviceKey.isInvalidated(e)) deviceKey.delete(); return false }
        val der = BiometricGate.sign(a, sig, QulfRepository.message("kirish", ch.challenge, cid), t.title, t.subtitle, t.cancel) ?: return false
        val ok = repo.assertFinish(ch.challengeToken, cid, der).ok
        if (ok) { if (forStepUp) completeStepUp(true) else unlockLocal() }
        return ok
    }

    /** Creates the Keystore key, proves possession by signing the server challenge, registers the public key. */
    suspend fun registerDevice(a: FragmentActivity, t: PromptTexts, name: String): QulfOutcome {
        val ch = repo.registerStart() ?: return QulfOutcome(false, "QURILMA")
        val spki = deviceKey.create()
        val cid = DeviceKey.credentialId(spki)
        val sig = try { deviceKey.signature() } catch (e: Throwable) { deviceKey.delete(); return QulfOutcome(false, "QURILMA") }
        val der = BiometricGate.sign(a, sig, QulfRepository.message("reg", ch.challenge, cid), t.title, t.subtitle, t.cancel)
            ?: run { deviceKey.delete(); return QulfOutcome(false, "BEKOR") }
        val r = repo.registerFinish(ch.challengeToken, spki, der, name)
        if (r.ok) refresh() else deviceKey.delete()
        return r
    }

    suspend fun setPin(new: String, old: String?) = repo.setPin(new, old)
    suspend fun removePin(pin: String) = repo.removePin(pin)
    suspend fun setTimeout(min: Int) = repo.setTimeout(min)

    suspend fun removeDevice(id: Long): QulfOutcome {
        val r = repo.removeDevice(id)
        if (r.ok) { refresh(); if (_qulf.value?.devices?.none { it.kind == "android" } == true) deviceKey.delete() }
        return r
    }
}
