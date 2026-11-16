package uz.anncorp.smeta.feature.hujjat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Document workflow ("Hujjat aylanishi") contract. Same gateway as the web (/api/hujjat-aylanish, frontend/src/api/t2-hujjat-aylanish.ts).
 * Approval decisions (zanjir_qaror) are NOT sent from here: the chain opens in the existing approval screen, whose requests go through
 * ApiClient.bff - the server answers 403 STEP_UP_KERAK where it wants a fresh PIN/biometric and the QULF step-up replays the request.
 * Letters: read list/detail; "xat_qabul" confirms receipt of an incoming letter. Pure (no Android): unit-tested.
 */

enum class ChainDirection(val wire: String) { TO_ME("menga"), FROM_ME("mendan") }

fun chainsPath(companyId: Long, d: ChainDirection) = "/api/hujjat-aylanish?bolim=zanjirlar&kompaniya_id=$companyId&yonalish=${d.wire}&limit=100"
fun lettersPath(companyId: Long, direction: String?) = "/api/hujjat-aylanish?bolim=xatlar&kompaniya_id=$companyId&limit=100" + (direction?.let { "&yonalish=$it" } ?: "")
fun letterPath(companyId: Long, id: Long) = "/api/hujjat-aylanish?bolim=xat&kompaniya_id=$companyId&xat_id=$id"

data class ChainRow(
    val id: Long, val tur: String, val sarlavha: String, val holat: String, val raund: Int, val yaratildi: String?, val mine: Boolean, val egasi: String?, val myTurn: Boolean, val turnRole: String?,
)

private fun list(body: JsonElement?): List<JsonElement>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return o["natija"].arr() ?: o["zanjirlar"].arr() ?: o["xatlar"].arr()
}

fun parseChains(body: JsonElement?): List<ChainRow>? = list(body)?.mapNotNull { e ->
    val o = e.obj() ?: return@mapNotNull null
    ChainRow(
        o["id"].num()?.toLong() ?: return@mapNotNull null, o["hujjat_turi"].str().orEmpty(), o["sarlavha"].str().orEmpty(), o["holat"].str().orEmpty(), o["raund"].num()?.toInt() ?: 1,
        o["yaratildi"].str(), (o["meniki"] as? JsonPrimitive)?.booleanOrNull ?: false, o["egasi_nom"].str(),
        (o["navbat_menda"] as? JsonPrimitive)?.booleanOrNull ?: false, o["navbat_rol"].str(),
    )
}

data class LetterRow(
    val id: Long, val turi: String, val mavzu: String, val holat: String, val sana: String?, val muddat: String?, val raqam: String?,
    val incoming: Boolean, val counterparty: String?, val overdue: Boolean,
)

fun parseLetters(body: JsonElement?): List<LetterRow>? = list(body)?.mapNotNull { e ->
    val o = e.obj() ?: return@mapNotNull null
    val incoming = (o["kiruvchi"] as? JsonPrimitive)?.booleanOrNull ?: false
    LetterRow(
        o["id"].num()?.toLong() ?: return@mapNotNull null, o["turi"].str() ?: "xat", o["mavzu"].str().orEmpty(), o["holat"].str() ?: "yuborilgan", o["sana"].str(), o["javob_muddati"].str(),
        (if (incoming) o["kiruvchi_raqam"].str() else null) ?: o["chiquvchi_raqam"].str(), incoming, o["qarshi_nom"].str(), (o["kechikkan"] as? JsonPrimitive)?.booleanOrNull ?: false,
    )
}

data class LetterDetail(val row: LetterRow, val text: String?, val sender: String?, val receiver: String?)

fun parseLetter(body: JsonElement?): LetterDetail? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val x = (o["natija"].obj() ?: o)["xat"].obj() ?: return null
    val incoming = (x["kiruvchi"] as? JsonPrimitive)?.booleanOrNull ?: false
    val row = LetterRow(
        x["id"].num()?.toLong() ?: return null, x["turi"].str() ?: "xat", x["mavzu"].str().orEmpty(), x["holat"].str() ?: "yuborilgan", x["sana"].str(), x["javob_muddati"].str(),
        (if (incoming) x["kiruvchi_raqam"].str() else null) ?: x["chiquvchi_raqam"].str(), incoming, if (incoming) x["yuboruvchi_nom"].str() else x["qabul_nom"].str(), false,
    )
    return LetterDetail(row, x["matn"].str(), x["yuboruvchi_nom"].str(), x["qabul_nom"].str())
}

fun receiveBody(companyId: Long, letterId: Long): JsonObject = buildJsonObject { put("amal", "xat_qabul"); put("kompaniya_id", companyId); put("xat_id", letterId) }

/** An incoming letter that the receiver has not confirmed yet. */
fun canReceive(l: LetterRow) = l.incoming && l.holat == "yuborilgan"

/** Past its answer date and still unanswered (the server flag, recomputed for cached copies). */
fun isLate(l: LetterRow, today: java.time.LocalDate): Boolean =
    l.holat != "javob_berildi" && (l.overdue || l.muddat?.take(10)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }?.isBefore(today) == true)

/** Filter of the chains list: all / waiting for me / running / finished. */
fun filterChains(rows: List<ChainRow>, mode: String): List<ChainRow> = when (mode) {
    "turn" -> rows.filter { it.myTurn }
    "running" -> rows.filter { it.holat == "jarayonda" }
    "done" -> rows.filter { it.holat != "jarayonda" }
    else -> rows
}

/** Where a notification leads. */
sealed interface DocTarget {
    data class Chain(val id: Long) : DocTarget
    data class Letter(val id: Long) : DocTarget
    data object Inbox : DocTarget
}

/** Notification link of the website ("/admin/hujjat-aylanish?zanjir=4" / "?xat=9") or its parameters -> target. */
fun targetOf(zanjirId: Long?, xatId: Long?): DocTarget = when {
    zanjirId != null && zanjirId > 0 -> DocTarget.Chain(zanjirId)
    xatId != null && xatId > 0 -> DocTarget.Letter(xatId)
    else -> DocTarget.Inbox
}
