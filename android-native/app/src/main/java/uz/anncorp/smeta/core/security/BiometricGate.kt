package uz.anncorp.smeta.core.security

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.Signature
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** Thin BiometricPrompt wrapper (system UI; the app never sees biometric data). */
object BiometricGate {
    /** Strong biometrics enrolled? (needed for the Keystore device key). */
    fun strongAvailable(c: Context) = BiometricManager.from(c).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    /** App-lock unlock: strong biometrics, with the device PIN/pattern as the fallback on Android 11+ (the API 28-29 combination is not supported). */
    fun unlockAvailable(c: Context) = BiometricManager.from(c).canAuthenticate(unlockAuthenticators()) == BiometricManager.BIOMETRIC_SUCCESS

    private fun unlockAuthenticators() = if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_STRONG

    /** Local unlock without crypto (works offline). true = user authenticated. */
    suspend fun unlock(a: FragmentActivity, title: String, subtitle: String, cancel: String): Boolean = suspendCancellableCoroutine { cont ->
        val prompt = BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { if (cont.isActive) cont.resume(true) }
            override fun onAuthenticationError(code: Int, msg: CharSequence) { if (cont.isActive) cont.resume(false) }
        })
        val b = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle).setAllowedAuthenticators(unlockAuthenticators())
        if (Build.VERSION.SDK_INT < 30) b.setNegativeButtonText(cancel)
        prompt.authenticate(b.build())
        cont.invokeOnCancellation { prompt.cancelAuthentication() }
    }

    /** Signs [message] with the device key after a fresh strong-biometric check. null = cancelled / failed. */
    suspend fun sign(a: FragmentActivity, signature: Signature, message: ByteArray, title: String, subtitle: String, cancel: String): ByteArray? =
        suspendCancellableCoroutine { cont ->
            val prompt = BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val s = result.cryptoObject?.signature
                    val out = runCatching { s!!.update(message); s.sign() }.getOrNull()
                    if (cont.isActive) cont.resume(out)
                }
                override fun onAuthenticationError(code: Int, msg: CharSequence) { if (cont.isActive) cont.resume(null) }
            })
            val info = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle).setNegativeButtonText(cancel)
                .setAllowedAuthenticators(BIOMETRIC_STRONG).build()
            prompt.authenticate(info, BiometricPrompt.CryptoObject(signature))
            cont.invokeOnCancellation { prompt.cancelAuthentication() }
        }
}
