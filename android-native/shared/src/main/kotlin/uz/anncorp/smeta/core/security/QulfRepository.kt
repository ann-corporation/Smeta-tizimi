package uz.anncorp.smeta.core.security

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import java.util.Base64

data class QulfDevice(val id: Long, val kind: String, val name: String?)
data class QulfState(
    val pinSet: Boolean, val timeoutMin: Int, val devices: List<QulfDevice>, val mode: String,
    val required: Boolean, val methods: List<String>, val pinStatus: String, val secondsLeft: Int,
    /** Digits of the stored PIN (server `pin_uzunlik`; null = unknown/legacy), attempts left before the 15 min block, and whether the PIN was set under another server key (can never match). */
    val pinLength: Int? = null, val attemptsLeft: Int = 5, val keyMismatch: Boolean = false,
    /** Server qulf_yoqilgan (null = old server). The lock needs a PIN: a biometric/device key alone never enables it (no fallback = trap). */
    val serverLockOn: Boolean? = null,
) { val enabled get() = serverLockOn ?: (pinSet && !keyMismatch) }

/** Outcome of a /api/qulf call. [code] is the server code (PIN_NOTOGRI, BLOKLANGAN, QAYTA_KIRISH_KERAK, STEP_UP_KERAK, ...). */
data class QulfOutcome(val ok: Boolean, val code: String? = null, val secondsLeft: Int = 0, val network: Boolean = false, val status: Int = 0) {
    /** The server says no PIN lock can work for this user (no PIN / PIN under another key / module missing / server error): the lock must release, never trap. */
    val releasesLock get() = !ok && !network && (code == "PIN_YOQ" || code == "PIN_KALIT_BOSHQA" || status == 501 || status == 404 || status >= 500)
}
data class DeviceChallenge(val challengeToken: String, val challenge: String, val credentialIds: List<String> = emptyList())

/**
 * Native client for /api/qulf through the BFF (docs/architecture/QULF_VA_TASDIQ_V1.md). Protocol for the Android device key
 * (Keystore EC P-256, user-authentication required per use):
 *   register: qurilma_reg_boshla -> {chaqiriq, challenge}; sign "QULF1|reg|<challenge>|<credId>" with the NEW key; qurilma_reg_tugat {chaqiriq, ochiq_kalit(SPKI), imzo(DER)}
 *   assert:   qurilma_kirish_boshla -> {chaqiriq, challenge, kredensiallar}; sign "QULF1|kirish|<challenge>|<credId>"; qurilma_kirish_tugat {chaqiriq, kredensial_id, imzo}
 * credId = base64url(SHA-256(SPKI)) (server computes the same). A successful assertion / PIN returns `tasdiq_token`, stored in [TasdiqStore].
 */
class QulfRepository(private val api: BffApi, private val tasdiq: TasdiqStore) {
    suspend fun state(): QulfState? {
        val r = api.bff("/api/qulf?amal=holat", "GET")
        val o = r.body as? JsonObject ?: return null
        if (!r.ok || o["ok"]?.asBool() == false) return null
        return QulfState(
            pinSet = o["pin_bor"]?.asBool() == true,
            timeoutMin = o["bosh_vaqt_daq"]?.asInt() ?: LockState.DEFAULT_MIN,
            devices = (o["kalitlar"] as? JsonArray).orEmpty().mapNotNull { e ->
                val d = e as? JsonObject ?: return@mapNotNull null
                QulfDevice(d["id"]?.asInt()?.toLong() ?: return@mapNotNull null, d["tur"]?.asStr() ?: "", d["nom"]?.asStr())
            },
            mode = o["rejim"]?.asStr() ?: "pin", required = o["talab"]?.asBool() == true,
            methods = (o["usullar"] as? JsonArray).orEmpty().mapNotNull { it.asStr() },
            pinStatus = o["pin_holat"]?.asStr() ?: "ok", secondsLeft = o["qolgan_soniya"]?.asInt() ?: 0,
            pinLength = o["pin_uzunlik"]?.asInt()?.takeIf { it in 4..6 }, attemptsLeft = o["qolgan_urinish"]?.asInt() ?: 5, keyMismatch = o["pin_kalit_boshqa"]?.asBool() == true, serverLockOn = o["qulf_yoqilgan"]?.asBool(),
        )
    }

    suspend fun verifyPin(pin: String): QulfOutcome = post("pin_tekshir") { put("pin", pin) }.also(::keepToken).outcome()
    suspend fun setPin(new: String, old: String?): QulfOutcome = post("pin_saqla") { put("yangi", new); if (!old.isNullOrEmpty()) put("eski", old) }.outcome()
    suspend fun removePin(pin: String): QulfOutcome = post("pin_ochir") { put("pin", pin) }.outcome()
    suspend fun setTimeout(min: Int): QulfOutcome = post("vaqt_saqla") { put("daq", LockState.clamp(min)) }.outcome()
    suspend fun removeDevice(id: Long): QulfOutcome = post("kalit_ochir") { put("id", id) }.outcome()

    suspend fun registerStart(): DeviceChallenge? = challenge("qurilma_reg_boshla")
    suspend fun registerFinish(challengeToken: String, spki: ByteArray, signatureDer: ByteArray, name: String): QulfOutcome =
        post("qurilma_reg_tugat") { put("chaqiriq", challengeToken); put("ochiq_kalit", b64(spki)); put("imzo", b64(signatureDer)); put("nom", name) }.outcome()

    suspend fun assertStart(): DeviceChallenge? = challenge("qurilma_kirish_boshla")
    suspend fun assertFinish(challengeToken: String, credentialId: String, signatureDer: ByteArray): QulfOutcome =
        post("qurilma_kirish_tugat") { put("chaqiriq", challengeToken); put("kredensial_id", credentialId); put("imzo", b64(signatureDer)) }.also(::keepToken).outcome()

    private suspend fun challenge(amal: String): DeviceChallenge? {
        val r = post(amal) {}
        val o = r.body as? JsonObject ?: return null
        if (!r.ok) return null
        return DeviceChallenge(o["chaqiriq"]?.asStr() ?: return null, o["challenge"]?.asStr() ?: return null,
            (o["kredensiallar"] as? JsonArray).orEmpty().mapNotNull { it.asStr() })
    }

    private suspend fun post(amal: String, fill: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): ApiResult =
        api.bff("/api/qulf", "POST", buildJsonObject { put("amal", amal); fill() })

    private fun keepToken(r: ApiResult) { ((r.body as? JsonObject)?.get("tasdiq_token")?.asStr())?.let { if (r.ok) tasdiq.set(it) } }

    private fun ApiResult.outcome(): QulfOutcome = QulfOutcome(
        ok = ok && (body as? JsonObject)?.get("ok")?.asBool() != false, code = code,
        secondsLeft = (body as? JsonObject)?.get("qolgan_soniya")?.asInt() ?: 0, network = networkError, status = status,
    )

    companion object {
        fun b64(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
        /** The exact bytes the device signs (must match the server's qurilmaXabar). */
        fun message(purpose: String, challenge: String, credentialId: String): ByteArray = "QULF1|$purpose|$challenge|$credentialId".toByteArray(Charsets.UTF_8)
    }
}

private fun JsonElement.asStr(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement.asBool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull
private fun JsonElement.asInt(): Int? = (this as? JsonPrimitive)?.intOrNull ?: (this as? JsonPrimitive)?.contentOrNull?.toIntOrNull()
