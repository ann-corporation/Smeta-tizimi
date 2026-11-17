/* ONE code for two platforms: wire contracts + pure parsers shared by the Windows app and (additively) Android. */
package uz.anncorp.smeta.feature.common

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatVolume
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.f2ListRequest
import uz.anncorp.smeta.core.data.objectsRequest
import uz.anncorp.smeta.core.data.parseF2List
import uz.anncorp.smeta.core.data.parseRahbarPanel
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.rahbarPanelRequest
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.feature.ombor.Warehouse
import uz.anncorp.smeta.feature.ombor.parseWarehouses
import uz.anncorp.smeta.feature.ombor.warehousesRequest

/*
 * Desktop data layer. The wire shapes mirror the web code and the Android app (the server is the only authority: it derives the actor from the
 * device and decides every permission, sum and markup). Everything here that parses is PURE (no I/O) so it is unit tested on the JVM.
 * Reads go through [Services.read], which keeps an encrypted offline copy (72 h) of the last good answer.
 */

// ---------- small JSON helpers ----------

fun JsonObject.s(k: String): String? = this[k].str()
fun JsonObject.n(k: String): Double? = this[k].num()
fun JsonObject.l(k: String): Long? = this[k].num()?.toLong()
fun JsonObject.b(k: String): Boolean? = (this[k] as? JsonPrimitive)?.booleanOrNull

/** Rows of an `{ok, qatorlar:[...]}` answer, also when wrapped as `{ok, natija:{ok, qatorlar}}` (the RPC form). Null for any other shape. */
fun rowsOf(body: JsonElement?): List<JsonObject>? {
    val root = body.obj() ?: return null
    if (root.b("ok") == false) return null
    val inner = root["natija"].obj()
    if (inner != null && inner.b("ok") == false) return null
    val arr: JsonArray = (inner ?: root)["qatorlar"].arr() ?: return null
    return arr.mapNotNull { it.obj() }
}

// ---------- objects ----------

data class Obj(val id: Long, val nom: String, val tur: String?, val rows: Int?, val unpriced: Int?, val total: Double?)

fun parseObjs(body: JsonElement?): List<Obj>? = parseSb(body)?.rows?.mapNotNull { r ->
    Obj(r.l("id") ?: return@mapNotNull null, r.s("nom").orEmpty(), r.s("tur"), r.n("qator_soni")?.toInt(), r.n("narxsiz")?.toInt(), r.n("jami"))
}

// ---------- F-2 ----------

data class ActRow(val qatorId: Long, val kod: String?, val nom: String, val birlik: String?, val hajm: Double?, val narx: Double?, val summa: Double?)

fun f2ActRowsRequest(aktId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_akt_qator"); put("filtr", "akt_id=eq.$aktId"); put("ustunlar", "id,akt_id,qator_id,hajm,narx,summa"); put("tartib", "id.asc"); put("limit", 20000)
}

/** Raw act rows joined with the estimate names (kod / nom / birlik) from the object packet. Rows the packet does not know keep their id as the name. */
fun parseActRows(body: JsonElement?, names: Map<Long, SNode>): List<ActRow>? = parseSb(body)?.rows?.mapNotNull { r ->
    val qid = r.l("qator_id") ?: return@mapNotNull null
    val node = names[qid]
    ActRow(qid, node?.kod, node?.nom ?: "#$qid", node?.birlik, r.n("hajm"), r.n("narx"), r.n("summa"))
}

// ---------- fakt journal ----------

data class FaktDoc(val id: Long, val raqam: String?, val oy: String?, val status: String?, val jami: Double?)

fun faktJournalRequest(obyektId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_akt"); put("filtr", "obyekt_id=eq.$obyektId&tur=eq.fakt"); put("ustunlar", "id,raqam,oy,lifecycle_status,hujjat_jami"); put("tartib", "id.desc"); put("limit", 2000)
}

fun parseFaktJournal(body: JsonElement?): List<FaktDoc>? = parseSb(body)?.rows?.mapNotNull { r ->
    FaktDoc(r.l("id") ?: return@mapNotNull null, r.s("raqam"), r.s("oy"), r.s("lifecycle_status"), r.n("hujjat_jami"))
}

/** One line of a fact entry: row id and the volume done (a minus is a real value, "normaga keltirish"). */
data class FaktLine(val qatorId: Long, val hajm: Double)

fun faktWriteBody(companyId: Long, obyektId: Long, sana: String, lines: List<FaktLine>, operationId: String): JsonObject = buildJsonObject {
    put("amal", "fakt_yoz_v2"); put("kompaniya_id", companyId); put("obyekt_id", obyektId); put("sana", sana)
    put("qatorlar", buildJsonArray { lines.forEach { add(buildJsonObject { put("qator_id", it.qatorId); put("hajm", it.hajm) }) } })
    put("operation_id", operationId)
}

data class FaktOutcome(val ok: Boolean, val error: String?, val raqam: String?, val jami: Double?, val warnings: List<String>)

fun parseFaktOutcome(r: ApiResult): FaktOutcome {
    val o = r.body.obj()
    val ok = r.ok && o?.b("ok") != false
    val warn = mutableListOf<String>()
    o?.get("ogohlantirish").arr()?.forEach { e -> e.obj()?.let { w -> warn += "${w.s("nom").orEmpty()}: ${w.n("bor")?.let { formatVolume(it) } ?: T_DASH} + ${w.n("qoshilmoqda")?.let { formatVolume(it) } ?: T_DASH} > ${w.n("chegara")?.let { formatVolume(it) } ?: T_DASH}" } }
    (o?.n("narxsiz_soni") ?: o?.n("narxsiz"))?.takeIf { it > 0 }?.let { warn += "${it.toInt()} ta qator narxsiz" }
    return FaktOutcome(ok, o?.s("error") ?: r.code, o?.s("raqam"), o?.n("jami"), warn)
}

private const val T_DASH = "—"

// ---------- smeta packet (tree) ----------

/** One node of the estimate tree: RZ (section) -> BL (work) -> RS / MAT / OB (resources). Sums are QQS-free direct amounts from the server packet. */
data class SNode(
    val id: Long, val parent: Long?, val depth: Int, val tur: String, val kod: String?, val nom: String, val birlik: String?,
    val hajm: Double?, val narx: Double?, val summa: Double?, val faktHajm: Double, val faktSumma: Double, val f2Hajm: Double, val f2Summa: Double,
    val hasChildren: Boolean, var roll: Double? = null,
) {
    val isBl get() = tur == "bl"
    val isRz get() = tur == "rz"
}

data class Packet(val obyektId: Long, val nodes: List<SNode>) {
    val byId: Map<Long, SNode> by lazy { nodes.associateBy { it.id } }
    val blCount: Int get() = nodes.count { it.isBl }
}

const val PAKET_FORMAT = "t2-paket/1"

/** Column-oriented packet -> tree in web order (children by tartib then id, depth first). Wrong format / misaligned columns -> null (never half data). */
fun parsePacket(body: JsonElement?): Packet? {
    val o = body.obj() ?: return null
    if (o["format"].str() != PAKET_FORMAT) return null
    val obyektId = o["obyekt_id"].num()?.toLong() ?: return null
    val n = o["soni"].num()?.toInt() ?: return null
    val q = o["q"].obj() ?: return null
    val h = o["h"].obj() ?: return null
    val lugat = o["lugat"].obj() ?: return null
    val ids = q["id"].arr() ?: return null
    if (ids.size != n) return null
    fun col(owner: JsonObject, key: String): JsonArray? = owner[key].arr()?.takeIf { it.size == n }
    val tur = col(q, "tur") ?: return null
    val kod = col(q, "kod") ?: return null
    val nom = col(q, "nom") ?: return null
    val birlik = col(q, "birlik") ?: return null
    val hajm = col(q, "hajm") ?: return null
    val narx = col(q, "narx") ?: return null
    val summa = col(q, "summa") ?: return null
    val fh = col(h, "fakt_hajm") ?: return null
    val fs = col(h, "fakt_summa") ?: return null
    val f2h = col(h, "f2_hajm") ?: return null
    val f2s = col(h, "f2_summa") ?: return null
    fun dict(key: String): List<String> = lugat[key].arr()?.map { it.str().orEmpty() } ?: emptyList()
    val dTur = dict("tur"); val dKod = dict("kod"); val dNom = dict("nom"); val dBirlik = dict("birlik")
    fun lk(d: List<String>, e: JsonElement): String? = e.num()?.toInt()?.let { d.getOrNull(it) }
    val smetaOverride = h["smeta_hajm"].obj()
    val ota = col(q, "ota_id"); val tartib = col(q, "tartib")
    val index = HashMap<Long, Int>(n * 2).also { m -> for (i in 0 until n) ids[i].num()?.toLong()?.let { m[it] = i } }
    val kids = HashMap<Int, MutableList<Int>>(); val roots = ArrayList<Int>()
    for (i in 0 until n) {
        val p = if (ota == null) null else ota[i].num()?.toLong()?.let { index[it] }
        if (p == null || p == i) roots += i else kids.getOrPut(p) { ArrayList() } += i
    }
    val byOrder = Comparator<Int> { a, b ->
        (tartib?.get(a).num() ?: a.toDouble()).compareTo(tartib?.get(b).num() ?: b.toDouble()).let { c -> if (c != 0) c else (ids[a].num() ?: 0.0).compareTo(ids[b].num() ?: 0.0) }
    }
    roots.sortWith(byOrder); kids.values.forEach { it.sortWith(byOrder) }
    val depth = IntArray(n); val seen = BooleanArray(n); val order = ArrayList<Int>(n)
    for (r in roots) {
        val st = ArrayDeque<Int>(); st.addLast(r); depth[r] = 0
        while (st.isNotEmpty()) {
            val i = st.removeLast()
            if (seen[i]) continue
            seen[i] = true; order += i
            kids[i]?.asReversed()?.forEach { c -> if (!seen[c]) { depth[c] = depth[i] + 1; st.addLast(c) } }
        }
    }
    for (i in 0 until n) if (!seen[i]) { seen[i] = true; order += i } // cyclic / orphan guard: nothing is dropped
    val nodes = order.map { i ->
        val id = ids[i].num()?.toLong() ?: return null
        SNode(
            id, ota?.get(i)?.num()?.toLong()?.takeIf { index.containsKey(it) && it != id }, depth[i], lk(dTur, tur[i]).orEmpty(), lk(dKod, kod[i]), lk(dNom, nom[i]).orEmpty(), lk(dBirlik, birlik[i]),
            smetaOverride?.get(id.toString()).num() ?: hajm[i].num(), narx[i].num(), summa[i].num(),
            fh[i].num() ?: 0.0, fs[i].num() ?: 0.0, f2h[i].num() ?: 0.0, f2s[i].num() ?: 0.0, kids.containsKey(i),
        )
    }
    // Section roll-up: the amount of every BL under a section (BL amounts do not bubble through other BLs, so a work is counted once).
    val pos = HashMap<Long, Int>(nodes.size * 2).also { m -> nodes.forEachIndexed { i, x -> m[x.id] = i } }
    val acc = DoubleArray(nodes.size); val known = BooleanArray(nodes.size)
    for (i in nodes.indices.reversed()) {
        val x = nodes[i]
        if (x.isBl) { x.summa?.let { acc[i] += it; known[i] = true } }
        val p = x.parent?.let { pos[it] }
        if (p != null && !nodes[p].isBl && (x.isBl || known[i])) { acc[p] += acc[i]; known[p] = known[p] || known[i] }
    }
    nodes.forEachIndexed { i, x -> if (x.isRz && known[i]) x.roll = acc[i] }
    return Packet(obyektId, nodes)
}

/** Rows to draw in tree order. No query: a node shows when all its ancestors are expanded. Query: matches (code or name) + all their ancestors. */
fun visibleNodes(nodes: List<SNode>, expanded: Set<Long>, query: String): List<SNode> {
    val q = query.trim()
    if (q.isEmpty()) {
        val out = ArrayList<SNode>(); var hideBelow = Int.MAX_VALUE
        for (x in nodes) {
            if (x.depth > hideBelow) continue
            hideBelow = Int.MAX_VALUE; out += x
            if (x.hasChildren && x.id !in expanded) hideBelow = x.depth
        }
        return out
    }
    val index = HashMap<Long, Int>(nodes.size * 2).also { m -> nodes.forEachIndexed { i, x -> m[x.id] = i } }
    val keep = BooleanArray(nodes.size)
    nodes.forEachIndexed { i, x ->
        if (!keep[i] && ((x.kod ?: "").contains(q, ignoreCase = true) || x.nom.contains(q, ignoreCase = true))) {
            keep[i] = true
            var p = x.parent?.let { index[it] }; var hops = 0
            while (p != null && !keep[p] && hops++ < 64) { keep[p] = true; p = nodes[p].parent?.let { index[it] } }
        }
    }
    return nodes.filterIndexed { i, _ -> keep[i] }
}

// ---------- narx (price centre) ----------

data class NarxRow(
    val nom: String, val birlik: String?, val kat: String?, val obyektSoni: Int, val smetaMax: Double?, val smetaMin: Double?,
    val belgilangan: Double?, val natija: Double?, val manba: String?, val xavf: Boolean, val qatorSoni: Int,
)

fun narxRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_narx_markaz"); put("filtr", "kompaniya_id=eq.$companyId"); put("tartib", "nom.asc"); put("limit", 20000)
}

fun parseNarx(body: JsonElement?): List<NarxRow>? = parseSb(body)?.rows?.map { r ->
    NarxRow(r.s("nom").orEmpty(), r.s("birlik"), r.s("kat"), r.n("obyekt_soni")?.toInt() ?: 0, r.n("smeta_max"), r.n("smeta_min"), r.n("belgilangan_narx"), r.n("natija"), r.s("manba"), r.b("xavf") == true, r.n("qator_soni")?.toInt() ?: 0)
}

// ---------- debts ----------

data class DebtRow(val raqam: String?, val nom: String?, val kontragent: String?, val shartnoma: Double?, val f3: Double?, val tolangan: Double?, val qarz: Double?, val oxirgiTolov: String?)

fun debtRequest(companyId: Long): JsonObject = buildJsonObject { put("soro", "qarz_svod_v1"); put("kompaniya_id", companyId) }

fun parseDebtRows(body: JsonElement?): List<DebtRow>? = rowsOf(body)?.filter { it.s("yonalish").let { y -> y == null || y == "debitor" } }?.map { o ->
    DebtRow(o.s("raqam"), o.s("nom"), o.s("kontragent"), o.n("shartnoma_summa"), o.n("f3_sotuv"), o.n("tolangan"), o.n("qarz"), o.s("oxirgi_tolov_sana"))
}

// ---------- documents ----------

data class DocRow(val id: Long, val name: String, val type: String, val mime: String, val size: Long, val updated: String, val ready: Boolean)

fun docsPath(companyId: Long, objectId: Long) = "/api/hujjat-royxat?kompaniya_id=$companyId&obyekt_id=$objectId&limit=300"
fun docPath(id: Long) = "/api/hujjat-ol?id=$id"

fun parseDocs(body: JsonElement?): List<DocRow>? {
    val root = body.obj() ?: return null
    if (root.b("ok") != true) return null
    return root["documents"].arr()?.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val id = o.s("id")?.toLongOrNull() ?: return@mapNotNull null
        DocRow(id, o.s("filename")?.takeIf { it.isNotBlank() } ?: "hujjat-$id", o.s("type").orEmpty(), o.s("mime") ?: "application/octet-stream", o.n("size")?.toLong() ?: 0L, o.s("updatedAt").orEmpty(), o.s("canonicalStatus") == "READY")
    }
}

// ---------- profile ----------

data class Profile(val ism: String, val email: String, val telefon: String?, val til: String?)

fun parseProfile(body: JsonElement?): Profile? {
    val p = body.obj()?.get("profil").obj() ?: return null
    return Profile(p.s("ism").orEmpty(), p.s("email") ?: p.s("login").orEmpty(), p.s("telefon"), p.s("til"))
}

fun profileUpdateBody(name: String?, phone: String?, lang: String?): JsonObject = buildJsonObject {
    put("amal", "yangila"); name?.let { put("ism", it.trim()) }; phone?.let { put("telefon", it) }; lang?.let { put("til", it) }
}

// ---------- ombor ----------

/** What the warehouse command endpoint answered (the server is the only authority; the app only shows and confirms). */
sealed interface OmborReply {
    data class Variant(val label: String, val tanlov: JsonObject)
    /** A write preview: nothing is saved until the user confirms with [token]. */
    data class Preview(
        val token: String, val tur: String, val nomi: String, val birligi: String, val miqdor: Double?, val kontragent: String, val obyekt: String, val izoh: String,
        val warnings: List<String>, val priceAsk: Boolean, val before: Double?, val after: Double?, val heard: String?,
    ) : OmborReply
    /** "savol": one short question (+ answer buttons); also for an incomplete command (`toldirish_kerak`) and for a command that was not understood. */
    data class Ask(val text: String, val variants: List<Variant>, val heard: String?) : OmborReply
    data class Info(val title: String, val lines: List<String>) : OmborReply
    data class Fail(val text: String) : OmborReply
}

fun omborBody(amal: String, companyId: Long, skladId: Long, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}): JsonObject = buildJsonObject {
    put("amal", amal); put("kompaniya_id", companyId); put("sklad_id", skladId); build()
}

fun omborText(companyId: Long, skladId: Long, text: String, tanlov: JsonObject? = null): JsonObject = omborBody("tahlil", companyId, skladId) {
    put("til", "uzb"); put("matn", text.trim().take(500)); if (tanlov != null && tanlov.isNotEmpty()) put("tanlov", tanlov)
}

fun omborEdited(companyId: Long, skladId: Long, tur: String, nomi: String, birligi: String, miqdor: Double, kontragent: String, izoh: String): JsonObject = omborBody("tahlil", companyId, skladId) {
    put("buyruq", buildJsonObject {
        put("amal", if (tur == "chiqim" || tur == "rasxod") "chiqim" else "prixod"); put("nomi", nomi.trim().take(500)); put("miqdor", miqdor)
        if (birligi.isNotBlank()) put("birlik", birligi.trim().take(100)); if (kontragent.isNotBlank()) put("kontragent", kontragent.trim().take(500)); if (izoh.isNotBlank()) put("izoh", izoh.trim().take(1000))
    })
}

fun omborConfirm(companyId: Long, skladId: Long, token: String): JsonObject = omborBody("tasdiq", companyId, skladId) { put("token", token) }

private fun JsonElement?.strList(): List<String> = this.arr()?.mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotEmpty() } }.orEmpty()

fun omborFmt(v: Double?): String = if (v == null) T_DASH else uz.anncorp.smeta.feature.ombor.formatQty(v)

/** Maps the `tahlil` answer. Never throws on an unexpected shape. */
fun parseOmborReply(r: ApiResult): OmborReply {
    val root = r.body.obj()
    if (r.networkError) return OmborReply.Fail("Oflayn: yozib bo'lmaydi, tarmoqqa ulanib qayta urinib ko'ring")
    if (r.status == 402) return OmborReply.Fail(root?.s("xabar") ?: root?.s("error") ?: "Token yetarli emas")
    if (r.status == 403) return OmborReply.Fail("Bu ombor uchun ruxsat yo'q")
    if (!r.ok && root == null) return OmborReply.Fail(r.code ?: "Xato HTTP ${r.status}")
    if (root == null) return OmborReply.Fail("Server javobi noto'g'ri")
    if (root.b("ok") == false) return OmborReply.Fail(root.s("xabar") ?: root.s("error") ?: root.s("code") ?: "Xato")
    val heard = root.s("matn")?.takeIf { it.isNotBlank() }
    val variants = root["variantlar"].arr()?.mapNotNull { e -> e.obj()?.let { v -> v["tanlov"].obj()?.let { t -> OmborReply.Variant(v.s("yorliq").orEmpty().ifBlank { "Tanlash" }, t) } } }.orEmpty()
    return when (root.s("holat")) {
        "tasdiq_kerak" -> {
            val p = root["preview"].obj() ?: return OmborReply.Fail("Server javobi noto'g'ri")
            val token = root.s("token")?.takeIf { it.isNotBlank() } ?: return OmborReply.Fail("Server javobi noto'g'ri")
            val tur = p.s("tur")?.lowercase() ?: p.s("amal")?.lowercase().orEmpty()
            OmborReply.Preview(token, tur, p.s("nomi").orEmpty(), p.s("birligi").orEmpty(), p.n("miqdor"), p.s("kontragent").orEmpty(), p.s("obyekt").orEmpty(), p.s("izoh").orEmpty(),
                p["ogohlantirish"].strList(), p.s("narx_sorov") == "true" || p.b("narx_sorov") == true, p.n("qoldiq_hozir"), p.n("qoldiq_keyin"), heard)
        }
        "savol", "toldirish_kerak" -> OmborReply.Ask(root.s("savol")?.takeIf { it.isNotBlank() } ?: "Aniqroq yozing: nima, qancha, kirimmi yoki chiqimmi?", variants, heard)
        "tushunilmadi" -> OmborReply.Ask(root.s("savol")?.takeIf { it.isNotBlank() } ?: "Tushunmadim. Masalan: «sement 10 qop keldi»", variants, heard)
        "javob" -> {
            val rows = root["nomzodlar"].arr().orEmpty().mapNotNull { e -> e.obj()?.let { o -> o.s("nomi")?.takeIf { it.isNotBlank() }?.let { nm -> "$nm: ${omborFmt(o.n("qoldiq"))} ${o.s("birligi").orEmpty()}".trim() } } }
            val m = root["material"].obj()?.let { "${it.s("nomi").orEmpty()}: ${omborFmt(it.n("qoldiq"))} ${it.s("birligi").orEmpty()}".trim() }
            OmborReply.Info("Qoldiq" + (root.s("sana")?.let { " ($it)" } ?: ""), rows.ifEmpty { listOfNotNull(m) }.ifEmpty { listOf("Topilmadi") })
        }
        "hisobot" -> OmborReply.Info("Hisobot", reportLines(root["hisobot"].obj()))
        "qoldiq_yetmaydi" -> OmborReply.Fail("Omborda yetarli qoldiq yo'q")
        "sana_kelajakda" -> OmborReply.Fail("Sana kelajakda bo'lishi mumkin emas")
        else -> OmborReply.Fail(root.s("xabar") ?: "Tushunilmadi")
    }
}

/** Period summary of a report: period, counts and quantities per unit, sums QQS siz and QQS bilan. */
fun reportLines(h: JsonObject?): List<String> {
    val j = h?.get("jami").obj() ?: return emptyList()
    val davr = h?.get("davr").obj()
    val units = j["birliklar"].arr().orEmpty().mapNotNull { it.obj() }
    fun per(key: String) = units.mapNotNull { u -> u.n(key)?.takeIf { it > 0 }?.let { omborFmt(it) + " " + u.s("birligi").orEmpty() } }.joinToString(", ").ifEmpty { T_DASH }
    val out = mutableListOf("Davr: ${davr?.s("dan") ?: "…"} — ${davr?.s("gacha") ?: "…"}")
    out += "Kirim: ${j.n("kirim_soni")?.toLong() ?: 0} ta, ${per("kirim")}"
    j.n("kirim_summa")?.takeIf { it > 0 }?.let { out += "Kirim summasi: QQS siz ${moneyText(it)}, QQS bilan ${moneyText(j.n("kirim_summa_qqs"))}" }
    j.n("narxsiz_soni")?.takeIf { it > 0 }?.let { out += "Narxsiz kirim: ${it.toLong()} ta (jamiga kirmaydi)" }
    out += "Chiqim: ${j.n("chiqim_soni")?.toLong() ?: 0} ta, ${per("chiqim")}"
    return out
}

data class MoveRow(val sana: String, val op: String, val nomi: String, val birligi: String, val miqdor: Double?, val kontragent: String?, val obyekt: String?, val narx: Double?, val summa: Double?, val summaQqs: Double?)

fun parseMoves(body: JsonElement?): Pair<List<MoveRow>, List<String>>? {
    val root = body.obj() ?: return null
    if (root.b("ok") == false) return null
    val rows = root["qatorlar"].arr()?.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        MoveRow(o.s("sana").orEmpty(), if (o.s("operatsiya") == "prixod") "Kirim" else "Chiqim", o.s("nomi").orEmpty(), o.s("birligi").orEmpty(), o.n("obyomi"), o.s("kontragent"), o.s("obyekt"), o.n("narx"), o.n("summa"), o.n("summa_qqs"))
    } ?: return null
    return rows to reportLines(buildJsonObject { put("davr", root["davr"] ?: JsonObject(emptyMap())); put("jami", root["jami"] ?: JsonObject(emptyMap())) })
}

data class StockLine(val nomi: String, val birligi: String, val qoldiq: Double?, val kirim: Double?, val chiqim: Double?, val oxirgi: String?)

fun parseStockLines(body: JsonElement?): List<StockLine>? = rowsOf(body)?.mapNotNull { o ->
    val nm = o.s("nomi")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
    StockLine(nm, o.s("birligi").orEmpty(), o.n("qoldiq"), o.n("kirim"), o.n("chiqim"), o.s("oxirgi_sana"))
}


/** Money text: unknown (null) is a dash, never 0. */
fun moneyText(v: Double?): String = if (v == null) "\u2014" else formatMoney(v, 2)
