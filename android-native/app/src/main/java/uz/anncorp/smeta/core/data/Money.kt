package uz.anncorp.smeta.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonPrimitive

/*
 * Owner rule: EVERY sum is shown both without markup (ustamasiz, "pryamye") and with markup (ustamali, ITOGO-4), and an
 * object's value is shown QQS-inclusive first. The arithmetic (markup cascade from the estimate cellar, QQS) lives on the
 * server: the same `rahbar_panel_v1` read the web "object card" uses returns, per object, a sum package
 * `{qqs_bilan, ustamali, ustamasiz}` for the estimate (smeta), the fact and the accepted F-2
 * (frontend/src/api/t2-rahbar-panel.ts, frontend/src/lib/summa-paket.ts, server `_t2_summa_paket_v1`).
 * The app never re-derives these numbers: it only parses and displays them. A missing package is null ("unknown"), never 0.
 */

/** QQS-inclusive, QQS-free with markup (ITOGO-4) and QQS-free without markup (direct cost). All three come from the server. */
@Serializable
data class SumPack(val qqsBilan: Double, val ustamali: Double, val ustamasiz: Double)

@Serializable
data class ObjectMoney(val smeta: SumPack? = null, val fakt: SumPack? = null, val f2: SumPack? = null, val f2DraftCount: Int? = null) {
    val any get() = smeta != null || fakt != null || f2 != null
}

/** Strict: a package without all three numbers is rejected as a whole (the web's `summaPaket()` does the same). */
fun parseSumPack(e: JsonElement?): SumPack? {
    val o = e.obj() ?: return null
    val qqs = o["qqs_bilan"].num() ?: return null
    val markup = o["ustamali"].num() ?: return null
    val plain = o["ustamasiz"].num() ?: return null
    return SumPack(qqs, markup, plain)
}

fun rahbarPanelRequest(companyId: Long, obyektId: Long? = null): JsonObject = buildJsonObject {
    put("soro", "rahbar_panel_v1")
    put("kompaniya_id", companyId)
    if (obyektId != null) put("obyekt_id", obyektId)
}

/** `{ok:true, natija:{ok:true, obyektlar:[{obyekt_id, smeta, fakt, f2, f2_qoralama:{soni}}]}}` -> money per object id. Anything else -> null. */
fun parseRahbarPanel(body: JsonElement?): Map<Long, ObjectMoney>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val natija = root["natija"].obj() ?: return null
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list = natija["obyektlar"].arr() ?: return null
    val out = LinkedHashMap<Long, ObjectMoney>()
    for (e in list) {
        val o = e.obj() ?: continue
        val id = o["obyekt_id"].num()?.toLong() ?: continue
        out[id] = ObjectMoney(parseSumPack(o["smeta"]), parseSumPack(o["fakt"]), parseSumPack(o["f2"]), o["f2_qoralama"].obj()?.get("soni").num()?.toInt())
    }
    return out
}

/** What a money block shows. Both markup variants are always part of the model; null = unknown ("—"), never 0. */
data class MoneyDisplay(val vatIncl: Double?, val withMarkup: Double?, val withoutMarkup: Double?, val fromServer: Boolean)

/**
 * [pack] is the server package. When it is not available (no financial read right, offline before the first sync) the only
 * thing known is the direct, markup-free amount computed from the cached rows ([plainFallback]); the markup and QQS-inclusive
 * figures stay unknown rather than being guessed on the client.
 */
fun displayMoney(pack: SumPack?, plainFallback: Double?): MoneyDisplay =
    if (pack != null) MoneyDisplay(pack.qqsBilan, pack.ustamali, pack.ustamasiz, true)
    else MoneyDisplay(null, null, plainFallback, false)
