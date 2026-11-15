package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/*
 * @username and exact people search (contract: docs/architecture/USERNAME_V1.md, server: /api/profil + /api/company member_invite).
 * The client only PRE-validates for instant feedback; the database RPC is the final judge. Phone / e-mail are never returned by the server.
 * Gated by Features.USERNAME (on: migration 20261224100000_t2_username_v1 is applied, server live).
 */

/** Why a @username is not acceptable (client-side pre-check; the same names as the server codes minus the prefix). */
enum class UsernameIssue { TOO_SHORT, TOO_LONG, FORMAT, START, UNDERSCORE, RESERVED }

object UsernameRules {
    const val MIN = 5
    const val MAX = 32

    /** Lower-case, no leading @, trimmed. Blank -> null. */
    fun norm(input: String?): String? = input?.trim()?.removePrefix("@")?.trim()?.lowercase()?.ifEmpty { null }

    /** Null = looks valid (the server still decides: reserved words, uniqueness). */
    fun issue(u: String): UsernameIssue? = when {
        u.length < MIN -> UsernameIssue.TOO_SHORT
        u.length > MAX -> UsernameIssue.TOO_LONG
        !u.all { it in 'a'..'z' || it in '0'..'9' || it == '_' } -> UsernameIssue.FORMAT
        u[0] !in 'a'..'z' -> UsernameIssue.START
        u.contains("__") || u.endsWith("_") -> UsernameIssue.UNDERSCORE
        else -> null
    }

    /** Variants from a display name (`ism_familiya`, `ismfamiliya`, `i_familiya`, `ism_f`, ...), valid ones only, at most 10. */
    fun suggestions(displayName: String): List<String> {
        val parts = translit(displayName).split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
        if (parts.isEmpty()) return emptyList()
        val first = parts.first()
        val last = parts.drop(1).lastOrNull()
        val raw = buildList {
            if (last != null) {
                add("${first}_$last"); add("$first$last"); add("${first.take(1)}_$last"); add("${first}_${last.take(1)}"); add("$last$first"); add("${first.take(1)}$last")
            } else {
                add(first); add("${first}_uz"); add("${first}_qurai"); add("${first}_pro")
            }
        }
        return raw.map { it.take(MAX).trimEnd('_') }.filter { issue(it) == null }.distinct().take(10)
    }

    private val CYR = mapOf(
        'а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ё' to "yo", 'ж' to "j", 'з' to "z", 'и' to "i", 'й' to "y", 'к' to "k",
        'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p", 'р' to "r", 'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f", 'х' to "x", 'ц' to "s",
        'ч' to "ch", 'ш' to "sh", 'щ' to "sh", 'ы' to "i", 'э' to "e", 'ю' to "yu", 'я' to "ya", 'ў' to "o", 'қ' to "q", 'ғ' to "g", 'ҳ' to "h",
    )
    private fun translit(s: String): String = buildString {
        for (c in s.lowercase()) append(CYR[c] ?: if (c in 'a'..'z' || c in '0'..'9') c.toString() else " ")
    }
}

/** Instant (no network) verdict on what is typed in the username field. [Ask] = format is fine, ask the server whether it is free. */
sealed interface UsernameVerdict {
    data object Empty : UsernameVerdict
    data class Invalid(val issue: UsernameIssue) : UsernameVerdict
    data object Same : UsernameVerdict
    data object Ask : UsernameVerdict
}
fun usernameVerdict(raw: String, current: String?): UsernameVerdict {
    val u = UsernameRules.norm(raw) ?: return UsernameVerdict.Empty
    UsernameRules.issue(u)?.let { return UsernameVerdict.Invalid(it) }
    return if (u == current) UsernameVerdict.Same else UsernameVerdict.Ask
}

/** What the user typed into the single "add a person" field. */
enum class LookupKind { USERNAME, PHONE, EMAIL }

object Lookup {
    fun kind(input: String): LookupKind? {
        val s = input.trim()
        if (s.isEmpty()) return null
        return when {
            s.startsWith("@") -> LookupKind.USERNAME
            s.contains("@") -> LookupKind.EMAIL
            Regex("^[A-Za-z][A-Za-z0-9_]{4,31}$").matches(s) -> LookupKind.USERNAME
            s.count { it.isDigit() } >= 7 && s.all { it.isDigit() || it in "+ -()" } -> LookupKind.PHONE
            else -> null
        }
    }

    /** E.164: a 9-digit local number gets +998 (same as the server's telefonNorm); anything else keeps its digits behind a +. */
    fun phone(input: String): String? {
        val d = input.filter { it.isDigit() }
        return when {
            d.length == 9 -> "+998$d"
            d.length in 10..15 -> "+$d"
            else -> null
        }
    }

    /** The exact string sent as `qiymat`. */
    fun value(input: String): String? = when (kind(input)) {
        LookupKind.USERNAME -> UsernameRules.norm(input)?.let { "@$it" }
        LookupKind.PHONE -> phone(input)
        LookupKind.EMAIL -> input.trim().lowercase()
        null -> null
    }
}

/** Who may find me by phone or e-mail. `@username` search is always on. */
enum class PhoneSearch(val wire: String) {
    ALL("hammasi"), COWORKERS("kompaniyadosh"), NONE("hech");
    companion object { fun of(w: String?): PhoneSearch = entries.firstOrNull { it.wire == w } ?: ALL }
}

data class PersonProfile(val id: Long, val name: String, val username: String?, val color: String? = null)
data class MyUsername(val username: String?, val name: String?, val phoneSearch: PhoneSearch, val leftToday: Int?)
data class UsernameCheck(val valid: Boolean, val free: Boolean, val taken: Boolean, val reason: String?, val variants: List<String>)
data class CompanyInvite(val id: Long, val companyId: Long, val companyName: String, val role: String, val expires: Long?, val from: PersonProfile?)
data class InviteAnswer(val accepted: Boolean, val companyId: Long?, val role: String?)
data class InviteSent(val id: Long?, val profile: PersonProfile?)

/** One screen-level failure kind; the UI maps each to a localized message. */
enum class PeopleError {
    NETWORK, SERVER, NOT_DEPLOYED, LIMIT, TAKEN, FORMAT, BAD_VALUE, NOT_FOUND, ALREADY_MEMBER, NO_RIGHT, BAD_ROLE, INVITE_GONE, INVITE_EXPIRED, INVITE_INVALID, UNAUTHORIZED,
}

sealed interface PeopleResult<out T> {
    data class Ok<T>(val value: T) : PeopleResult<T>
    /** [phoneInvite] / [phone] come from `TOPILMADI`: the typed value is a phone and a link + code invite can be created instead. */
    data class Err(val error: PeopleError, val issue: UsernameIssue? = null, val phoneInvite: Boolean = false, val phone: String? = null) : PeopleResult<Nothing>
}

/** The role names `member_invite` accepts (USERNAME_V1 section 2). */
val INVITE_ROLES = listOf("rahbar", "bugalter", "pto", "prorab", "buyurtmachi", "pudratchi", "kuzatuvchi")

data class PhoneInviteCode(val code: String, val link: String)

class PeopleRepository(private val api: BffApi, private val newId: () -> String = { UUID.randomUUID().toString() }) {
    private suspend fun profil(amal: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}): ApiResult =
        api.bff("/api/profil", "POST", buildJsonObject { put("amal", amal); build() })

    suspend fun mine(): PeopleResult<MyUsername> = call(profil("username_ol")) { o ->
        MyUsername(o.str("username"), o.str("ism"), PhoneSearch.of(o.str("telefon_qidiruv")), o["bugun_qoldi"]?.int())
    }

    /** [variants] are checked together with the typed name; the server answers with up to 5 that are free. */
    suspend fun check(username: String, variants: List<String> = emptyList()): PeopleResult<UsernameCheck> =
        call(profil("username_tekshir") {
            put("username", username)
            if (variants.isNotEmpty()) put("variantlar", buildJsonArray { variants.take(10).forEach { add(JsonPrimitive(it)) } })
        }) { o ->
            UsernameCheck(o["yaroqli"]?.bool() == true, o["bosh"]?.bool() == true, o["band"]?.bool() == true, o.str("sabab"), o["variantlar"].strings())
        }

    /** null / blank removes the username. */
    suspend fun set(username: String?): PeopleResult<String?> = call(profil("username_belgila") {
        if (username.isNullOrBlank()) put("username", JsonPrimitive(null as String?)) else put("username", username)
        put("operation_id", newId())
    }) { o -> o.str("username") }

    suspend fun setPhoneSearch(v: PhoneSearch): PeopleResult<PhoneSearch> =
        call(profil("username_sozlama") { put("telefon_qidiruv", v.wire) }) { o -> PhoneSearch.of(o.str("telefon_qidiruv")) }

    /** Autocomplete among coworkers only (prefix >= 2 chars). */
    suspend fun coworkers(prefix: String, companyId: Long?): PeopleResult<List<PersonProfile>> =
        if (prefix.trim().length < 2) PeopleResult.Ok(emptyList()) else call(profil("kompaniyadosh_qidir") {
            put("prefiks", prefix.trim()); if (companyId != null) put("kompaniya_id", companyId)
        }) { o -> (o["royxat"] as? JsonArray).orEmpty().mapNotNull { it.profile() } }

    /** `@username` for member lists; absent ids keep their existing label. */
    suspend fun usernames(ids: List<Long>): Map<Long, String> {
        if (ids.isEmpty()) return emptyMap()
        val r = profil("username_ommaviy") { put("idlar", buildJsonArray { ids.distinct().take(200).forEach { add(JsonPrimitive(it)) } }) }
        val m = (r.body as? JsonObject)?.get("username") as? JsonObject ?: return emptyMap()
        return if (!r.ok) emptyMap() else m.mapNotNull { (k, v) -> k.toLongOrNull()?.let { id -> (v as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { id to it } } }.toMap()
    }

    suspend fun invites(): PeopleResult<List<CompanyInvite>> = call(profil("taklif_royxat")) { o ->
        (o["royxat"] as? JsonArray).orEmpty().mapNotNull { e ->
            val x = e as? JsonObject ?: return@mapNotNull null
            val id = x["id"]?.long() ?: return@mapNotNull null
            CompanyInvite(id, x["kompaniya_id"]?.long() ?: 0, x.str("kompaniya_nom").orEmpty(), x.str("rol").orEmpty(), x["tugaydi"]?.long(), x["taklif_qiluvchi"]?.profile())
        }
    }

    suspend fun answer(inviteId: Long, accept: Boolean): PeopleResult<InviteAnswer> = call(profil("taklif_javob") {
        put("taklif_id", inviteId); put("qabul", accept); put("operation_id", newId())
    }) { o -> InviteAnswer(o.str("holat") == "qabul", o["kompaniya_id"]?.long(), o.str("rol")) }

    /** member_invite: [value] is the raw field text (kind auto-detected). */
    suspend fun invite(companyId: Long, value: String, role: String): PeopleResult<InviteSent> {
        val q = Lookup.value(value) ?: return PeopleResult.Err(PeopleError.BAD_VALUE)
        val r = api.bff("/api/company", "POST", buildJsonObject {
            put("action", "member_invite"); put("kompaniya_id", companyId); put("qiymat", q); put("rol", role)
        })
        return call(r) { o -> InviteSent(o["taklif_id"]?.long(), o["profil"]?.profile()) }
    }

    /** Fallback for `TOPILMADI + telefon_taklif`: a one-time link + 8-digit code the director sends by SMS/Telegram himself (no SMS is sent). */
    suspend fun phoneInvite(companyId: Long, name: String, phone: String, role: String): PeopleResult<PhoneInviteCode> {
        val r = api.bff("/api/kirish-taklif", "POST", buildJsonObject {
            put("amal", "yarat"); put("kompaniya_id", companyId); put("ism", name.trim()); put("telefon", phone); put("rol", role)
        })
        return call(r) { o -> PhoneInviteCode(o.str("kod").orEmpty(), o.str("havola").orEmpty()) }
    }

    private fun <T> call(r: ApiResult, map: (JsonObject) -> T): PeopleResult<T> {
        val o = r.body as? JsonObject
        if (r.networkError) return PeopleResult.Err(PeopleError.NETWORK)
        if (r.unauthorized) return PeopleResult.Err(PeopleError.UNAUTHORIZED)
        if (r.ok && o?.get("ok")?.bool() != false) return PeopleResult.Ok(map(o ?: JsonObject(emptyMap())))
        return errorOf(r, o)
    }


    companion object {
        /** Maps the contract's error codes (USERNAME_V1 "Xato kodlari") to a [PeopleError]. Pure, unit tested. */
        fun errorOf(r: ApiResult, o: JsonObject? = r.body as? JsonObject): PeopleResult.Err {
            val code = r.code ?: o?.str("code")
            val issue = when (code) {
                "USERNAME_QISQA" -> UsernameIssue.TOO_SHORT
                "USERNAME_UZUN" -> UsernameIssue.TOO_LONG
                "USERNAME_FORMAT" -> UsernameIssue.FORMAT
                "USERNAME_BOSHLANISH" -> UsernameIssue.START
                "USERNAME_UNDERSCORE" -> UsernameIssue.UNDERSCORE
                "USERNAME_BAND_SOZ" -> UsernameIssue.RESERVED
                else -> null
            }
            if (issue != null) return PeopleResult.Err(PeopleError.FORMAT, issue)
            val e = when (code) {
                "USERNAME_BAND" -> PeopleError.TAKEN
                "USERNAME_LIMIT", "LIMIT" -> PeopleError.LIMIT
                "QIYMAT_NOTOGRI" -> PeopleError.BAD_VALUE
                "TOPILMADI" -> PeopleError.NOT_FOUND
                "ALREADY_MEMBER" -> PeopleError.ALREADY_MEMBER
                "RUXSAT_YOQ", "AUTHORIZATION_DENIED" -> PeopleError.NO_RIGHT
                "ROL_NOTOGRI" -> PeopleError.BAD_ROLE
                "TAKLIF_TOPILMADI" -> PeopleError.INVITE_GONE
                "TAKLIF_MUDDATI_OTGAN" -> PeopleError.INVITE_EXPIRED
                "TAKLIF_YAROQSIZ" -> PeopleError.INVITE_INVALID
                "SERVER_YANGILANMAGAN" -> PeopleError.NOT_DEPLOYED
                else -> when {
                    // The migration / endpoint is not deployed yet: the server rejects the unknown `amal` with a 4xx and no known code.
                    r.status in 400..404 && code == null -> PeopleError.NOT_DEPLOYED
                    r.status == 429 -> PeopleError.LIMIT
                    r.status == 403 -> PeopleError.NO_RIGHT
                    else -> PeopleError.SERVER
                }
            }
            if (e == PeopleError.NOT_FOUND) {
                val phone = o?.str("telefon")
                return PeopleResult.Err(e, phoneInvite = o?.get("telefon_taklif")?.bool() == true, phone = phone)
            }
            return PeopleResult.Err(e)
        }
    }
}

private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement.long(): Long? = (this as? JsonPrimitive)?.longOrNull
private fun JsonElement.int(): Int? = (this as? JsonPrimitive)?.intOrNull
private fun JsonElement.bool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull
private fun JsonElement?.strings(): List<String> = (this as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
internal fun JsonElement.profile(): PersonProfile? {
    val o = this as? JsonObject ?: return null
    return PersonProfile(o["id"]?.long() ?: return null, o.str("ism").orEmpty(), o.str("username"), o.str("avatar_rang"))
}
