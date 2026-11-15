package uz.anncorp.smeta.core.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Device-bound signing key in the Android Keystore (EC P-256, ES256/SHA256withECDSA). The private key never leaves secure hardware and EVERY
 * signature requires a fresh BIOMETRIC_STRONG authentication ([KeyGenParameterSpec.Builder.setUserAuthenticationRequired], per-use). It is invalidated
 * when biometrics are re-enrolled; the server then simply has a dead device that the user removes in Settings and registers again.
 * The public key (SPKI/X.509 DER) is registered on the server as a passkey-like credential (see [QulfRepository]).
 */
class DeviceKey(private val alias: String = ALIAS) {
    private fun ks() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun exists(): Boolean = runCatching { ks().containsAlias(alias) }.getOrDefault(false)

    /** Creates (replacing any old key) the key and returns the public key as SPKI DER. */
    fun create(): ByteArray {
        runCatching { ks().deleteEntry(alias) }
        val b = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
        if (Build.VERSION.SDK_INT >= 30) b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        else @Suppress("DEPRECATION") b.setUserAuthenticationValidityDurationSeconds(-1)
        val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        kpg.initialize(b.build())
        return kpg.generateKeyPair().public.encoded
    }

    fun publicKey(): ByteArray? = runCatching { ks().getCertificate(alias)?.publicKey?.encoded }.getOrNull()

    /** credId = base64url(SHA-256(SPKI)); the server derives the same value. */
    fun credentialId(): String? = publicKey()?.let { credentialId(it) }

    /** A Signature initialised for signing; throws [KeyPermanentlyInvalidatedException] when the biometrics changed. Pass it in a BiometricPrompt.CryptoObject. */
    fun signature(): Signature {
        val pk = ks().getKey(alias, null) as PrivateKey
        return Signature.getInstance("SHA256withECDSA").apply { initSign(pk) }
    }

    fun delete() { runCatching { ks().deleteEntry(alias) } }

    companion object {
        const val ALIAS = "qulf_device_key"
        fun credentialId(spki: ByteArray): String = QulfRepository.b64(MessageDigest.getInstance("SHA-256").digest(spki))
        fun isInvalidated(e: Throwable) = e is KeyPermanentlyInvalidatedException
    }
}
