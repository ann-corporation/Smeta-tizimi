package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Totals of ONE F-2 act: QQS bilan (main), ustamali (QQS siz), ustamasiz (QQS siz). The numbers come from the server's single sum core
 * (/api/sb `akt_summa_paket_v1` -> t2_akt_summa_paket_v1 -> _t2_summa_paket_v1, the same figures as the website and the smeta MCP `f2` tool).
 * The app NEVER computes QQS or markup; a missing figure is shown as unknown, not 0.
 */
fun aktSummaRequest(aktId: Long): JsonObject = buildJsonObject { put("soro", "akt_summa_paket_v1"); put("akt_id", aktId) }

sealed interface AktSumma {
    data class Known(val pack: SumPack, val unpriced: Int?) : AktSumma
    /** The server has no figure (yet): old database without the RPC, no permission, or the act has no priced rows. */
    data class Unknown(val code: String?) : AktSumma
}

/** `{ok:true, natija:{ok:true, akt_id, paket:{qqs_bilan, ustamali, ustamasiz, narxsiz_soni}}}` (or the unwrapped natija). */
fun parseAktSumma(body: JsonElement?): AktSumma {
    val root = body.obj() ?: return AktSumma.Unknown("BAD_SHAPE")
    val natija = root["natija"].obj() ?: root
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull == false) return AktSumma.Unknown(natija["code"].str())
    val paket = natija["paket"].obj() ?: return AktSumma.Unknown("NO_PACKET")
    val pack = parseSumPack(paket) ?: return AktSumma.Unknown("NO_SUM")
    return AktSumma.Known(pack, paket["narxsiz_soni"].num()?.toInt())
}

class AktSummaRepository(private val api: BffApi) {
    suspend fun load(aktId: Long): AktSumma {
        val r = api.bff("/api/sb", "POST", aktSummaRequest(aktId))
        if (r.networkError) return AktSumma.Unknown("OFFLINE")
        if (!r.ok) return AktSumma.Unknown(r.code ?: "HTTP ${r.status}")
        return parseAktSumma(r.body)
    }
}

/** Uzbek note when the figure is unavailable. */
fun aktSummaUnknownText(code: String?): String = when (code) {
    "OFFLINE" -> "Summa oflayn: serverdan olinmadi."
    "PERMISSION_DENIED", "HTTP 403" -> "Summani ko'rishga ruxsat yo'q."
    else -> "Summa serverda hali hisoblanmagan yoki mavjud emas."
}