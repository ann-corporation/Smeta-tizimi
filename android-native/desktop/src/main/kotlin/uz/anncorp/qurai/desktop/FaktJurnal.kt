@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.input.key.isAltPressed
import uz.anncorp.smeta.core.fakt.MarkazAkt
import uz.anncorp.smeta.core.fakt.parseAktReestri
import uz.anncorp.smeta.core.fakt.aktReestriSoro
import uz.anncorp.smeta.core.fakt.faolOy
import uz.anncorp.smeta.core.fakt.markazHolati
import uz.anncorp.smeta.core.fakt.zanjirDaraxtdan
import uz.anncorp.smeta.core.fakt.zanjirHisobla
import uz.anncorp.smeta.core.fakt.ZanjirKirish
import uz.anncorp.smeta.core.fakt.faktYigindiHisobla
import uz.anncorp.smeta.core.fakt.TaklifQator
import uz.anncorp.smeta.core.fakt.ishKeyingiMateriallari
import uz.anncorp.smeta.core.fakt.materialTaklifi
import uz.anncorp.smeta.core.fakt.KiritmaSoni
import uz.anncorp.smeta.core.fakt.kiritmaSoni
import uz.anncorp.smeta.core.fakt.jsNumberString
import uz.anncorp.smeta.core.fakt.TiklashSatr
import uz.anncorp.smeta.core.fakt.TiklashMeta
import uz.anncorp.smeta.core.fakt.TiklashKontekst
import uz.anncorp.smeta.core.fakt.tiklashSatrlar
import uz.anncorp.smeta.core.fakt.tiklashQoralamaOqi
import uz.anncorp.smeta.core.fakt.AbcRejim
import uz.anncorp.smeta.core.fakt.bajarilishTahlili
import uz.anncorp.smeta.core.fakt.faktdanKiritmalar
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridState
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QDateField
import uz.anncorp.qurai.ui.components.QDialog
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.AMAL_FAKT
import uz.anncorp.smeta.core.data.FaktLine
import uz.anncorp.smeta.core.data.faktPayload
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.HolatFiltr
import uz.anncorp.smeta.core.fakt.HolatTur
import uz.anncorp.smeta.core.fakt.JURNAL_XATO_MATN
import uz.anncorp.smeta.core.fakt.JurnalBolim
import uz.anncorp.smeta.core.fakt.JurnalIsh
import uz.anncorp.smeta.core.fakt.JurnalMalumot
import uz.anncorp.smeta.core.fakt.JurnalQator
import uz.anncorp.smeta.core.fakt.Kiritma
import uz.anncorp.smeta.core.fakt.Rejim
import uz.anncorp.smeta.core.fakt.bolimTarkibi
import uz.anncorp.smeta.core.fakt.faktFormulaKonteksti
import uz.anncorp.smeta.core.fakt.faktMeter
import uz.anncorp.smeta.core.fakt.foizMatn
import uz.anncorp.smeta.core.fakt.holatFiltrMos
import uz.anncorp.smeta.core.fakt.HOLAT_MUHR
import uz.anncorp.smeta.core.fakt.jurnalPaket
import uz.anncorp.smeta.core.fakt.jurnalQur
import uz.anncorp.smeta.core.fakt.jurnalXulosa
import uz.anncorp.smeta.core.fakt.ochiqBor
import uz.anncorp.smeta.core.fakt.parseJurnalPaket
import uz.anncorp.smeta.core.fakt.BAJARILMADI_SABABLAR
import uz.anncorp.smeta.core.fakt.BajarilmadiYozuv
import uz.anncorp.smeta.core.fakt.bajarilmadiBekorPayload
import uz.anncorp.smeta.core.fakt.bajarilmadiBelgilaPayload
import uz.anncorp.smeta.core.fakt.bajarilmadiHajmlar
import uz.anncorp.smeta.core.fakt.bajarilmadiRoyxatSoro
import uz.anncorp.smeta.core.fakt.bajarilmadiTaklif
import uz.anncorp.smeta.core.fakt.bajarilmadiXato
import uz.anncorp.smeta.core.fakt.chiqarilganlarOl
import uz.anncorp.smeta.core.fakt.parseBajarilmadiRoyxat
import uz.anncorp.smeta.core.fakt.EskiF2Akt
import uz.anncorp.smeta.core.fakt.TenglashReja
import uz.anncorp.smeta.core.fakt.bolimIshlariYigish
import uz.anncorp.smeta.core.fakt.faktF2Reja
import uz.anncorp.smeta.core.fakt.obyektF2Reja
import uz.anncorp.smeta.core.fakt.tenglashManbaOqi
import uz.anncorp.smeta.core.fakt.QiymatUchlik
import uz.anncorp.smeta.core.fakt.SummaKesim
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.bolimSummalari
import uz.anncorp.smeta.core.fakt.qatorFaktKesimi
import uz.anncorp.smeta.core.fakt.uchlik
import uz.anncorp.smeta.core.fakt.ustamaOqi
import uz.anncorp.smeta.core.i18n.SiteI18n
import uz.anncorp.smeta.feature.common.Obj
import java.time.LocalDate
import java.util.UUID

/*
 * Fakt kiritish = the site's «Bajarilgan ishlar (Fakt)» journal (frontend/src/admin/sahifalar/FaktNative.tsx + FaktJurnal.tsx), same steps and same texts
 * (the site's own t() keys through SiteI18n). The sections panel + the journal table; entry cell "Bu fakt": «+» today (added) / «=» total, number, percent or
 * formula; Ctrl+S writes ONE package (fakt_yoz_v2, one operation id) - the same call as the site's sbFaktYoz. All rules are the ported lib/fakt-jurnal.
 * NOT ported yet (see docs/ilova/FAKT_PARITET.md): Fakt = F2, Fakt tiklash, Qamrov %, Egizaklarga yozish, Smetadan tashqari ish, Bajarilmaydi / Zamena / resurs amallari,
 * Xotiradan, Daraxt, UstaKutilmoqda, AI yordamchi, summaries (SummaJuft) - those rows stay red in the checklist.
 */

private const val BOLIMSIZ = -1L

private sealed interface FSatr { val key: String }
private class FBolim(val b: JurnalBolim, val nisbiy: Int) : FSatr { override val key = "bolim-${b.id}" }
private class FIsh(val ish: JurnalIsh) : FSatr { override val key = "q-${ish.id}" }
private class FResurs(val q: JurnalQator, val avto: Boolean) : FSatr { override val key = "q-${q.id}" }

private fun FSatr.qator(): JurnalQator? = when (this) { is FIsh -> ish.q; is FResurs -> q; is FBolim -> null }
private fun faktQoldaKiritiladimi(tur: String) = tur == "bl" || tur == "mat" || tur == "ob"

@Composable
fun FaktScreen(c: Ctx) {
    val o = c.obj
    if (o == null) { uz.anncorp.qurai.ui.components.QHint("Yuqoridan obyektni tanlang"); return }
    // The site shows «Fakt kiritish | Foto-dalil» as two tabs of ONE page; the title row carries the object buttons and the view tabs (Fakt jurnali | Xotiradan | Daraxt).
    var foto by remember(o.id) { mutableStateOf(false) }
    var korinish by remember(o.id) { mutableStateOf("tezkor") }
    var yangila by remember { mutableStateOf(0) }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FaktSahifaTablar(foto) { foto = it }
        if (foto) FotoScreen(c)
        else {
            FaktSarlavhaQatori(korinish, { korinish = it }, { yangila++ }, false)
            FaktJurnalScreen(c, o, korinish, yangila)
        }
    }
}

@Composable
private fun FaktJurnalScreen(c: Ctx, o: Obj, korinish: String, yangila: Int) {
    val lang = DesktopPrefs.lang
    fun tx(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var bump by remember { mutableStateOf(0) }
    val data = load(o.id, c.tick + bump + yangila) { c.sv.read("jurnal:${o.id}", { c.sv.api.bff("/api/obyekt-paket?obyekt_id=${o.id}") }, ::parseJurnalPaket) }
    // The object's markup context (site useUstamaliSumma): coefficients + podval + round svod. null after loading = unreadable -> markup shown as unknown.
    val ustamaYuk by produceState<Pair<Boolean, UstamaMalumot?>>(false to null, o.id, c.tick, bump, yangila) { value = true to runCatching { ustamaOqi(c.sv.api, c.place.companyId, o.id) }.getOrNull() }
    val ustama = ustamaYuk.second
    // The act register (site useQadamMalumot): the 8-step chain and the work month are read from it; unreadable = unknown, never "done".
    val aktlar by produceState<List<MarkazAkt>?>(null, o.id, c.tick, bump, yangila) { value = runCatching { parseAktReestri(c.sv.api.bff("/api/sb", "POST", aktReestriSoro(o.id)).body) }.getOrNull() }
    var oyTanlangan by remember(o.id) { mutableStateOf("") }
    // Not-done marks (site bajarilmadiRoyxatOl): per-row sums drive the journal model and which resources are taken out of the job.
    val bajYuk by produceState<List<BajarilmadiYozuv>?>(null, o.id, c.tick, bump, yangila) { value = runCatching { parseBajarilmadiRoyxat(c.sv.api.bff("/api/sb", "POST", bajarilmadiRoyxatSoro(c.place.companyId, o.id)).body) }.getOrNull() }
    val bajRoyxat = bajYuk.orEmpty()
    val bajHajm = remember(bajYuk) { bajarilmadiHajmlar(bajRoyxat) }
    var bajDialog by remember(o.id) { mutableStateOf<JurnalQator?>(null) }
    var tenglash by remember(o.id) { mutableStateOf<TenglashOyna?>(null) }
    var tenglashYuk by remember(o.id) { mutableStateOf(false) }
    var tiklash by remember(o.id) { mutableStateOf<List<TiklashSatr>?>(null) }
    var qamrovOyna by remember(o.id) { mutableStateOf<Pair<String, List<JurnalIsh>>?>(null) }
    var egizakOyna by remember(o.id) { mutableStateOf(false) }
    var abcRejim by remember(o.id) { mutableStateOf<AbcRejim?>(null) }
    var tahlilOchiq by remember(o.id) { mutableStateOf(false) }
    var klavOchiq by remember(o.id) { mutableStateOf(false) }
    var bolimTafsil by remember(o.id) { mutableStateOf(false) }
    var yopiqBolim by remember(o.id) { mutableStateOf<Set<Long>>(emptySet()) }
    var panelOchiq by remember(o.id) { mutableStateOf(true) }
    var faktsizF2 by remember(o.id) { mutableStateOf(false) }
    var faqatOzgarish by remember(o.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    var sana by remember(o.id) { mutableStateOf(LocalDate.now().toString()) }
    var qidiruv by remember(o.id) { mutableStateOf("") }
    var faqatQoldiq by remember(o.id) { mutableStateOf(false) }
    var holatFiltr by remember(o.id) { mutableStateOf(HolatFiltr.Hammasi) }
    var bolimId by remember(o.id) { mutableStateOf<Long?>(null) }
    var hammaYopiq by remember(o.id) { mutableStateOf(false) }
    var kiritmalar by remember(o.id) { mutableStateOf<Map<Long, Kiritma>>(emptyMap()) }
    var tarix by remember(o.id) { mutableStateOf<List<Map<Long, Kiritma>>>(emptyList()) }
    var kiritilganMuz by remember(o.id) { mutableStateOf<Set<Long>>(emptySet()) }
    var grid by remember(o.id) { mutableStateOf(GridState()) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<Pair<String, QTone>?>(null) }
    val find = remember { FocusRequester() }

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val d: JurnalMalumot? = data.valueOrNull()
        if (data == null) { QLoading(); return@Column }
        data.Banner()
        if (d == null) return@Column
        val model = remember(d, bajHajm) { jurnalQur(d.rows, d.states, null, bajHajm) }
        val holat = remember(d) { d.states.associateBy { it.qatorId } }
        val rowById = remember(d) { d.rows.associateBy { it.id } }
        val xulosa = remember(model) { jurnalXulosa(model.bolimlar, model.bolimIshlari) }
        // Section sums (smeta / F2 / fakt / F2 remainder) from the ported bolimSummalari; the markup comes from the object's podval (site SummaJuft).
        val chiqarilganlar = remember(d, bajHajm) { chiqarilganlarOl(d.rows, d.states, bajHajm) }
        val summalar = remember(d, chiqarilganlar, ustama?.svod) { bolimSummalari(d.rows, d.states, chiqarilganlar, ustama?.svod) }
        val bolalarOf = remember(model) { (model.bolimIshlari.values.flatten() + model.ildizIshlari).associate { it.id to (it.resurslar + it.avtomatik) } }
        val summaMatn = remember(d, model, ustama, ustamaYuk.first, chiqarilganlar, lang) {
            val kesh = HashMap<Long, String>()
            val f: (FSatr) -> String = fn@{ s ->
                val q = s.qator() ?: return@fn ""
                kesh.getOrPut(q.id) {
                    if (q.tur != "bl" && q.id in chiqarilganlar) return@getOrPut Tx.dash
                    val ts = qatorFaktKesimi(q, if (s is FIsh) bolalarOf[q.id].orEmpty() else emptyList(), holat, rowById) { it.id in chiqarilganlar }
                    if (ts == null) Tx.dash else uchlikJuft(ustama.uchlik(ts.fakt, ts.faktSumma), ustamaYuk.first, lang)
                }
            }
            f
        }
        val aktiv = bolimId ?: model.bolimlar.firstOrNull()?.id ?: if (model.ildizIshlari.isNotEmpty()) BOLIMSIZ else null
        val qq = qidiruv.trim().lowercase()

        fun mos(q: JurnalQator) = (q.kod ?: "").lowercase().contains(qq) || q.nom.lowercase().contains(qq)
        fun passResurs(q: JurnalQator) = (!faqatQoldiq || ochiqBor(q.qoldiq, q.smeta))
        val obyektBoyicha = qq.isNotEmpty() || faktsizF2 || faqatOzgarish
        fun ozgarishMi(q: JurnalQator) = q.zamena || q.qoshimcha || q.almashtiradi != null || (q.almashtirilgan ?: 0.0) > 0
        fun faktsizF2Mi(q: JurnalQator) = (holat[q.id]?.f2Hajm ?: 0.0) > 1e-9 && q.fakt <= 1e-9
        fun passIsh(i: JurnalIsh): Boolean {
            if (!holatFiltrMos(holatFiltr, i.id, i.q.holat, kiritilganMuz)) return false
            if (faktsizF2 && !(faktsizF2Mi(i.q) || i.resurslar.any(::faktsizF2Mi))) return false
            if (faqatOzgarish && !(ozgarishMi(i.q) || i.resurslar.any(::ozgarishMi) || i.avtomatik.any(::ozgarishMi))) return false
            if (faqatQoldiq && !(ochiqBor(i.q.qoldiq, i.q.smeta) || i.resurslar.any { passResurs(it) })) return false
            if (qq.isNotEmpty() && !(mos(i.q) || i.resurslar.any(::mos) || i.avtomatik.any(::mos))) return false
            return true
        }
        val satrlar = remember(model, aktiv, qq, faqatQoldiq, holatFiltr, hammaYopiq, kiritilganMuz, faktsizF2, faqatOzgarish) {
            val out = ArrayList<FSatr>()
            fun ishSatrlari(i: JurnalIsh) {
                out.add(FIsh(i))
                if (!hammaYopiq) {
                    for (r in i.resurslar) if (passResurs(r) && (qq.isEmpty() || mos(r) || mos(i.q))) out.add(FResurs(r, false))
                    for (r in i.avtomatik) if (qq.isEmpty() || mos(r) || mos(i.q)) out.add(FResurs(r, true))
                }
            }
            if (obyektBoyicha) {
                for (b in model.bolimlar) { val ls = model.bolimIshlari[b.id].orEmpty().filter(::passIsh); if (ls.isNotEmpty()) { out.add(FBolim(b, 0)); ls.forEach(::ishSatrlari) } }
                model.ildizIshlari.filter(::passIsh).forEach(::ishSatrlari)
            } else if (aktiv == BOLIMSIZ) model.ildizIshlari.filter(::passIsh).forEach(::ishSatrlari)
            else if (aktiv != null) for (bl in bolimTarkibi(aktiv, model.bolimlar, model.bolimIshlari)) {
                val ls = bl.ishlar.filter(::passIsh)
                if (bl.nisbiy > 0 && ls.isEmpty()) continue
                if (bl.nisbiy > 0) out.add(FBolim(bl.bolim, bl.nisbiy))   // the selected section's own header is the page header; inner sections get their in-table header + cards
                ls.forEach(::ishSatrlari)
            }
            out.toList()
        }
        val ishSoni = satrlar.count { it is FIsh }
        val faktlar = remember(d) { d.rows.associate { it.id to (holat[it.id]?.faktHajm ?: 0.0) } }
        val smetalar = remember(model) { (model.bolimIshlari.values.flatten() + model.ildizIshlari).flatMap { i -> listOf(i.q) + i.resurslar }.associate { it.id to it.smeta } }
        val konteksts = remember(model) { (model.bolimIshlari.values.flatten() + model.ildizIshlari).flatMap { i -> listOf(i.q) + i.resurslar }.associate { it.id to faktFormulaKonteksti(it) } }
        val paket = remember(kiritmalar, d) { jurnalPaket(kiritmalar.filterValues { it.qiymat.isNotBlank() }, faktlar, smetalar, konteksts) }
        val ozgarishSoni = kiritmalar.count { it.value.qiymat.isNotBlank() }

        fun qoy(k: Map<Long, Kiritma>, tarixgaYoz: Boolean = true) { if (tarixgaYoz) tarix = (tarix + listOf(kiritmalar)).takeLast(30); kiritmalar = k; msg = null }
        fun orqaga() { if (tarix.isNotEmpty()) { kiritmalar = tarix.last(); tarix = tarix.dropLast(1) } }
        fun foizChip(p: Int) {
            val yangi = kiritmalar.toMutableMap()
            for (s in satrlar) { val q = s.qator() ?: continue; if (s is FResurs && s.avto) continue; if (!faktQoldaKiritiladimi(q.tur) || (q.smeta ?: 0.0) == 0.0) continue; yangi[q.id] = Kiritma(Rejim.Teng, "$p%") }
            qoy(yangi)
        }
        /** "Fakt = F2": read the F2 prices / own fakt (a failed read must NOT open the dialog), build the plan with the ported faktF2Reja / obyektF2Reja. */
        fun tenglashOch(sarlavha: String, guruhlar: List<Pair<String, List<JurnalIsh>>>?, ishlar: List<JurnalIsh> = emptyList()) {
            if (tenglashYuk) return
            if (ozgarishSoni > 0) msg = tx("Saqlanmagan kiritmalar bor — qamrov serverdagi faktdan hisoblanadi; avval saqlang yoki tozalang.") to QTone.Warn
            tenglashYuk = true
            scope.launch {
                val m = tenglashManbaOqi(c.sv.api, o.id)
                tenglashYuk = false
                if (m == null) { msg = tx("F2 narxlari yuklanmadi — «Fakt = F2» ochilmadi. Qayta urinib ko‘ring.") to QTone.Danger; return@launch }
                val ktx = m.kontekst { id -> holat[id]?.smetaNarx ?: rowById[id]?.narx }
                tenglash = TenglashOyna(sarlavha, if (guruhlar != null) obyektF2Reja(guruhlar, holat, ktx) else faktF2Reja(ishlar, holat, null, ktx), m.manba.eskiAktlar)
            }
        }
        val bolimBolalari = model.bolimlar.filter { it.otaId != null }.groupBy({ it.otaId!! }, { it.id })
        /** Cancels the latest active "not done" mark of a row (site bajBekor): the same /api/sb-yoz amal bajarilmadi_bekor. */
        fun bajBekor(qatorId: Long) {
            val z = bajRoyxat.filter { it.qatorId == qatorId && it.holat == "faol" }.maxByOrNull { it.id } ?: return
            scope.launch {
                val r = c.sv.api.bff("/api/sb-yoz", "POST", bajarilmadiBekorPayload(c.place.companyId, z.id, UUID.randomUUID().toString()))
                val out = parseFaktResult(r.body)
                if (out?.ok == true) { msg = tx("Bajarilmaydi belgisi bekor qilindi") to QTone.Ok; bump++ }
                else msg = (if (r.networkError) Tx.offlineWrite else bajarilmadiXato(r.code, out?.error)) to QTone.Danger
            }
        }
        // ---- derived values of the page frame (chain, cards, material proposals) ----
        val oy = oyTanlangan.ifEmpty { faolOy(aktlar) ?: java.time.YearMonth.now().toString() }
        val markaz = remember(aktlar, oy) { markazHolati(aktlar, oy) }
        val daraxtdan = remember(d) { zanjirDaraxtdan(d.rows, d.states) }
        val zanjir = remember(markaz, oy, daraxtdan, o, lang) {
            zanjirHisobla(
                ZanjirKirish(
                    smetaBor = o.total != null, narxsiz = if (o.total != null) o.unpriced else null, faktSaqlangan = markaz.faktSaqlangan, faktQoralama = markaz.faktQoralama, f2BuOyda = markaz.f2BuOyda,
                    f2TasdiqBuOyda = markaz.f2TasdiqBuOyda, f2TasdiqJami = markaz.f2Tasdiq, f2OxirgiOy = markaz.f2OxirgiOy, smetaQator = daraxtdan.smetaQator, faktQamrov = daraxtdan.faktQamrov, faktHolatda = daraxtdan.faktHolatda, oy = oy,
                ),
            ) { k, p -> SiteI18n.t(k, lang, p) }
        }
        val yigindi = remember(d, bajYuk, ustama?.svod) { faktYigindiHisobla(d.rows, d.states, bajRoyxat, ustama?.svod) }
        val taklifRows = remember(d) { d.rows.mapIndexed { i, r -> TaklifQator(r.id, r.otaId, r.tur, i.toDouble(), r.qoshimcha, r.zamena) } }
        val keyingiMat = remember(taklifRows) { ishKeyingiMateriallari(taklifRows) }
        val matIshi = remember(keyingiMat) { buildMap<Long, Long> { for ((ish, ms) in keyingiMat) for (m in ms) put(m, ish) } }
        val jurnalById = remember(model) { (model.bolimIshlari.values.flatten() + model.ildizIshlari).flatMap { listOf(it.q) + it.resurslar + it.avtomatik }.associateBy { it.id } }
        fun samaraliFakt(q: JurnalQator): Double {
            val k = kiritmalar[q.id] ?: return q.fakt
            val n = (kiritmaSoni(k.qiymat, q.smeta, faktFormulaKonteksti(q)) as? KiritmaSoni.Num)?.value
            return if (n == null || !n.isFinite()) q.fakt else if (k.rejim == Rejim.Plus) q.fakt + n else n
        }
        /** A proposal for a material that follows its work (at the work's share; the replaced / not-done part is subtracted). */
        fun matTaklifi(matId: Long): Double? {
            val ish = jurnalById[matIshi[matId] ?: return null] ?: return null; val m = jurnalById[matId] ?: return null
            return materialTaklifi(samaraliFakt(ish), ish.smeta, m.smeta, m.fakt, (m.almashtirilgan ?: 0.0) + (m.bajarilmaydi ?: 0.0))
        }
        fun takliflarSoni(ishIdlar: List<Long>) = ishIdlar.sumOf { id -> keyingiMat[id].orEmpty().count { m -> kiritmalar[m]?.qiymat?.isBlank() != false && matTaklifi(m) != null } }
        /** Puts the proposals into the entry cells (nothing is written until the user saves: Ctrl+S). */
        fun materiallarniOl(ishIdlar: List<Long>) {
            val yangi = LinkedHashMap<Long, Kiritma>()
            for (id in ishIdlar) for (m in keyingiMat[id].orEmpty()) { if (kiritmalar[m]?.qiymat?.isNotBlank() == true) continue; matTaklifi(m)?.let { yangi[m] = Kiritma(Rejim.Plus, jsNumberString(it)) } }
            if (yangi.isEmpty()) { msg = tx("Olinadigan material taklifi yo‘q.") to QTone.Warn; return }
            qoy(kiritmalar + yangi); msg = tx("{n} ta material taklifi kiritildi — tekshirib saqlang (Ctrl+S).", mapOf("n" to yangi.size)) to QTone.Ok
        }
        fun filtrQoy(f: HolatFiltr) { holatFiltr = f; if (f == HolatFiltr.Kiritilgan) kiritilganMuz = kiritmalar.filterValues { it.qiymat.isNotBlank() }.keys }
        fun qamrovOch(sar: String, ishlar: List<JurnalIsh>) { if (ozgarishSoni > 0) msg = tx("Saqlanmagan kiritmalar bor — qamrov serverdagi faktdan hisoblanadi; avval saqlang yoki tozalang.") to QTone.Warn; qamrovOyna = sar to ishlar }
        fun tenglashObyekt() = tenglashOch(tx("Butun obyekt (barcha bo‘limlar)"), model.bolimlar.map { it.nom to model.bolimIshlari[it.id].orEmpty() } + (tx("Bo‘limsiz") to model.ildizIshlari))
        /** «Fakt tiklash»: evidence (approved + draft F2) -> row-by-row proposals; BOTH reads must succeed, otherwise the dialog is not opened. */
        fun tiklashOch() {
            if (tenglashYuk) return
            tenglashYuk = true
            scope.launch {
                val m = tenglashManbaOqi(c.sv.api, o.id); val q = tiklashQoralamaOqi(c.sv.api, o.id)
                tenglashYuk = false
                if (m == null) { msg = tx("F2 narxlari yuklanmadi — «Fakt = F2» ochilmadi. Qayta urinib ko‘ring.") to QTone.Danger; return@launch }
                if (q == null) { msg = tx("Qoralama F2 yuklanmadi — «Fakt tiklash» ochilmadi. Qayta urinib ko‘ring.") to QTone.Danger; return@launch }
                val guruhlar = model.bolimlar.map { it.nom to model.bolimIshlari[it.id].orEmpty() } + (tx("Bo‘limsiz") to model.ildizIshlari)
                val meta = ArrayList<TiklashMeta>(); val korildi = HashSet<Long>()
                for ((nom, ishlar) in guruhlar) for (ish in ishlar) for (x in listOf(ish.q) + ish.resurslar + ish.avtomatik) { if (korildi.add(x.id)) meta.add(TiklashMeta(x.id, x.tur, x.nom, x.birlik, rowById[x.id]?.kat ?: x.kat, nom)) }
                val narx: (Long) -> Double? = { id -> holat[id]?.smetaNarx ?: rowById[id]?.narx }
                tiklash = tiklashSatrlar(TiklashKontekst(obyektF2Reja(guruhlar, holat, m.kontekst(narx)), holat, meta, q.yigma, q.raqam, narx))
            }
        }
        /** One write of the entered package (fakt_yoz_v2, ONE operation id); true = written (also used by «Egizaklarga ham yozish» to save the source first). */
        suspend fun saqlaYoz(): Boolean {
            if (busy || ozgarishSoni == 0) return true
            if (!paket.ok) { msg = (if (paket.xatolar.isNotEmpty()) tx("{n} tasida xato — tuzating", mapOf("n" to paket.xatolar.size)) else tx("0 qo‘shilmaydi")) to QTone.Warn; return false }
            busy = true; msg = null
            val r = c.sv.api.bff("/api/sb-yoz", "POST", faktPayload(AMAL_FAKT, c.place.companyId, o.id, sana, paket.qatorlar.map { FaktLine(it.qatorId, it.hajm) }, UUID.randomUUID().toString()))
            val out = parseFaktResult(r.body)
            var ok = false
            msg = when {
                r.networkError -> Tx.offlineWrite to QTone.Danger
                out?.ok == true -> { ok = true; kiritmalar = emptyMap(); tarix = emptyList(); bump++; ("${out.raqam ?: ""} ${out.jami?.let { money(it) } ?: ""}".trim().ifEmpty { tx("saqlandi") }) to QTone.Ok }
                else -> (out?.error ?: r.code ?: "HTTP ${r.status}") to QTone.Danger
            }
            busy = false
            return ok
        }
        fun saqla() { scope.launch { saqlaYoz() } }

        Column(
            Modifier.fillMaxSize().onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) false else when {
                    e.isCtrlPressed && e.key == Key.S -> { saqla(); true }
                    e.isCtrlPressed && e.key == Key.Z && tarix.isNotEmpty() -> { orqaga(); true }
                    e.isShiftPressed && !e.isCtrlPressed && e.key == Key.F -> { if (model.bolimlar.isNotEmpty() || model.ildizIshlari.isNotEmpty()) tenglashObyekt(); true }
                    e.isCtrlPressed && e.key == Key.B -> { satrlar.firstOrNull { it.key == grid.active }?.qator()?.let { bajDialog = it }; true }
                    e.isCtrlPressed && e.key == Key.F -> { runCatching { find.requestFocus() }; true }
                    e.isAltPressed && e.key in listOf(Key.One, Key.Two, Key.Three, Key.Four) -> { HolatFiltr.entries.getOrNull(listOf(Key.One, Key.Two, Key.Three, Key.Four).indexOf(e.key))?.let { filtrQoy(it) }; true }
                    else -> false
                }
            },
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // ---- the 8-step work chain ----
                ZanjirQatori(zanjir, oy, aktlar != null)
                if (korinish == "tezkor") {
                    // ---- filter panel (the site's first section) ----
                    FlowRow(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        QDateField(sana, { sana = it }, label = tx("Sana"), modifier = Modifier.width(170.dp))
                        QInput(qidiruv, { qidiruv = it }, Modifier.width(320.dp).focusRequester(find), placeholder = tx("Butun obyekt bo‘yicha qidirish…  ( / )"), leading = QIcons.Search)
                        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(faqatQoldiq, { faqatQoldiq = it }); Text(tx("faqat bajarilmaganlar"), style = Q.type.bodySmall, color = Q.colors.textDim) }
                        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(faktsizF2, { faktsizF2 = it }); Text(tx("fakti yo‘q, F2 olingan"), style = Q.type.bodySmall, color = Q.colors.textDim) }
                        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(faqatOzgarish, { faqatOzgarish = it }); Text(tx("Faqat zamena va qo‘shimchalar"), style = Q.type.bodySmall, color = Q.colors.textDim) }
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            HolatFiltr.entries.forEach { f -> QButton(tx(f.nom), { filtrQoy(f) }, kind = if (holatFiltr == f) QButtonKind.Primary else QButtonKind.Ghost) }
                        }
                        QButton(tx("Klaviatura") + " ?", { klavOchiq = true }, kind = QButtonKind.Ghost)
                        val tanlanganB = model.bolimlar.firstOrNull { it.id == aktiv }
                        if (tanlanganB != null) QButton(tx("Fakt = F2") + " [F]", { tenglashOch(tanlanganB.nom, null, bolimIshlariYigish(tanlanganB.id, model.bolimIshlari, bolimBolalari, true)) }, kind = QButtonKind.Secondary, enabled = !tenglashYuk)
                        if (model.bolimlar.isNotEmpty() || model.ildizIshlari.isNotEmpty()) QButton(tx("Fakt = F2: obyekt") + " [Shift+F]", { tenglashObyekt() }, kind = QButtonKind.Secondary, enabled = !tenglashYuk)
                        if (model.bolimlar.isNotEmpty() || model.ildizIshlari.isNotEmpty()) QButton(tx("Fakt tiklash"), { tiklashOch() }, kind = QButtonKind.Secondary, enabled = !tenglashYuk)
                        if (tanlanganB != null && qq.isEmpty()) QButton(tx("Qamrov %") + " [%]", { qamrovOch(tanlanganB.nom, bolimIshlariYigish(tanlanganB.id, model.bolimIshlari, bolimBolalari, true)) }, kind = QButtonKind.Secondary)
                        QButton(tx("Egizaklarga ham yozish"), { egizakOyna = true }, kind = QButtonKind.Secondary)
                        QButton(tx("Smetadan tashqari ish"), { abcRejim = AbcRejim.Additional(if (aktiv == BOLIMSIZ) null else aktiv) }, kind = QButtonKind.Secondary, icon = QIcons.Plus)
                    }
                    // ---- «Bajarilish tahlili» (collapsible) ----
                    if (model.bolimlar.isNotEmpty()) Column(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Text((if (tahlilOchiq) "▾ " else "▸ ") + tx("Bajarilish tahlili"), Modifier.clickable { tahlilOchiq = !tahlilOchiq }, style = Q.type.bodySmall, color = Q.colors.textDim)
                        if (tahlilOchiq) { val th = remember(d, bajHajm, ustama?.svod) { bajarilishTahlili(d, bajHajm, ustama?.svod) }; FaktXulosaPanel(th.xulosa, th.obyekt) }
                    }
                }
                msg?.let { QNote(it.first, tone = it.second) }
                tenglash?.let { oy2 ->
                    FaktTenglashDialog(c, o.id, sana, oy2.sarlavha, oy2.reja, oy2.eskiAktlar, ustama, ustamaYuk.first, { tenglash = null }) { tenglash = null; msg = tx("Fakt = F2") + " ✓" to QTone.Ok; bump++ }
                }
                tiklash?.let { ts ->
                    FaktTiklashDialog(c, o.id, sana, o.nom, ts, summalar[0L]?.fakt, summalar[0L]?.f2, ustama, ustamaYuk.first, { tiklash = null }) { tiklash = null; msg = tx("Fakt tiklash") + " ✓" to QTone.Ok; bump++ }
                }
                qamrovOyna?.let { (sar, ishlar) ->
                    FaktQamrovDialog(c, o.id, sana, sar, ishlar, holat, { id -> holat[id]?.smetaNarx ?: rowById[id]?.narx }, ustama, ustamaYuk.first, { qamrovOyna = null }, { bump++ }) { m -> msg = m to QTone.Ok }
                }
                if (egizakOyna) FaktEgizakDialog(
                    c, o.id, o.nom, sana, c.objects, kiritmalar.filterValues { it.qiymat.isNotBlank() }, model.bolimlar.firstOrNull { it.id == aktiv }?.nom,
                    faktdanKiritmalar(model.bolimlar.firstOrNull { it.id == aktiv }?.let { b -> bolimIshlariYigish(b.id, model.bolimIshlari, bolimBolalari, true).flatMap { listOf(it.q) + it.resurslar } }.orEmpty()),
                    faktdanKiritmalar((model.bolimIshlari.values.flatten() + model.ildizIshlari).flatMap { listOf(it.q) + it.resurslar }),
                    { if (ozgarishSoni > 0) saqlaYoz() else true }, { egizakOyna = false }, { egizakOyna = false; bump++ },
                )
                abcRejim?.let { r -> FaktIshAbcDialog(c, o.id, sana, d, r, { abcRejim = null }, { m -> abcRejim = null; msg = m to QTone.Ok; bump++ }) }
                if (klavOchiq) KlaviaturaYordam { klavOchiq = false }
                bajDialog?.let { q -> BajarilmadiDialog(c, o.id, sana, q, bajHajm[q.id] ?: 0.0, ::tx, { bajDialog = null }) { m -> bajDialog = null; msg = m to QTone.Ok; bump++ } }

                if (korinish == "xotira") Box(Modifier.fillMaxWidth().height(780.dp)) { FaktXotiradanScreen(c, o.id, d) { bump++ } }
                else if (korinish == "daraxt") Box(Modifier.fillMaxWidth().height(780.dp)) { FaktDaraxtScreen(c, o.id, d) { bump++ } }
                else {
                    // ---- object summary cards ----
                    FaktKartalar(yigindi, summalar[0L], ustama, ustamaYuk.first, oy, { oyTanlangan = it }, { m -> oyTanlangan = m; ModNav.go?.invoke("f2") }, { abcRejim = AbcRejim.Additional(null) })
                    // ---- sections tree | journal ----
                    Row(Modifier.fillMaxWidth().height(700.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!panelOchiq) Box(Modifier.width(44.dp).fillMaxHeight().background(Q.colors.surface, Q.shape.medium).clickable { panelOchiq = true }.padding(top = 12.dp), contentAlignment = Alignment.TopCenter) {
                            Text("▶", style = Q.type.bodyMedium, color = Q.colors.textDim)
                        } else BolimDaraxtiPanel(
                            model.bolimlar, aktiv.takeIf { qq.isEmpty() && !obyektBoyicha }, model.ildizIshlari.size, aktiv == BOLIMSIZ && qq.isEmpty() && !obyektBoyicha, xulosa.bolimTugagan, xulosa.bolimJami, yopiqBolim,
                            { id -> yopiqBolim = if (id in yopiqBolim) yopiqBolim - id else yopiqBolim + id }, { id -> bolimId = id; qidiruv = "" }, { bolimId = BOLIMSIZ; qidiruv = "" }, Modifier.width(272.dp).fillMaxHeight(), { panelOchiq = false },
                        )
                        // ---- journal ----
                        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            val tanlangan = model.bolimlar.firstOrNull { it.id == aktiv }
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Column(Modifier.weight(1f)) {
                                    Text(if (qq.isNotEmpty()) tx("Qidiruv: «{q}»", mapOf("q" to qidiruv.trim())) else tanlangan?.nom ?: tx("Bo‘limsiz"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                    Text(tx("{n} ish · {q} qator", mapOf("n" to ishSoni, "q" to satrlar.count { it !is FBolim })), style = Q.type.labelSmall, color = Q.colors.textMute)
                                    if (qq.isEmpty() && tanlangan != null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(tx("{a} / {b} ish bajarilgan", mapOf("a" to tanlangan.tugaganSoni, "b" to tanlangan.ishSoni)), style = Q.type.bodySmall, color = Q.colors.textDim)
                                        Text(foizBelgi(tanlangan.ulush), style = Q.type.bodySmall, color = Q.colors.textDim, fontWeight = FontWeight.SemiBold)
                                        Box(Modifier.width(180.dp)) { Meter(tanlangan.ulush) }
                                    }
                                    if (qq.isEmpty() && tanlangan != null) Text((if (bolimTafsil) "▾ " else "▸ ") + tx("Bo‘lim summalari"), Modifier.clickable { bolimTafsil = !bolimTafsil }, style = Q.type.labelSmall, color = Q.colors.textMute)
                                }
                                if (ishSoni > 0) {
                                    Text(tx("Jami %:"), style = Q.type.labelSmall, color = Q.colors.textMute)
                                    listOf(25, 50, 75, 100).forEach { p -> QButton("$p%", { foizChip(p) }, kind = QButtonKind.Secondary) }
                                }
                                val bolimMat = satrlar.filterIsInstance<FIsh>().map { it.ish.id }
                                val bolimTakliflar = takliflarSoni(bolimMat)
                                if (bolimTakliflar > 0) QButton(tx("Bo‘lim: materiallarni ham olish ({n})", mapOf("n" to bolimTakliflar)), { materiallarniOl(bolimMat) }, kind = QButtonKind.Secondary)
                                QButton(if (hammaYopiq) tx("Hammasini ochish") else tx("Hammasini yopish"), { hammaYopiq = !hammaYopiq }, kind = QButtonKind.Ghost, icon = if (hammaYopiq) QIcons.ChevronRight else QIcons.ChevronDown)
                            }
                            if (bolimTafsil && qq.isEmpty() && tanlangan != null) BolimSummaQatori(summalar[tanlangan.id], ustama, ustamaYuk.first, ::tx, lang)
                            MeterLegenda()
                            if (satrlar.isEmpty()) Text(if (qq.isNotEmpty() || holatFiltr != HolatFiltr.Hammasi || faqatQoldiq || faktsizF2 || faqatOzgarish) tx("Hech narsa topilmadi.") else tx("Bu bo‘limda (ichki bo‘limlari bilan) ish yo‘q."), style = Q.type.bodyMedium, color = Q.colors.textMute)
                            else FaktGrid(
                                satrlar, kiritmalar, paket.xatolar.keys, holat, rowById, grid, { grid = it }, ::tx, lang, summaMatn, bajHajm, { bajDialog = it }, ::bajBekor, { ish -> tenglashOch(ish.q.nom, null, listOf(ish)) },
                                { b -> 138.dp to { BolimBlokSarlavha(b.b, b.nisbiy, summalar[b.b.id], ustama, ustamaYuk.first, { bolimId = b.b.id; qidiruv = "" }) { qamrovOch(b.b.nom, bolimIshlariYigish(b.b.id, model.bolimIshlari, bolimBolalari, true)) } } },
                                Modifier.weight(1f).fillMaxWidth(), { id, k -> qoy(if (k == null || k.qiymat.isBlank()) kiritmalar - id else kiritmalar + (id to k)) }, { msg = tx("Bu qatorga fakt qo‘lda kiritilmaydi (avtomatik).") to QTone.Info },
                            )
                        }
                    }
                }
            }
            // ---- save panel (SaqlashPaneli) ----
            Row(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                QButton(tx("Saqlash") + " (Ctrl+S)", { saqla() }, kind = QButtonKind.Primary, enabled = ozgarishSoni > 0 && !busy && paket.ok, loading = busy, icon = QIcons.Check)
                if (tarix.isNotEmpty()) QButton(tx("Orqaga") + " (Ctrl+Z)", { orqaga() }, kind = QButtonKind.Ghost)
                Text("$ozgarishSoni", style = Q.type.bodySmall, color = Q.colors.textMute)
                if (paket.xatolar.isNotEmpty()) Text(tx("{n} tasida xato — tuzating", mapOf("n" to paket.xatolar.size)), style = Q.type.bodySmall, color = Q.colors.warn)
                Text(tx("sana: {s}", mapOf("s" to sana)), style = Q.type.bodySmall, color = Q.colors.textMute)
            }
        }
    }
}

/** The completion bar of a section / work (smeta = 100 %). */
@Composable
internal fun Meter(ulush: Double?) {
    val f = (ulush ?: 0.0).coerceIn(0.0, 1.0).toFloat()
    Box(Modifier.fillMaxWidth().height(4.dp).background(Q.colors.surface3, Q.shape.small)) { Box(Modifier.fillMaxWidth(f).fillMaxHeight().background(if ((ulush ?: 0.0) >= 1.0) Q.colors.ok else Q.colors.accent, Q.shape.small)) }
}

@Composable
private fun FaktGrid(
    satrlar: List<FSatr>, kiritmalar: Map<Long, Kiritma>, xatoIds: Set<Long>, holat: Map<Long, uz.anncorp.smeta.core.fakt.JurnalHolat>,
    rowById: Map<Long, uz.anncorp.smeta.core.fakt.T2Qator>, state: GridState, onState: (GridState) -> Unit, tx: (String, Map<String, Any>) -> String, lang: String, summaMatn: (FSatr) -> String, bajHajm: Map<Long, Double>, onBajOch: (JurnalQator) -> Unit, onBajBekor: (Long) -> Unit, onTenglash: (JurnalIsh) -> Unit, bolimBlok: (FBolim) -> Pair<androidx.compose.ui.unit.Dp, @Composable () -> Unit>, modifier: Modifier,
    onKiritma: (Long, Kiritma?) -> Unit, onNotAllowed: () -> Unit,
) {
    fun t(k: String) = tx(k, emptyMap())
    fun narx(q: JurnalQator): Double? = rowById[q.id]?.narx
    val cols = remember(lang, summaMatn, bajHajm) {
        listOf(
            GridCol<FSatr>("kod", t("Kod"), 90f, mono = true) { s -> when (s) { is FBolim -> ""; else -> s.qator()?.kod ?: "" } },
            GridCol("nom", t("Nomi"), 260f) { s -> when (s) { is FBolim -> " ".repeat(s.nisbiy) + s.b.nom; is FIsh -> s.ish.q.nom + (if (s.ish.q.zamena) " · " + t("zamena") else if (s.ish.q.qoshimcha) " · " + t("qo‘shimcha") else ""); is FResurs -> " " + s.q.nom + (if (s.avto) " · " + t("avto") else "") } },
            GridCol("tur", t("Kat / tur"), 70f) { s -> when (s) { is FBolim -> ""; is FIsh -> t("ISH"); is FResurs -> s.q.kat ?: s.q.tur.uppercase() } },
            GridCol("holat", t("Holat"), 150f) { s -> s.qator()?.let { t(HOLAT_MUHR.getValue(it.holat)) + (bajHajm[it.id]?.takeIf { b -> b > 0 }?.let { b -> " · " + t("Bajarilmaydi") + " " + qty(b) } ?: "") } ?: "" },
            GridCol("hajm", t("Smeta hajmi"), 80f, numeric = true) { s -> s.qator()?.let { qty(it.smeta) } ?: "" },
            GridCol("birlik", t("Birlik"), 50f) { s -> s.qator()?.birlik?.let { uz.anncorp.smeta.core.data.displayUnit(it) } ?: "" },
            GridCol("narx", t("Birlik narxi"), 90f, numeric = true) { s -> s.qator()?.let { q -> narx(q)?.let { money(it) } ?: "" } ?: "" },
            GridCol("foiz", t("Bajarilish foizi"), 70f, numeric = true) { s -> s.qator()?.let { q -> foizMatn(faktMeter(q.smeta, q.fakt, holat[q.id]?.f2Hajm).foiz) } ?: "" },
            GridCol("fakt", t("Fakt hajm"), 80f, numeric = true) { s -> s.qator()?.let { qty(it.fakt) } ?: "" },
            GridCol("f2", t("F2 hajmi"), 80f, numeric = true) { s -> s.qator()?.let { q -> holat[q.id]?.f2Hajm?.let { qty(it) } ?: "" } ?: "" },
            GridCol("kiritma", t("Bu fakt"), 100f, numeric = true, editable = true) { s -> s.qator()?.let { kiritmalar[it.id]?.qiymat } ?: "" },
            GridCol("rejim", "+ / =", 40f) { s -> s.qator()?.let { q -> kiritmalar[q.id]?.rejim?.belgi?.toString() ?: "" } ?: "" },
            GridCol("ochiq", t("Ochiq qoldiq"), 90f, numeric = true) { s -> s.qator()?.let { qty(it.qoldiq) } ?: "" },
            GridCol("f2m", t("F2 ga olish mumkin"), 90f, numeric = true) { s -> s.qator()?.let { q -> holat[q.id]?.f2MumkinHajm?.let { qty(it) } ?: "" } ?: "" },
            GridCol("summa", t("Fakt summasi") + " (" + t("ustamali · ustamasiz") + ")", 210f, numeric = true) { s -> summaMatn(s) },
        )
    }
    val actions = listOf(
        GridAction<FSatr>("Rejim «+» (bugun)") { rows -> rows.forEach { s -> s.qator()?.let { q -> kiritmalar[q.id]?.let { onKiritma(q.id, it.copy(rejim = Rejim.Plus)) } } } },
        GridAction<FSatr>("Rejim «=» (jami)") { rows -> rows.forEach { s -> s.qator()?.let { q -> kiritmalar[q.id]?.let { onKiritma(q.id, it.copy(rejim = Rejim.Teng)) } } } },
        GridAction<FSatr>(t("Bajarilmaydi / qilib bo‘lmaydi")) { rows -> rows.firstNotNullOfOrNull { it.qator() }?.let(onBajOch) },
        GridAction<FSatr>(t("Bajarilmaydi deb belgilangan hajm (bosing - bekor qilish)"), enabled = { rows -> rows.any { s -> s.qator()?.let { (bajHajm[it.id] ?: 0.0) > 0 } == true } }) { rows -> rows.firstNotNullOfOrNull { s -> s.qator()?.takeIf { (bajHajm[it.id] ?: 0.0) > 0 } }?.let { onBajBekor(it.id) } },
        GridAction<FSatr>(t("Fakt ni F2 ga tenglash") + " (=F2)", enabled = { rows -> rows.any { s -> s is FIsh && (holat[s.ish.id]?.f2Hajm ?: 0.0) - s.ish.q.fakt > 1e-9 } }) { rows -> rows.firstNotNullOfOrNull { s -> (s as? FIsh)?.ish?.takeIf { (holat[it.id]?.f2Hajm ?: 0.0) - it.q.fakt > 1e-9 } }?.let(onTenglash) },
        GridAction<FSatr>("Kiritilgan (saqlanmagan) qiymatni o‘chirish") { rows -> rows.forEach { s -> s.qator()?.let { q -> onKiritma(q.id, null) } } },
    )
    DataGrid(
        satrlar, cols, key = { it.key }, state = state, onState = onState, modifier = modifier, cellsKey = listOf(kiritmalar, xatoIds, lang, summaMatn),
        rowTone = { s -> if (s is FBolim) QTone.Info else null },
        cellMark = { s, col -> val q = s.qator(); if (q == null || col.id != "kiritma") CellMark.None else if (q.id in xatoIds) CellMark.Invalid else if (kiritmalar[q.id]?.qiymat?.isNotBlank() == true) CellMark.Changed else CellMark.None },
        onEdit = { s, col, text ->
            val q = s.qator()
            if (col.id == "kiritma") {
                if (q == null || (s is FResurs && s.avto) || !faktQoldaKiritiladimi(q.tur)) onNotAllowed()
                else onKiritma(q.id, Kiritma(kiritmalar[q.id]?.rejim ?: Rejim.Plus, text))
            }
        },
        actions = actions, empty = t("Hech narsa topilmadi."),
        groups = listOf(GridGroup(t("Ish / resurs"), t("holat · belgilar"), listOf("kod", "nom", "tur", "holat")), GridGroup(t("Smeta"), t("hajm · birlik narxi"), listOf("hajm", "birlik", "narx"), true), GridGroup(t("Bajarilish"), t("fakt va F2, smetaga nisbatan"), listOf("foiz", "fakt", "f2")), GridGroup(t("Bu fakt"), t("+ bugun · = jami"), listOf("kiritma", "rejim"), true), GridGroup(t("Ochiq qoldiq"), t("smeta − fakt"), listOf("ochiq"), true), GridGroup(t("F2 ga olish mumkin"), t("fakt − F2"), listOf("f2m"), true), GridGroup(t("Fakt summasi"), t("ustamali · ustamasiz"), listOf("summa"), true)),
        fullRow = { s -> if (s is FBolim) bolimBlok(s) else null },
    )
}

/** One cell/pair text of the value triple, like the site's SummaJuft in the table (`ustamali · ustamasiz`): the markup total is MAIN, direct cost beside it; unknown is a dash / the reason, never 0. */
private fun uchlikJuft(q: QiymatUchlik, tayyor: Boolean, lang: String): String {
    fun tx(k: String) = SiteI18n.t(k, lang)
    val us = q.ustamasiz ?: return Tx.dash
    val ustamali = when {
        q.ustamali != null -> (if (q.taxminiy) "≈ " else "") + money(q.ustamali)
        !tayyor -> tx("Hisoblanmoqda…")
        else -> tx("ustamali noma’lum")
    }
    return ustamali + " · " + money(us)
}

/** The section's four sums (Smeta / F2 / Fakt / F2 qoldiq), each as the site's value triple: VAT-inclusive main, markup total (no VAT) and direct cost under it. */
@Composable
private fun BolimSummaQatori(s: uz.anncorp.smeta.core.fakt.BolimSumma?, ustama: UstamaMalumot?, tayyor: Boolean, tx: (String, Map<String, Any>) -> String, lang: String) {
    if (s == null) return
    fun t(k: String) = tx(k, emptyMap())
    FlowRow(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(t("Smeta") to s.smeta, t("F2") to s.f2, t("Fakt") to s.fakt, t("F2 qoldiq") to s.qoldiq).forEach { (nom, k) -> SummaUchlik(nom, k, ustama, tayyor, { key: String -> tx(key, emptyMap()) }) }
        if (s.f2Narxda > 0) Text(tx("fakt summasi tasdiqlangan F2 narxida: {n} ta pozitsiya (fakt hajmi o‘zgarmaydi)", mapOf("n" to s.f2Narxda)), style = Q.type.labelSmall, color = Q.colors.textMute)
    }
}

@Composable
internal fun SummaUchlik(nom: String, k: SummaKesim, ustama: UstamaMalumot?, tayyor: Boolean, t: (String) -> String) {
    val q = remember(k, ustama) { ustama.uchlik(k.kesim, k.ustamasiz) }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
            Text(nom.uppercase(), style = Q.type.labelSmall, color = Q.colors.textMute, fontWeight = FontWeight.SemiBold)
            Text(t("QQS bilan"), style = Q.type.labelSmall, color = Q.colors.textMute)
            Text(if (q.qqsBilan != null) (if (q.taxminiy) "≈ " else "") + money(q.qqsBilan) else if (!tayyor) t("Hisoblanmoqda…") else Tx.dash, style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
        }
        Text(t("ustamali, QQS siz") + ": " + (q.ustamali?.let { money(it) } ?: Tx.dash), style = Q.type.labelSmall, color = Q.colors.textDim)
        Text(t("to‘g‘ri xarajat (ustamasiz)") + ": " + (q.ustamasiz?.let { money(it) } ?: Tx.dash), style = Q.type.labelSmall, color = Q.colors.textDim)
    }
}

/** Site FaktBajarilmadiTez: "this volume will not be done" with a reason (the estimate row never changes). An empty volume = the whole open remainder (server rule). */
@Composable
private fun BajarilmadiDialog(c: Ctx, obyektId: Long, sana: String, q: JurnalQator, belgilangan: Double, tx: (String, Map<String, Any>) -> String, onYop: () -> Unit, onSaqlandi: (String) -> Unit) {
    fun t(k: String) = tx(k, emptyMap())
    val taklif = bajarilmadiTaklif(q.smeta, q.fakt, belgilangan, q.almashtirilgan)
    var hajm by remember(q.id) { mutableStateOf(if (taklif != null && taklif > 0) uz.anncorp.smeta.core.data.formatVolume(taklif).replace(" ", "") else "") }
    var sabab by remember(q.id) { mutableStateOf(BAJARILMADI_SABABLAR.first { it.kod == "texnik_sabab" }) }
    var izoh by remember(q.id) { mutableStateOf("") }
    var band by remember(q.id) { mutableStateOf(false) }
    var xato by remember(q.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val op = remember(q.id) { UUID.randomUUID().toString() }
    fun yubor() {
        if (band) return
        val n = hajm.trim().takeIf { it.isNotEmpty() }?.replace(',', '.')?.toDoubleOrNull()
        if (hajm.isNotBlank() && (n == null || !n.isFinite() || n <= 0)) { xato = t("Hajm musbat son bo‘lishi kerak"); return }
        if (hajm.isBlank() && taklif == null) { xato = t("Smeta hajmi noma’lum - bajarilmagan hajmni yozing."); return }
        if (sabab.kod == "boshqa" && izoh.isBlank()) { xato = t(bajarilmadiXato("SABAB_IZOH_MAJBURIY")); return }
        band = true; xato = ""
        scope.launch {
            val r = c.sv.api.bff("/api/sb-yoz", "POST", bajarilmadiBelgilaPayload(c.place.companyId, obyektId, q.id, n, sabab.kod, izoh.trim(), sana, op))
            val out = parseFaktResult(r.body)
            if (out?.ok == true) onSaqlandi(t("Bajarilmaydi deb belgilandi (smeta o‘zgarmadi).")) else { xato = if (r.networkError) Tx.offlineWrite else t(bajarilmadiXato(r.code, out?.error)); band = false }
        }
    }
    QDialog(t("Bajarilmaydi / qilib bo‘lmaydi"), onYop, confirm = if (band) t("Saqlanmoqda…") else t("Bajarilmaydi deb belgilash"), onConfirm = ::yubor, confirmEnabled = !band, dismissText = t("Bekor")) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text((q.kod?.let { "$it " } ?: "") + q.nom, style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 2)
            Text(t("Smeta") + ": " + qty(q.smeta) + " · " + t("fakt") + ": " + qty(q.fakt) + " · " + t("allaqachon belgilangan") + ": " + qty(belgilangan) + " " + (q.birlik ?: ""), style = Q.type.labelSmall, color = Q.colors.textMute)
            QInput(hajm, { hajm = it }, Modifier.fillMaxWidth(), label = t("Bajarilmagan hajm") + " (" + (q.birlik ?: "—") + ")")
            QSelect(sabab, BAJARILMADI_SABABLAR, { t(it.nom) }, { sabab = it }, placeholder = t("Sabab"), minWidth = 280)
            QInput(izoh, { izoh = it }, Modifier.fillMaxWidth(), label = t("Izoh") + if (sabab.kod == "boshqa") " *" else "")
            if (xato.isNotEmpty()) Text(xato, style = Q.type.bodySmall, color = Q.colors.danger)
        }
    }
}

private class TenglashOyna(val sarlavha: String, val reja: TenglashReja, val eskiAktlar: List<EskiF2Akt>)
