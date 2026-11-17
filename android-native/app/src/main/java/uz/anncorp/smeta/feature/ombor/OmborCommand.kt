package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Voice / typed warehouse commands. PLATFORM-NEUTRAL (no android.*): the app only RECORDS or TYPES, sends it to the server and shows what the
 * server understood as a PREVIEW card; the user confirms or edits, and only then the normal receive / issue write path (offline outbox) runs.
 * The device does NO language parsing (that is the server's job: POST /api/ombor-buyruq, built on branch claude/ombor-tayyor).
 *
 * Wire (assumed until the server contract is merged; every field is optional on read, so a different final shape degrades to "not understood"):
 *   request  { kompaniya_id, til: "uz"|"ru", matn }                       typed command
 *            { kompaniya_id, til, audio_b64, mime }                        recorded command
 *   reply    { ok:true, buyruq:{ tur:"prixod"|"rasxod"|"tahrir"|"qoldiq", nomi, birligi, miqdor, obyekt_id, kimga, izoh, javob, eshitildi } }
 *            (also accepted wrapped as natija)
 * The recorder is an interface so the Windows app can plug in its own capture.
 */

const val COMMAND_PATH = "/api/ombor-buyruq"

enum class CommandKind { RECEIVE, ISSUE, EDIT, BALANCE, UNKNOWN }

/** What the server understood. [heard] is the recognised text (voice) so the user can see what was caught. */
data class CommandPreview(
    val kind: CommandKind, val name: String, val unit: String, val qty: Double?, val objectId: Long?, val party: String, val note: String,
    val answer: String?, val heard: String?,
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
    /** Server answered but understood nothing, or the endpoint is not deployed yet (404/503). */
    data object NotUnderstood : CommandOutcome
    data object Unavailable : CommandOutcome
    data class Failed(val code: String?) : CommandOutcome
}

interface OmborCommandApi {
    suspend fun text(companyId: Long, text: String, lang: String): CommandOutcome
    suspend fun audio(companyId: Long, audio: RecordedAudio, lang: String): CommandOutcome
}

fun textCommandBody(companyId: Long, text: String, lang: String): JsonObject = buildJsonObject {
    put("kompaniya_id", companyId); put("til", lang); put("matn", text.trim().take(500))
}

@OptIn(kotlin.io.encoding.ExperimentalEncodingApi::class)
fun audioCommandBody(companyId: Long, audio: RecordedAudio, lang: String): JsonObject = buildJsonObject {
    put("kompaniya_id", companyId); put("til", lang); put("mime", audio.mime)
    put("audio_b64", kotlin.io.encoding.Base64.encode(audio.bytes))
}

private fun kindOf(tur: String?): CommandKind = when (tur?.lowercase()) {
    "prixod", "kirim", "receive" -> CommandKind.RECEIVE
    "rasxod", "chiqim", "issue" -> CommandKind.ISSUE
    "tahrir", "edit" -> CommandKind.EDIT
    "qoldiq", "savol", "balance" -> CommandKind.BALANCE
    else -> CommandKind.UNKNOWN
}

/** Tolerant: `{ok, buyruq}` or `{ok, natija:{buyruq}}`; null when there is no command object at all. */
fun parseCommandPreview(body: JsonElement?): CommandPreview? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val b = root["buyruq"].obj() ?: root["natija"].obj()?.get("buyruq").obj() ?: return null
    return CommandPreview(
        kindOf(b["tur"].str()), b["nomi"].str().orEmpty().trim(), b["birligi"].str().orEmpty().trim(), b["miqdor"].num()?.takeIf { it > 0 },
        b["obyekt_id"].num()?.toLong()?.takeIf { it > 0 }, b["kimga"].str().orEmpty().trim(), b["izoh"].str().orEmpty().trim(),
        b["javob"].str()?.takeIf { it.isNotBlank() }, b["eshitildi"].str()?.takeIf { it.isNotBlank() },
    )
}

/** Preview is complete enough to save: a receive / issue needs a name and a quantity. */
fun CommandPreview.canSave(): Boolean = (kind == CommandKind.RECEIVE || kind == CommandKind.ISSUE) && name.isNotBlank() && qty != null

class BffOmborCommandApi(private val api: BffApi) : OmborCommandApi {
    override suspend fun text(companyId: Long, text: String, lang: String) = send(textCommandBody(companyId, text, lang))
    override suspend fun audio(companyId: Long, audio: RecordedAudio, lang: String) = send(audioCommandBody(companyId, audio, lang))

    private suspend fun send(body: JsonObject): CommandOutcome {
        val r = api.bff(COMMAND_PATH, "POST", body)
        return when {
            r.networkError -> CommandOutcome.Offline
            r.status == 403 -> CommandOutcome.Forbidden
            r.status == 404 || r.status == 503 || r.status == 400 && r.code == "PATH_NOT_ALLOWED" -> CommandOutcome.Unavailable
            !r.ok -> CommandOutcome.Failed(r.code ?: "HTTP ${r.status}")
            else -> parseCommandPreview(r.body)?.takeIf { it.kind != CommandKind.UNKNOWN }?.let { CommandOutcome.Preview(it) } ?: CommandOutcome.NotUnderstood
        }
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
