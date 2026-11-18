package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.time.Instant

/*
 * Settings (P10): own profile, avatar, sessions, notification preferences. Platform neutral (no android.*): the same contracts serve a future
 * desktop/iOS client. Server: GET/POST /api/profil (yangila, boshqa_sessiyalar_chiqish), GET/POST /api/telegram (sozlama), /api/mobil/avatar.
 */

data class MyProfile(
    val id: Long, val name: String, val email: String, val phone: String?, val phoneVerified: Boolean,
    val language: String?, val avatarColor: String?,
    /** Start / end (epoch ms) of the current session window; null when the server did not say. */
    val sessionStart: Long?, val sessionEnd: Long?,
)

enum class SettingsError { NETWORK, SERVER, UNAUTHORIZED, BAD_NAME, BAD_PHONE, RATE_LIMIT, TOO_LARGE, BAD_IMAGE, NOT_DEPLOYED }

sealed interface SettingsResult<out T> {
    data class Ok<T>(val value: T) : SettingsResult<T>
    data class Err(val error: SettingsError) : SettingsResult<Nothing>
}

/** New device credential the server hands back when "sign out other devices" re-enrols THIS device (the old token dies with the others). */
data class DeviceRenewal(val deviceId: String, val token: String, val expires: Long)

sealed interface SignOutOthers {
    /** Other sessions are gone and this device carries on with [renewal]. */
    data class Renewed(val renewal: DeviceRenewal) : SignOutOthers
    /** Other sessions are gone but this device could not be re-enrolled: the app must sign in again. */
    data object SignedOutHere : SignOutOthers
}

/** Device label sent along so the re-enrolled device keeps a readable name in the admin device list. */
data class DeviceInfo(val name: String?, val os: String?, val appVersion: String?)

object ProfileRules {
    const val NAME_MIN = 2
    const val NAME_MAX = 80
    const val AVATAR_MAX_BYTES = 2 * 1024 * 1024
    const val AVATAR_SIDE = 512
    private val PHONE = Regex("^\\+?[0-9]{7,15}$")

    fun nameOk(raw: String): Boolean = raw.trim().length in NAME_MIN..NAME_MAX

    /** Same normalisation as the server (spaces, dashes, dots, brackets dropped). Blank = remove the phone (null). Invalid = [INVALID]. */
    fun phone(raw: String): String? {
        val s = raw.trim().replace(Regex("[\\s\\-().]"), "")
        return if (s.isEmpty()) null else if (PHONE.matches(s)) s else INVALID
    }
    const val INVALID = "\u0000invalid"

    /** One or two capital letters for the avatar placeholder. */
    fun initials(name: String): String {
        val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return when {
            parts.isEmpty() -> "?"
            parts.size == 1 -> parts[0].take(1).uppercase()
            else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
        }
    }
}

/** Notification groups the user can switch on/off on this device (the centre hides muted groups; the unread badge ignores them). */
enum class NotifGroup { APPROVALS, LETTERS, DEADLINES, DRAWINGS, OTHER }

fun NotifKind.group(): NotifGroup = when (this) {
    NotifKind.APPROVAL_WAITING, NotifKind.APPROVED, NotifKind.REJECTED, NotifKind.RETURNED -> NotifGroup.APPROVALS
    NotifKind.LETTER -> NotifGroup.LETTERS
    NotifKind.DEADLINE_NEAR, NotifKind.DEADLINE_PASSED -> NotifGroup.DEADLINES
    NotifKind.DRAWING, NotifKind.DRAWING_DECISION -> NotifGroup.DRAWINGS
    NotifKind.OTHER -> NotifGroup.OTHER
}

fun encodeGroups(g: Set<NotifGroup>): String = g.joinToString(",") { it.name }
fun decodeGroups(s: String?): Set<NotifGroup> = s?.split(',')?.mapNotNull { n -> NotifGroup.entries.firstOrNull { it.name == n } }?.toSet() ?: emptySet()

/** Server-side (Telegram bot) notification switches; only meaningful once Telegram is linked on the website. */
data class TgPrefs(val configured: Boolean, val linked: Boolean, val bot: String?, val topshiriq: Boolean, val f2: Boolean, val signal: Boolean) {
    fun with(key: String, value: Boolean): TgPrefs = when (key) { "topshiriq" -> copy(topshiriq = value); "f2" -> copy(f2 = value); "signal" -> copy(signal = value); else -> this }
}

private fun JsonObject.s(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
private fun JsonObject.b(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull == true
private fun parseIso(v: String?): Long? = v?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

class SettingsRepository(private val api: BffApi, private val device: () -> DeviceInfo = { DeviceInfo(null, null, null) }) {
    private val _avatar = MutableStateFlow<ByteArray?>(null)
    /** The user's own photo (JPEG/PNG/WebP bytes) or null; shared by the profile header and the settings screen. */
    val avatar: StateFlow<ByteArray?> = _avatar.asStateFlow()
    private val _profile = MutableStateFlow<MyProfile?>(null)
    val profile: StateFlow<MyProfile?> = _profile.asStateFlow()

    suspend fun load(): SettingsResult<MyProfile> {
        val r = api.bff("/api/profil")
        return call(r) { o -> parseProfile(o) }.also { if (it is SettingsResult.Ok) _profile.value = it.value }
    }

    /** Only the fields that changed are sent (null = leave as is). A blank [phone] clears it. */
    suspend fun update(name: String? = null, phone: String? = null, language: String? = null): SettingsResult<MyProfile> {
        val r = api.bff("/api/profil", "POST", buildJsonObject {
            put("amal", "yangila")
            name?.let { put("ism", it.trim()) }
            phone?.let { put("telefon", it) }
            language?.let { put("til", it) }
        })
        val merged = call(r) { o -> parseProfile(o, _profile.value) }
        if (merged is SettingsResult.Ok) _profile.value = merged.value
        return merged
    }

    /** "Sign out other devices": the server ends every other session; this device is re-enrolled and keeps working. */
    suspend fun signOutOthers(): SettingsResult<SignOutOthers> {
        val d = device()
        val r = api.bff("/api/profil", "POST", buildJsonObject {
            put("amal", "boshqa_sessiyalar_chiqish")
            d.name?.let { put("qurilma_nomi", it) }; d.os?.let { put("os", it) }; d.appVersion?.let { put("ilova_versiya", it) }
        })
        return call(r) { o ->
            val q = o["qurilma"] as? JsonObject
            val id = q?.s("device_id"); val token = q?.s("token"); val exp = (q?.get("tugaydi") as? JsonPrimitive)?.longOrNull
            if (id != null && token != null && exp != null) SignOutOthers.Renewed(DeviceRenewal(id, token, exp)) else SignOutOthers.SignedOutHere
        }
    }

    suspend fun refreshAvatar() {
        val r = api.avatarGet()
        if (r.ok && r.bytes != null) _avatar.value = r.bytes else if (r.status == 404) _avatar.value = null
    }

    /** [jpeg] is already cropped and downsized by the UI (<= 512 px). The server re-validates type and the 2 MiB cap. */
    suspend fun uploadAvatar(jpeg: ByteArray, mime: String = "image/jpeg"): SettingsResult<Unit> {
        if (jpeg.isEmpty() || jpeg.size > ProfileRules.AVATAR_MAX_BYTES) return SettingsResult.Err(SettingsError.TOO_LARGE)
        val r = api.avatarPut(jpeg, mime)
        val res = call(r) { }
        if (res is SettingsResult.Ok) _avatar.value = jpeg
        return res
    }

    suspend fun removeAvatar(): SettingsResult<Unit> {
        val res = call(api.avatarDelete()) { }
        if (res is SettingsResult.Ok) _avatar.value = null
        return res
    }

    suspend fun telegram(): SettingsResult<TgPrefs> = call(api.bff("/api/telegram")) { o -> parseTg(o) }

    suspend fun setTelegram(key: String, value: Boolean): SettingsResult<TgPrefs> {
        val r = api.bff("/api/telegram", "POST", buildJsonObject { put("amal", "sozlama"); put("bildirishnoma", buildJsonObject { put(key, value) }) })
        return call(r) { o -> parseTg(o) }
    }

    private fun <T> call(r: ApiResult, map: (JsonObject) -> T): SettingsResult<T> {
        val o = r.body as? JsonObject
        if (r.networkError) return SettingsResult.Err(SettingsError.NETWORK)
        if (r.unauthorized) return SettingsResult.Err(SettingsError.UNAUTHORIZED)
        if (r.ok && (o == null || (o["ok"] as? JsonPrimitive)?.booleanOrNull != false)) return SettingsResult.Ok(map(o ?: JsonObject(emptyMap())))
        return SettingsResult.Err(errorOf(r.status, r.code ?: o?.s("code")))
    }

    companion object {
        fun errorOf(status: Int, code: String?): SettingsError = when (code) {
            "ISM_NOTOGRI" -> SettingsError.BAD_NAME
            "TELEFON_NOTOGRI" -> SettingsError.BAD_PHONE
            "TUR_NOTOGRI" -> SettingsError.BAD_IMAGE
            "HAJM_NOTOGRI" -> SettingsError.TOO_LARGE
            "SERVER_YANGILANMAGAN", "R2_YOQ" -> SettingsError.NOT_DEPLOYED
            "KOP_URINISH", "LIMIT" -> SettingsError.RATE_LIMIT
            else -> when (status) { 401 -> SettingsError.UNAUTHORIZED; 413 -> SettingsError.TOO_LARGE; 429 -> SettingsError.RATE_LIMIT; else -> SettingsError.SERVER }
        }

        fun parseProfile(o: JsonObject, previous: MyProfile? = null): MyProfile {
            val p = o["profil"] as? JsonObject
            val s = o["sessiya"] as? JsonObject
            if (p == null) return previous ?: MyProfile(0, "", "", null, false, null, null, null, null)
            return MyProfile(
                id = (p["id"] as? JsonPrimitive)?.longOrNull ?: 0, name = p.s("ism").orEmpty(), email = p.s("email") ?: p.s("login").orEmpty(),
                phone = p.s("telefon"), phoneVerified = p.b("telefon_tasdiqlangan"), language = p.s("til"), avatarColor = p.s("avatar_rang"),
                sessionStart = parseIso(s?.s("boshlangan")) ?: previous?.sessionStart, sessionEnd = parseIso(s?.s("tugaydi")) ?: previous?.sessionEnd,
            )
        }

        fun parseTg(o: JsonObject): TgPrefs {
            val n = o["bildirishnoma"] as? JsonObject
            fun on(k: String) = n?.get(k)?.let { (it as? JsonPrimitive)?.booleanOrNull } ?: false
            return TgPrefs(o.b("sozlangan"), o.b("ulangan"), o.s("bot"), on("topshiriq"), on("f2"), on("signal"))
        }
    }
}

/** Keeps the notification items whose group is not muted on this device. */
fun <T> visibleNotifications(items: List<T>, muted: Set<NotifGroup>, groupOf: (T) -> NotifGroup): List<T> =
    if (muted.isEmpty()) items else items.filter { groupOf(it) !in muted }

/** Square crop of an image for the avatar. Pure math, unit tested; the UI draws with these numbers. */
object AvatarCrop {
    const val MAX_ZOOM = 4f

    /** Scale that makes the shorter image side exactly fill a square viewport of [view] px. */
    fun coverScale(imgW: Int, imgH: Int, view: Float): Float = view / minOf(imgW, imgH).coerceAtLeast(1)

    /** Largest allowed pan (px, each direction) so the image always covers the viewport. */
    fun maxPan(imgSide: Int, scale: Float, view: Float): Float = ((imgSide * scale - view) / 2f).coerceAtLeast(0f)

    data class Src(val left: Int, val top: Int, val size: Int)

    /**
     * The source square (image pixels) visible in the viewport: [zoom] >= 1 on top of the cover scale, [panX]/[panY] = how far the image was
     * dragged from centered (px, positive = image moved right/down). Always inside the image.
     */
    fun source(imgW: Int, imgH: Int, view: Float, zoom: Float, panX: Float, panY: Float): Src {
        val z = zoom.coerceIn(1f, MAX_ZOOM)
        val scale = coverScale(imgW, imgH, view) * z
        val px = panX.coerceIn(-maxPan(imgW, scale, view), maxPan(imgW, scale, view))
        val py = panY.coerceIn(-maxPan(imgH, scale, view), maxPan(imgH, scale, view))
        val size = (view / scale).toInt().coerceIn(1, minOf(imgW, imgH))
        val left = (imgW / 2f - px / scale - size / 2f).toInt().coerceIn(0, imgW - size)
        val top = (imgH / 2f - py / scale - size / 2f).toInt().coerceIn(0, imgH - size)
        return Src(left, top, size)
    }

    /** Sample size (power of two) for decoding so the longer side stays near [target] px. */
    fun sampleSize(w: Int, h: Int, target: Int = 1600): Int {
        var s = 1
        while (maxOf(w, h) / (s * 2) >= target) s *= 2
        return s
    }
}
