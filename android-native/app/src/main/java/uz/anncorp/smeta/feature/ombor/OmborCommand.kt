package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Voice / typed warehouse commands. PLATFORM-NEUTRAL (no android.*): the app only RECORDS or TYPES, sends it to the server and shows what the
 * server understood as a PREVIEW card; the user confirms or edits, and the server writes (it is the only authority: permission, stock, idempotency).
 * The device does NO language parsing. One server endpoint serves web, Android and Telegram: POST /api/ombor-buyruq (frontend/functions/api/ombor-buyruq.ts),
 * reached from the app through the mobile BFF allow-list (frontend/functions/api/mobil/bff.ts, MOBIL_OMBOR_AMAL).
 *
 * Wire (every request carries `amal`, `kompaniya_id` and the central warehouse `sklad_id`; the actor is NEVER sent: the server takes it from the device session):
 *   tahlil   { amal, kompaniya_id, sklad_id, til: "uzb"|"rus", matn }                           typed command
 *            { amal, kompaniya_id, sklad_id, til, mime, audio_b64 }                              recorded command (the BFF carries JSON only, so base64)
 *            { amal, kompaniya_id, sklad_id, buyruq:{ amal, nomi, miqdor, birlik, kontragent, izoh } }   the user's edited card (server re-checks and returns a fresh token)
 *   tasdiq   { amal, kompaniya_id, sklad_id, token }                                              write (token = what the card showed; idempotent)
 *   eslatma  { amal, kompaniya_id, sklad_id, q, limit }                                           names this warehouse entered before (autocomplete)
 *   reply    { ok, holat, matn?, token?, preview?, nomzodlar?, material? }  holat: tasdiq_kerak | javob | qoldiq_yetmaydi | tushunilmadi | toldirish_kerak | ...
 * The recorder is an interface so the Windows app can plug in its own capture.
 */

const val COMMAND_PATH = "/api/ombor-buyruq"

enum class CommandKind { RECEIVE, ISSUE, EDIT, BALANCE, UNKNOWN }

/** One name the storekeeper entered before (the server remembers it per warehouse); picking it fills the row. */
/** [qty] = the usual quantity (median of history), [priceGross] = last price WITH QQS (the server stores net = QQS siz in [price]). */
data class NameSuggestion(val name: String, val unit: String, val supplier: String?, val receiver: String?, val price: Double?, val qty: Double? = null, val priceGross: Double? = null)

/**
 * What the server understood. [heard] is the recognised text (voice) so the user can see what was caught.
 * [token] is the server's one-time-per-operation confirmation token (null for answers that cannot be saved).
 */
data class CommandPreview(
    val kind: CommandKind, val name: String, val unit: String, val qty: Double?, val objectId: Long?, val party: String, val note: String,
    val answer: String?, val heard: String?, val token: String? = null, val warnings: List<String> = emptyList(), val alternatives: List<NameSuggestion> = emptyList(),
    /** Optional receipt price, canonical QQS siz ([price]) and QQS bilan ([priceGross]); [priceAsk] = none entered (ask once, skippable), [modeAsk] = QQS bilan/siz not stated (ask once). */
    val price: Double? = null, val priceGross: Double? = null, val priceAsk: Boolean = false, val modeAsk: Boolean = false,
)

/** A finished recording; the bytes are sent as is (the server decodes and recognises). */
class RecordedAudio(val bytes: ByteArray, val mime: String, val millis: Long)

interface AudioRecorder {
    /** Starts recording. False when the microphone is not allowed / not available (the UI then asks for permission). */
    fun start(): Boolean
    /** Stops and returns the recording; null when nothing usable was captured (too short, error). */
    fun stop(): RecordedAudio?
    fun cancel()
}

sealed interface CommandOutcome {
    data class Preview(val preview: CommandPreview) : CommandOutcome
    data object Offline : CommandOutcome
    data object Forbidden : CommandOutcome
    /** Server answered but understood nothing / the command is incomplete. */
    data object NotUnderstood : CommandOutcome
    /** Issue asked for more than the warehouse holds. */
    data object LowStock : CommandOutcome
    /** The endpoint is not reachable / not enabled for this device (404/503, voice not configured). */
    data object Unavailable : CommandOutcome
    data class Failed(val code: String?) : CommandOutcome
    /** The server understood part of it and asks ONE short question (holat "savol") with answer buttons; the answer re-sends the same text with `tanlov`. */
    data class Question(val question: AskQuestion) : CommandOutcome
}

sealed interface ConfirmOutcome {
    data object Saved : ConfirmOutcome
    data object Offline : ConfirmOutcome
    data object Forbidden : ConfirmOutcome
    data object LowStock : ConfirmOutcome
    data class Failed(val code: String?) : ConfirmOutcome
}

interface OmborCommandApi {
    suspend fun text(companyId: Long, skladId: Long, text: String, lang: String, priceMode: String? = null): CommandOutcome
    suspend fun audio(companyId: Long, skladId: Long, audio: RecordedAudio, lang: String): CommandOutcome
    /** The user's edited card: the server re-validates it and answers with a fresh preview + token. */
    suspend fun edited(companyId: Long, skladId: Long, kind: CommandKind, name: String, unit: String, qty: Double, party: String, note: String, objectName: String?, price: Double? = null, priceMode: String? = null): CommandOutcome
    /** The tapped button of a [CommandOutcome.Question]: the same [text] again plus the choice. */
    suspend fun answer(companyId: Long, skladId: Long, text: String, lang: String, choice: AskOption): CommandOutcome
    suspend fun confirm(companyId: Long, skladId: Long, token: String): ConfirmOutcome
    /** Names entered before in this warehouse (most recent / most frequent first). Null = could not load (autocomplete just stays empty). */
    suspend fun suggest(companyId: Long, skladId: Long, query: String): List<NameSuggestion>?
}

/** The server's speech-to-text language codes. */
fun serverLang(lang: String): String = if (lang.lowercase().startsWith("ru")) "rus" else "uzb"

fun textCommandBody(companyId: Long, skladId: Long, text: String, lang: String, priceMode: String? = null): JsonObject = buildJsonObject {
    put("amal", "tahlil"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("til", serverLang(lang)); put("matn", text.trim().take(500))
    if (priceMode == "bilan" || priceMode == "siz") put("narx_rejim", priceMode)
}

@OptIn(kotlin.io.encoding.ExperimentalEncodingApi::class)
fun audioCommandBody(companyId: Long, skladId: Long, audio: RecordedAudio, lang: String): JsonObject = buildJsonObject {
    put("amal", "tahlil"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("til", serverLang(lang)); put("mime", audio.mime)
    put("audio_b64", kotlin.io.encoding.Base64.encode(audio.bytes))
}

fun editedCommandBody(
    companyId: Long, skladId: Long, kind: CommandKind, name: String, unit: String, qty: Double, party: String, note: String, objectName: String?,
    price: Double? = null, priceMode: String? = null,
): JsonObject = buildJsonObject {
    put("amal", "tahlil"); put("kompaniya_id", companyId); put("sklad_id", skladId)
    put("buyruq", buildJsonObject {
        put("amal", if (kind == CommandKind.ISSUE) "chiqim" else "prixod"); put("nomi", name.trim().take(500)); put("miqdor", qty)
        if (unit.isNotBlank()) put("birlik", unit.trim().take(100))
        if (party.isNotBlank()) put("kontragent", party.trim().take(500))
        if (note.isNotBlank()) put("izoh", note.trim().take(1000))
        if (!objectName.isNullOrBlank()) put("obyekt", objectName.trim().take(200))
        // Optional receipt price: the server converts it to QQS siz by the system QQS rate (never computed on the device).
        if (kind != CommandKind.ISSUE && price != null && price > 0) { put("narx", price); put("narx_rejim", if (priceMode == "siz") "siz" else "bilan") }
    })
}

fun confirmBody(companyId: Long, skladId: Long, token: String): JsonObject = buildJsonObject {
    put("amal", "tasdiq"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("token", token)
}

fun suggestBody(companyId: Long, skladId: Long, query: String, supplier: String? = null): JsonObject = buildJsonObject {
    put("amal", "taklif"); if (!supplier.isNullOrBlank()) put("yetkazuvchi", supplier.trim().take(200)); put("kompaniya_id", companyId); put("sklad_id", skladId); put("q", query.trim().take(120)); put("limit", 6)
}

/** `{ok, takliflar:[{nomi, birligi, postavshik, qabul_qiluvchi, narx}]}` -> suggestions; null when the shape is not a successful answer. */
fun parseSuggestions(body: JsonElement?): List<NameSuggestion>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.content == "false") return null
    val a = root["takliflar"].arr() ?: return null
    return a.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val name = o["nomi"].str().orEmpty().trim().takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        NameSuggestion(
            name, o["birligi"].str().orEmpty().trim(),
            (o["postavshik"].str() ?: o["kontragent"].str())?.trim()?.takeIf { it.isNotEmpty() }, o["qabul_qiluvchi"].str()?.trim()?.takeIf { it.isNotEmpty() },
            (o["narx"].num() ?: o["narx_oxirgi"].num())?.takeIf { it > 0 }, o["miqdor_median"].num()?.takeIf { it > 0 }, o["narx_oxirgi_qqs"].num()?.takeIf { it > 0 },
        )
    }
}

private fun JsonElement?.strings(): List<String> = (this.arr() ?: JsonArray(emptyList())).mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotEmpty() } }

private fun alternatives(root: JsonObject, chosen: String): List<NameSuggestion> =
    root["nomzodlar"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val n = o["nomi"].str().orEmpty().trim()
        if (n.isEmpty() || n == chosen) null else NameSuggestion(n, o["birligi"].str().orEmpty().trim(), null, null, null)
    }.take(4)

/**
 * Maps the server's `tahlil` answer to what the UI shows. Anything the server could not turn into a writable card is "not understood"
 * (incomplete / unknown), except a stock shortfall, which gets its own message. Never throws on an unexpected shape.
 */
fun parseCommandReply(body: JsonElement?): CommandOutcome {
    val root = body.obj() ?: return CommandOutcome.NotUnderstood
    if ((root["ok"] as? JsonPrimitive)?.content == "false") return CommandOutcome.NotUnderstood
    val heard = root["matn"].str()?.takeIf { it.isNotBlank() }
    when (root["holat"].str()) {
        "tasdiq_kerak" -> {
            val p = root["preview"].obj() ?: return CommandOutcome.NotUnderstood
            val token = root["token"].str()?.takeIf { it.isNotBlank() } ?: return CommandOutcome.NotUnderstood
            val warnings = p["ogohlantirish"].strings()
            return when (val tur = p["tur"].str()?.lowercase() ?: p["amal"].str()?.lowercase()) {
                "prixod", "chiqim" -> {
                    val name = p["nomi"].str().orEmpty().trim()
                    CommandOutcome.Preview(CommandPreview(
                        if (tur == "prixod") CommandKind.RECEIVE else CommandKind.ISSUE, name, p["birligi"].str().orEmpty().trim(), p["miqdor"].num()?.takeIf { it > 0 },
                        p["obyekt_id"].num()?.toLong()?.takeIf { it > 0 }, p["kontragent"].str().orEmpty().trim(), p["izoh"].str().orEmpty().trim(),
                        null, heard, token, warnings, alternatives(root, name),
                        price = p["narx"].num()?.takeIf { it > 0 }, priceGross = p["narx_bilan"].num()?.takeIf { it > 0 },
                        priceAsk = tur == "prixod" && (p["narx_sorov"] as? JsonPrimitive)?.content == "true", modeAsk = (p["narx_rejim_sorov"] as? JsonPrimitive)?.content == "true",
                    ))
                }
                "tuzat", "bekor" -> {
                    val asl = p["asl"].obj()
                    val y = p["yangi"].obj()
                    CommandOutcome.Preview(CommandPreview(
                        CommandKind.EDIT, asl?.get("nomi").str().orEmpty().trim(), asl?.get("birligi").str().orEmpty().trim(), (y?.get("miqdor")).num()?.takeIf { it > 0 },
                        null, "", p["sabab"].str().orEmpty().trim(), null, heard, token, warnings,
                    ))
                }
                else -> CommandOutcome.NotUnderstood
            }
        }
        "javob" -> {
            val rows = root["nomzodlar"].arr().orEmpty().mapNotNull { e ->
                val o = e.obj() ?: return@mapNotNull null
                val n = o["nomi"].str()?.trim().orEmpty(); val q = o["qoldiq"].num() ?: return@mapNotNull null
                if (n.isEmpty()) null else n + ": " + formatQty(q) + " " + o["birligi"].str().orEmpty()
            }.take(3)
            val m = root["material"].obj()
            val answer = rows.takeIf { it.isNotEmpty() }?.joinToString("\n")
                ?: m?.let { it["nomi"].str().orEmpty() + ": " + formatQty(it["qoldiq"].num()) + " " + it["birligi"].str().orEmpty() }
            return CommandOutcome.Preview(CommandPreview(CommandKind.BALANCE, root["buyruq"].obj()?.get("nomi").str().orEmpty().trim(), "", null, null, "", "", answer, heard))
        }
        "hisobot" -> {
            // Period report (kirim-chiqim): a short text summary; the full table is on the web / Excel.
            val h = root["hisobot"].obj() ?: return CommandOutcome.NotUnderstood
            return CommandOutcome.Preview(CommandPreview(CommandKind.BALANCE, root["buyruq"].obj()?.get("nomi").str().orEmpty().trim(), "", null, null, "", "", reportText(h), heard))
        }
        "qoldiq_yetmaydi" -> return CommandOutcome.LowStock
        "savol" -> return parseAskQuestion(root)?.let { CommandOutcome.Question(it) } ?: CommandOutcome.NotUnderstood
        else -> return CommandOutcome.NotUnderstood
    }
}

/** Summary of a period report: period, kirim / chiqim counts per unit, sums QQS siz and QQS bilan, number of receipts without a price. */
fun reportText(h: JsonObject): String {
    val davr = h["davr"].obj(); val j = h["jami"].obj() ?: return ""
    val units = j["birliklar"].arr().orEmpty().mapNotNull { it.obj() }
    fun sums(key: String) = units.mapNotNull { u -> u[key].num()?.takeIf { it > 0 }?.let { formatQty(it) + " " + u["birligi"].str().orEmpty() } }.joinToString(", ").ifEmpty { "—" }
    val lines = mutableListOf((davr?.get("dan").str() ?: "…") + " — " + (davr?.get("gacha").str() ?: "…"))
    lines += "+ ${j["kirim_soni"].num()?.toLong() ?: 0}: " + sums("kirim")
    j["kirim_summa"].num()?.takeIf { it > 0 }?.let { lines += "  QQS siz: " + formatQty(it) + " · QQS bilan: " + formatQty(j["kirim_summa_qqs"].num()) }
    j["narxsiz_soni"].num()?.takeIf { it > 0 }?.let { lines += "  narxsiz: " + it.toLong() }
    lines += "− ${j["chiqim_soni"].num()?.toLong() ?: 0}: " + sums("chiqim")
    return lines.joinToString("\n")
}

/** Preview is complete enough to save: a receive / issue needs a name and a quantity (and the server's token). */
fun CommandPreview.canSave(): Boolean = (kind == CommandKind.RECEIVE || kind == CommandKind.ISSUE) && name.isNotBlank() && qty != null

class BffOmborCommandApi(private val api: BffApi) : OmborCommandApi {
    override suspend fun text(companyId: Long, skladId: Long, text: String, lang: String, priceMode: String?) = send(textCommandBody(companyId, skladId, text, lang, priceMode))
    override suspend fun audio(companyId: Long, skladId: Long, audio: RecordedAudio, lang: String) = send(audioCommandBody(companyId, skladId, audio, lang))
    override suspend fun edited(companyId: Long, skladId: Long, kind: CommandKind, name: String, unit: String, qty: Double, party: String, note: String, objectName: String?, price: Double?, priceMode: String?) =
        send(editedCommandBody(companyId, skladId, kind, name, unit, qty, party, note, objectName, price, priceMode))

    override suspend fun answer(companyId: Long, skladId: Long, text: String, lang: String, choice: AskOption) = send(askAnswerBody(companyId, skladId, lang, text, choice))

    private suspend fun send(body: JsonObject): CommandOutcome {
        val r = api.bff(COMMAND_PATH, "POST", body)
        return when {
            r.networkError -> CommandOutcome.Offline
            r.status == 403 || r.code == "PERMISSION_DENIED" -> CommandOutcome.Forbidden
            r.status == 404 || r.status == 503 || r.code == "VOICE_NOT_CONFIGURED" || r.code == "VOICE_COMPANY_NOT_ENABLED" || r.code == "VOICE_SCOPE_NOT_CONFIGURED" -> CommandOutcome.Unavailable
            r.status == 400 && (r.code == "PATH_NOT_ALLOWED" || r.code == "TARGET_INVALID") -> CommandOutcome.Unavailable
            !r.ok -> CommandOutcome.Failed(r.code ?: "HTTP ${r.status}")
            else -> parseCommandReply(r.body).let { if (it is CommandOutcome.Preview && it.preview.kind == CommandKind.UNKNOWN) CommandOutcome.NotUnderstood else it }
        }
    }

    override suspend fun confirm(companyId: Long, skladId: Long, token: String): ConfirmOutcome {
        val r = api.bff(COMMAND_PATH, "POST", confirmBody(companyId, skladId, token))
        val code = r.code ?: (r.body.obj()?.get("code")).str()
        return when {
            r.networkError -> ConfirmOutcome.Offline
            r.status == 403 || code == "PERMISSION_DENIED" -> ConfirmOutcome.Forbidden
            code == "QOLDIQ_YETMAYDI" -> ConfirmOutcome.LowStock
            !r.ok -> ConfirmOutcome.Failed(code ?: "HTTP ${r.status}")
            (r.body.obj()?.get("ok") as? JsonPrimitive)?.content == "false" -> ConfirmOutcome.Failed(code)
            else -> ConfirmOutcome.Saved
        }
    }

    override suspend fun suggest(companyId: Long, skladId: Long, query: String): List<NameSuggestion>? {
        val r = api.bff(COMMAND_PATH, "POST", suggestBody(companyId, skladId, query))
        return if (r.ok) parseSuggestions(r.body) else null
    }
}
// ---------- balance computed from movements ----------

/**
 * The import only brings receipts (prixod), so the balance is receipts minus issues per object, material and unit, computed from the
 * movement history when the server's stock table has nothing. Quantities only, no prices.
 */
fun balanceFromMoves(moves: List<OmborMove>): List<StockRow> =
    moves.groupBy { Triple(it.objectId, searchKey(it.nomi), it.birligi.lowercase()) }.map { (_, list) ->
        val first = list.first()
        val sum = list.fold(0.0) { s, m -> s + (m.qty ?: 0.0) * (if (m.isIncoming) 1 else -1) }
        StockRow(first.objectId, first.nomi, first.birligi, sum, list.mapNotNull { it.date }.maxOrNull())
    }
