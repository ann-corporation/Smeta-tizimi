package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity

/*
 * Boss (rahbar) panel. Source of truth is the SAME server read the web panel uses: /api/sb `rahbar_panel_v1`
 * (frontend/src/api/t2-rahbar-panel.ts, `t2_rahbar_panel_v1`: cards, cash flow, object matrix, attention list, approval queue).
 * Hisob-yadro rule: the device never derives money. Every figure below is a number the server returned; a value the server could
 * not know is null and is shown as a dash, never as 0. Percentages are the server's own `bajarilish` values.
 */

/** Roles that get the boss panel shortcuts. The server still decides by permission (control.company.read / financial.*). */
fun isBossRole(role: String?): Boolean = when (role?.trim()?.lowercase()) {
    "boss", "rahbar", "direktor", "director", "superadmin", "admin", "egasi", "owner" -> true
    else -> false
}

data class RahbarAging(val d0to30: Double, val d30to60: Double, val d60plus: Double)

data class RahbarCards(
    val contractsQqs: Double?, val contractCount: Int,
    val smeta: SumPack?, val smetaCurrent: SumPack?,
    val fact: SumPack?,
    val f2: SumPack?, val f2Count: Int, val f2PercentOfSmeta: Double?,
    val paid: Double?, val receivable: Double?, val aging: RahbarAging?, val payable: Double?, val profitPercent: Double?,
)

data class RahbarMonth(val month: String, val done: Double?, val paid: Double?, val cost: Double?)

data class RahbarForecast(val days: Int, val draftF2: Double?, val unpaidF2: Double?, val expected: Double?)

data class RahbarObject(
    val id: Long, val nom: String, val status: String?,
    val contractQqs: Double?,
    val smeta: SumPack?, val fact: SumPack?, val f2: SumPack?, val f2Drafts: Int,
    val paid: Double?, val paidPercent: Double?, val debt: Double?,
    val factPercent: Double?, val f2Percent: Double?, val f3Percent: Double?,
    val signals: Int, val critical: Int,
)

data class RahbarAttention(val code: String, val objectId: Long?, val nom: String?, val impact: Double?, val count: Int?)

data class RahbarApproval(val kind: String, val id: Long, val objectId: Long?, val nom: String?, val stage: String?, val sum: Double?, val since: String?)

data class RahbarPanelData(
    val generatedAt: String?,
    val objectCount: Int,
    val cards: RahbarCards,
    val months: List<RahbarMonth>,
    val forecast: RahbarForecast?,
    val objects: List<RahbarObject>,
    val attention: List<RahbarAttention>,
    val approvals: List<RahbarApproval>,
) {
    /** Objects whose signals are critical or that have an attention entry, worst first: the "top problems". */
    fun problemObjects(): List<RahbarObject> = objects.filter { it.critical > 0 || it.signals > 0 }.sortedWith(compareByDescending<RahbarObject> { it.critical }.thenByDescending { it.signals })
}

/** Unwraps `{ok:true, natija:{ok:true,...}}` (as /api/sb returns it) to the inner panel object. */
fun rahbarNatija(body: JsonElement?): JsonObject? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val natija = root["natija"].obj() ?: return null
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return natija
}

/** The whole panel. Returns null for a malformed response (never a half-filled panel). */
fun parseRahbarFull(natija: JsonObject?): RahbarPanelData? {
    natija ?: return null
    val k = natija["kartalar"].obj() ?: return null
    val port = k["portfel"].obj()
    val baj = k["bajarildi"].obj()
    val tol = k["tolandi"].obj()
    val deb = k["debitor"].obj()
    val yosh = deb?.get("yosh").obj()?.let { y ->
        val a = y["k0_30"].num(); val b = y["k30_60"].num(); val c = y["k60"].num()
        if (a != null && b != null && c != null) RahbarAging(a, b, c) else null
    }
    val cards = RahbarCards(
        contractsQqs = port?.get("shartnoma_qqs_bilan").num(), contractCount = port?.get("shartnoma_soni").num()?.toInt() ?: 0,
        smeta = parseSumPack(port?.get("smeta")), smetaCurrent = parseSumPack(port?.get("smeta_joriy")),
        fact = parseSumPack(natija["fakt"]),
        f2 = parseSumPack(baj?.get("jami")), f2Count = baj?.get("akt_soni").num()?.toInt() ?: 0, f2PercentOfSmeta = baj?.get("foiz_smeta").num(),
        paid = tol?.get("jami").num(), receivable = deb?.get("qiymat").num(), aging = yosh,
        payable = k["kreditor"].obj()?.get("qiymat").num(), profitPercent = k["rentabellik"].obj()?.get("foiz").num(),
    )
    val months = natija["pul_oqimi"].obj()?.get("oylar").arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        RahbarMonth(o["oy"].str() ?: return@mapNotNull null, o["bajarildi"].num(), o["tolov"].num(), o["xarajat"].num())
    }
    val fc = natija["pul_oqimi"].obj()?.get("prognoz").obj()?.let { RahbarForecast(it["kun"].num()?.toInt() ?: 0, it["qoralama_f2"].num(), it["tolanmagan_f2"].num(), it["kutilayotgan"].num()) }
    val objects = natija["obyektlar"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val id = o["obyekt_id"].num()?.toLong() ?: return@mapNotNull null
        val b = o["bajarilish"].obj()
        val sig = o["signal"].obj()
        RahbarObject(
            id, o["nom"].str().orEmpty().ifBlank { "#$id" }, o["holat"].str(),
            o["shartnoma"].obj()?.get("qqs_bilan").num(),
            parseSumPack(o["smeta"]), parseSumPack(o["fakt"]), parseSumPack(o["f2"]), o["f2_qoralama"].obj()?.get("soni").num()?.toInt() ?: 0,
            o["tolangan"].num(), o["tolangan_foiz"].num(), o["qarz"].num(),
            b?.get("fakt").num(), b?.get("f2").num(), b?.get("f3").num(),
            sig?.get("soni").num()?.toInt() ?: 0, sig?.get("kritik").num()?.toInt() ?: 0,
        )
    }
    val attention = natija["diqqat"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        RahbarAttention(o["kod"].str() ?: return@mapNotNull null, o["obyekt_id"].num()?.toLong(), o["nom"].str(), o["summa_tasir"].num(), o["soni"].num()?.toInt())
    }
    val approvals = natija["tasdiq_kutmoqda"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        RahbarApproval(o["tur"].str().orEmpty(), o["id"].num()?.toLong() ?: return@mapNotNull null, o["obyekt_id"].num()?.toLong(), o["nom"].str(), o["bosqich"].str(), o["summa"].num(), o["qachondan"].str())
    }
    return RahbarPanelData(
        natija["generated_at"].str(), natija["qamrov"].obj()?.get("obyekt_soni").num()?.toInt() ?: objects.size,
        cards, months, fc, objects, attention, approvals,
    )
}

/** Plain-language key of an attention code -> string resource suffix (see strings rb_att_*). Unknown codes fall back to a generic label. */
enum class AttentionKind(val code: String) {
    UNHANDED("fakt_topshirilmagan"), F2_OVER_FACT("f2_faktdan_oshgan"), OVER_ESTIMATE("smetadan_oshgan"), NO_F3("f3_chiqarilmagan"),
    CONTRACT_LIMIT("shartnoma_limit"), PAY_LATE("tolov_kechikkan"), REGISTRY_DIFF("reestr_farq"), UNPRICED("narxsiz"), STOCK_NEGATIVE("sklad_manfiy"), OTHER("");
    companion object { fun of(code: String): AttentionKind = entries.firstOrNull { it.code == code && it != OTHER } ?: OTHER }
}

class RahbarRepository(private val api: BffApi, private val db: AppDb, private val json: Json, private val money: MoneyRepository) {
    /** Cached panel for offline reading (the raw server object is stored; parsing is pure). */
    fun observe(companyId: Long): Flow<RahbarPanelData?> = db.meta().observe("rahbar:$companyId").map { s ->
        s?.let { runCatching { parseRahbarFull(json.parseToJsonElement(it) as? JsonObject) }.getOrNull() }
    }

    fun lastUpdated(companyId: Long): Flow<Long?> = db.meta().observe("rahbar_ts:$companyId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff("/api/sb", "POST", rahbarPanelRequest(companyId))
        if (!r.ok) return when { r.networkError -> SyncResult.Offline; r.status == 403 -> SyncResult.Forbidden; else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}") }
        val natija = rahbarNatija(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        if (parseRahbarFull(natija) == null) return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("rahbar:$companyId", natija.toString()))
        db.meta().put(MetaEntity("rahbar_ts:$companyId", now.toString()))
        parseRahbarPanel(r.body)?.let { money.store(it) }
        return SyncResult.Ok
    }
}
