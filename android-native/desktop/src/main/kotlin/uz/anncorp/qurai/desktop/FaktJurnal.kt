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
    FaktJurnalScreen(c, o)
}

@Composable
private fun FaktJurnalScreen(c: Ctx, o: Obj) {
    val lang = DesktopPrefs.lang
    fun tx(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var bump by remember { mutableStateOf(0) }
    val data = load(o.id, c.tick + bump) { c.sv.read("jurnal:${o.id}", { c.sv.api.bff("/api/obyekt-paket?obyekt_id=${o.id}") }, ::parseJurnalPaket) }
    // The object's markup context (site useUstamaliSumma): coefficients + podval + round svod. null after loading = unreadable -> markup shown as unknown.
    val ustamaYuk by produceState<Pair<Boolean, UstamaMalumot?>>(false to null, o.id, c.tick, bump) { value = true to runCatching { ustamaOqi(c.sv.api, c.place.companyId, o.id) }.getOrNull() }
    val ustama = ustamaYuk.second
    // Not-done marks (site bajarilmadiRoyxatOl): per-row sums drive the journal model and which resources are taken out of the job.
    val bajYuk by produceState<List<BajarilmadiYozuv>?>(null, o.id, c.tick, bump) { value = runCatching { parseBajarilmadiRoyxat(c.sv.api.bff("/api/sb", "POST", bajarilmadiRoyxatSoro(c.place.companyId, o.id)).body) }.getOrNull() }
    val bajRoyxat = bajYuk.orEmpty()
    val bajHajm = remember(bajYuk) { bajarilmadiHajmlar(bajRoyxat) }
    var bajDialog by remember(o.id) { mutableStateOf<JurnalQator?>(null) }
    var tenglash by remember(o.id) { mutableStateOf<TenglashOyna?>(null) }
    var tenglashYuk by remember(o.id) { mutableStateOf(false) }
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

    Page(tx("Bajarilgan ishlar (Fakt)"), tx("Smeta hajmi va Faktni RZ → BL → RS/MAT/OB daraxtida boshqaring")) {
        val d: JurnalMalumot? = data.valueOrNull()
        if (data == null) { QLoading(); return@Page }
        data.Banner()
        if (d == null) return@Page
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
        fun passIsh(i: JurnalIsh): Boolean {
            if (!holatFiltrMos(holatFiltr, i.id, i.q.holat, kiritilganMuz)) return false
            if (faqatQoldiq && !(ochiqBor(i.q.qoldiq, i.q.smeta) || i.resurslar.any { passResurs(it) })) return false
            if (qq.isNotEmpty() && !(mos(i.q) || i.resurslar.any(::mos) || i.avtomatik.any(::mos))) return false
            return true
        }
        val satrlar = remember(model, aktiv, qq, faqatQoldiq, holatFiltr, hammaYopiq, kiritilganMuz) {
            val out = ArrayList<FSatr>()
            fun ishSatrlari(i: JurnalIsh) {
                out.add(FIsh(i))
                if (!hammaYopiq) {
                    for (r in i.resurslar) if (passResurs(r) && (qq.isEmpty() || mos(r) || mos(i.q))) out.add(FResurs(r, false))
                    for (r in i.avtomatik) if (qq.isEmpty() || mos(r) || mos(i.q)) out.add(FResurs(r, true))
                }
            }
            if (qq.isNotEmpty()) {
                for (b in model.bolimlar) { val ls = model.bolimIshlari[b.id].orEmpty().filter(::passIsh); if (ls.isNotEmpty()) { out.add(FBolim(b, 0)); ls.forEach(::ishSatrlari) } }
                model.ildizIshlari.filter(::passIsh).forEach(::ishSatrlari)
            } else if (aktiv == BOLIMSIZ) model.ildizIshlari.filter(::passIsh).forEach(::ishSatrlari)
            else if (aktiv != null) for (bl in bolimTarkibi(aktiv, model.bolimlar, model.bolimIshlari)) {
                val ls = bl.ishlar.filter(::passIsh)
                if (bl.nisbiy > 0 && ls.isEmpty()) continue
                out.add(FBolim(bl.bolim, bl.nisbiy)); ls.forEach(::ishSatrlari)
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
        fun saqla() {
            if (busy || ozgarishSoni == 0) return
            if (!paket.ok) { msg = (if (paket.xatolar.isNotEmpty()) tx("{n} tasida xato — tuzating", mapOf("n" to paket.xatolar.size)) else tx("0 qo‘shilmaydi")) to QTone.Warn; return }
            busy = true; msg = null
            scope.launch {
                val r = c.sv.api.bff("/api/sb-yoz", "POST", faktPayload(AMAL_FAKT, c.place.companyId, o.id, sana, paket.qatorlar.map { FaktLine(it.qatorId, it.hajm) }, UUID.randomUUID().toString()))
                val out = parseFaktResult(r.body)
                msg = when {
                    r.networkError -> Tx.offlineWrite to QTone.Danger
                    out?.ok == true -> { kiritmalar = emptyMap(); tarix = emptyList(); bump++; ("${out.raqam ?: ""} ${out.jami?.let { money(it) } ?: ""}".trim().ifEmpty { tx("saqlandi") }) to QTone.Ok }
                    else -> (out?.error ?: r.code ?: "HTTP ${r.status}") to QTone.Danger
                }
                busy = false
            }
        }

        Column(
            Modifier.fillMaxSize().onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) false else when {
                    e.isCtrlPressed && e.key == Key.S -> { saqla(); true }
                    e.isCtrlPressed && e.key == Key.Z && tarix.isNotEmpty() -> { orqaga(); true }
                    e.isShiftPressed && !e.isCtrlPressed && e.key == Key.F -> { if (model.bolimlar.isNotEmpty() || model.ildizIshlari.isNotEmpty()) tenglashOch(tx("Butun obyekt (barcha bo‘limlar)"), model.bolimlar.map { it.nom to model.bolimIshlari[it.id].orEmpty() } + (tx("Bo‘limsiz") to model.ildizIshlari)); true }
                    e.isCtrlPressed && e.key == Key.B -> { satrlar.firstOrNull { it.key == grid.active }?.qator()?.let { bajDialog = it }; true }
                    e.isCtrlPressed && e.key == Key.F -> { runCatching { find.requestFocus() }; true }
                    else -> false
                }
            },
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // ---- toolbar card (the site's first section) ----
            FlowRow(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                QDateField(sana, { sana = it }, label = tx("Sana"), modifier = Modifier.width(170.dp))
                QInput(qidiruv, { qidiruv = it }, Modifier.width(320.dp).focusRequester(find), placeholder = tx("Butun obyekt bo‘yicha qidirish…  ( / )"), leading = QIcons.Search)
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(faqatQoldiq, { faqatQoldiq = it }); Text(tx("faqat bajarilmaganlar"), style = Q.type.bodySmall, color = Q.colors.textDim) }
                QButton(SiteI18n.t("Foto-dalil", lang), { ModNav.go?.invoke("foto") }, kind = QButtonKind.Ghost, icon = QIcons.Camera)
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    HolatFiltr.entries.forEach { f ->
                        QButton(tx(f.nom), { holatFiltr = f; if (f == HolatFiltr.Kiritilgan) kiritilganMuz = kiritmalar.filterValues { it.qiymat.isNotBlank() }.keys }, kind = if (holatFiltr == f) QButtonKind.Primary else QButtonKind.Ghost)
                    }
                }
            }
            msg?.let { QNote(it.first, tone = it.second) }
            tenglash?.let { oy ->
                FaktTenglashDialog(c, o.id, sana, oy.sarlavha, oy.reja, oy.eskiAktlar, ustama, ustamaYuk.first, { tenglash = null }) { tenglash = null; msg = tx("Fakt = F2") + " ✓" to QTone.Ok; bump++ }
            }
            bajDialog?.let { q ->
                BajarilmadiDialog(c, o.id, sana, q, bajHajm[q.id] ?: 0.0, ::tx, { bajDialog = null }) { m -> bajDialog = null; msg = m to QTone.Ok; bump++ }
            }
            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // ---- sections panel ----
                Column(Modifier.width(272.dp).fillMaxHeight().background(Q.colors.surface, Q.shape.medium)) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tx("Bo‘limlar"), Modifier.weight(1f), style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                        Text(tx("{a} / {b} tugagan", mapOf("a" to xulosa.bolimTugagan, "b" to xulosa.bolimJami)), style = Q.type.labelSmall, color = Q.colors.textMute)
                    }
                    LazyColumn(Modifier.weight(1f)) {
                        items(model.bolimlar, key = { it.id }) { b ->
                            val sel = b.id == aktiv && qq.isEmpty()
                            Column(Modifier.fillMaxWidth().background(if (sel) Q.colors.accentSoft else androidx.compose.ui.graphics.Color.Transparent).clickable { bolimId = b.id; qidiruv = "" }.padding(start = (8 + b.daraja * 14).dp, end = 8.dp, top = 5.dp, bottom = 5.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(b.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = if (sel || b.daraja == 0) Q.colors.text else Q.colors.textDim, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
                                    Text(tx("{n} ish", mapOf("n" to b.ishSoni)), style = Q.type.labelSmall, color = Q.colors.textMute)
                                }
                                Meter(b.ulush)
                            }
                        }
                        if (model.ildizIshlari.isNotEmpty()) item {
                            val sel = aktiv == BOLIMSIZ && qq.isEmpty()
                            Text(tx("Bo‘limsiz") + " · " + tx("{n} ish", mapOf("n" to model.ildizIshlari.size)), Modifier.fillMaxWidth().background(if (sel) Q.colors.accentSoft else androidx.compose.ui.graphics.Color.Transparent).clickable { bolimId = BOLIMSIZ; qidiruv = "" }.padding(horizontal = 24.dp, vertical = 8.dp), style = Q.type.bodySmall, color = if (sel) Q.colors.text else Q.colors.textDim)
                        }
                    }
                }
                // ---- journal ----
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val tanlangan = model.bolimlar.firstOrNull { it.id == aktiv }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(if (qq.isNotEmpty()) tx("Qidiruv: «{q}»", mapOf("q" to qidiruv.trim())) else tanlangan?.nom ?: tx("Bo‘limsiz"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold, maxLines = 1)
                            Text(tx("{n} ish · {q} qator", mapOf("n" to ishSoni, "q" to satrlar.count { it !is FBolim })), style = Q.type.labelSmall, color = Q.colors.textMute)
                            if (qq.isEmpty() && tanlangan != null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(tx("{a} / {b} ish bajarilgan", mapOf("a" to tanlangan.tugaganSoni, "b" to tanlangan.ishSoni)), style = Q.type.bodySmall, color = Q.colors.textDim)
                                Box(Modifier.width(180.dp)) { Meter(tanlangan.ulush) }
                            }
                        }
                        if (ishSoni > 0) {
                            Text(tx("Jami %:"), style = Q.type.labelSmall, color = Q.colors.textMute)
                            listOf(25, 50, 75, 100).forEach { p -> QButton("$p%", { foizChip(p) }, kind = QButtonKind.Secondary) }
                        }
                        if (tanlangan != null) QButton(tx("Fakt = F2"), { tenglashOch(tanlangan.nom, null, bolimIshlariYigish(tanlangan.id, model.bolimIshlari, bolimBolalari, true)) }, kind = QButtonKind.Secondary, enabled = !tenglashYuk)
                        if (model.bolimlar.isNotEmpty() || model.ildizIshlari.isNotEmpty()) QButton(tx("Fakt = F2: obyekt"), { tenglashOch(tx("Butun obyekt (barcha bo‘limlar)"), model.bolimlar.map { it.nom to model.bolimIshlari[it.id].orEmpty() } + (tx("Bo‘limsiz") to model.ildizIshlari)) }, kind = QButtonKind.Secondary, enabled = !tenglashYuk)
                        QButton(if (hammaYopiq) tx("Hammasini ochish") else tx("Hammasini yopish"), { hammaYopiq = !hammaYopiq }, kind = QButtonKind.Ghost, icon = if (hammaYopiq) QIcons.ChevronRight else QIcons.ChevronDown)
                    }
                    if (qq.isEmpty() && tanlangan != null) BolimSummaQatori(summalar[tanlangan.id], ustama, ustamaYuk.first, ::tx, lang)
                    if (satrlar.isEmpty()) Text(if (qq.isNotEmpty() || holatFiltr != HolatFiltr.Hammasi || faqatQoldiq) tx("Hech narsa topilmadi.") else tx("Bu bo‘limda (ichki bo‘limlari bilan) ish yo‘q."), style = Q.type.bodyMedium, color = Q.colors.textMute)
                    else FaktGrid(satrlar, kiritmalar, paket.xatolar.keys, holat, rowById, grid, { grid = it }, ::tx, lang, summaMatn, bajHajm, { bajDialog = it }, ::bajBekor, { ish -> tenglashOch(ish.q.nom, null, listOf(ish)) }, Modifier.weight(1f).fillMaxWidth(), { id, k -> qoy(if (k == null || k.qiymat.isBlank()) kiritmalar - id else kiritmalar + (id to k)) }, { msg = tx("Bu qatorga fakt qo‘lda kiritilmaydi (avtomatik).") to QTone.Info })
                }
            }
            // ---- save panel (SaqlashPaneli) ----
            Row(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                QButton(tx("Saqlash") + " (Ctrl+S)", { saqla() }, kind = QButtonKind.Primary, enabled = ozgarishSoni > 0 && !busy && paket.ok, loading = busy, icon = QIcons.Check)
                if (tarix.isNotEmpty()) QButton(tx("Orqaga") + " (Ctrl+Z)", { orqaga() }, kind = QButtonKind.Ghost)
                Text(tx("{n} ta o‘zgarish", mapOf("n" to ozgarishSoni)).takeIf { false } ?: "$ozgarishSoni", style = Q.type.bodySmall, color = Q.colors.textMute)
                if (paket.xatolar.isNotEmpty()) Text(tx("{n} tasida xato — tuzating", mapOf("n" to paket.xatolar.size)), style = Q.type.bodySmall, color = Q.colors.warn)
                Text(tx("sana: {s}", mapOf("s" to sana)), style = Q.type.bodySmall, color = Q.colors.textMute)
            }
        }
    }
}

/** The completion bar of a section / work (smeta = 100 %). */
@Composable
private fun Meter(ulush: Double?) {
    val f = (ulush ?: 0.0).coerceIn(0.0, 1.0).toFloat()
    Box(Modifier.fillMaxWidth().height(4.dp).background(Q.colors.surface3, Q.shape.small)) { Box(Modifier.fillMaxWidth(f).fillMaxHeight().background(if ((ulush ?: 0.0) >= 1.0) Q.colors.ok else Q.colors.accent, Q.shape.small)) }
}

@Composable
private fun FaktGrid(
    satrlar: List<FSatr>, kiritmalar: Map<Long, Kiritma>, xatoIds: Set<Long>, holat: Map<Long, uz.anncorp.smeta.core.fakt.JurnalHolat>,
    rowById: Map<Long, uz.anncorp.smeta.core.fakt.T2Qator>, state: GridState, onState: (GridState) -> Unit, tx: (String, Map<String, Any>) -> String, lang: String, summaMatn: (FSatr) -> String, bajHajm: Map<Long, Double>, onBajOch: (JurnalQator) -> Unit, onBajBekor: (Long) -> Unit, onTenglash: (JurnalIsh) -> Unit, modifier: Modifier,
    onKiritma: (Long, Kiritma?) -> Unit, onNotAllowed: () -> Unit,
) {
    fun t(k: String) = tx(k, emptyMap())
    fun narx(q: JurnalQator): Double? = rowById[q.id]?.narx
    val cols = remember(lang, summaMatn, bajHajm) {
        listOf(
            GridCol<FSatr>("kod", t("Kod"), 110f, mono = true) { s -> when (s) { is FBolim -> ""; else -> s.qator()?.kod ?: "" } },
            GridCol("nom", t("Nomi"), 340f) { s -> when (s) { is FBolim -> " ".repeat(s.nisbiy) + s.b.nom; is FIsh -> s.ish.q.nom + (if (s.ish.q.zamena) " · " + t("zamena") else if (s.ish.q.qoshimcha) " · " + t("qo‘shimcha") else ""); is FResurs -> " " + s.q.nom + (if (s.avto) " · " + t("avto") else "") } },
            GridCol("tur", t("Kat / tur"), 90f) { s -> when (s) { is FBolim -> ""; is FIsh -> t("ISH"); is FResurs -> s.q.kat ?: s.q.tur.uppercase() } },
            GridCol("holat", t("Holat"), 170f) { s -> s.qator()?.let { t(HOLAT_MUHR.getValue(it.holat)) + (bajHajm[it.id]?.takeIf { b -> b > 0 }?.let { b -> " · " + t("Bajarilmaydi") + " " + qty(b) } ?: "") } ?: "" },
            GridCol("hajm", t("Smeta hajmi"), 100f, numeric = true) { s -> s.qator()?.let { qty(it.smeta) } ?: "" },
            GridCol("birlik", t("Birlik"), 70f) { s -> s.qator()?.birlik?.let { uz.anncorp.smeta.core.data.displayUnit(it) } ?: "" },
            GridCol("narx", t("Birlik narxi"), 110f, numeric = true) { s -> s.qator()?.let { q -> narx(q)?.let { money(it) } ?: "" } ?: "" },
            GridCol("foiz", t("Bajarilish foizi"), 90f, numeric = true) { s -> s.qator()?.let { q -> foizMatn(faktMeter(q.smeta, q.fakt, holat[q.id]?.f2Hajm).foiz) } ?: "" },
            GridCol("fakt", t("Fakt hajm"), 100f, numeric = true) { s -> s.qator()?.let { qty(it.fakt) } ?: "" },
            GridCol("f2", t("F2 hajmi"), 100f, numeric = true) { s -> s.qator()?.let { q -> holat[q.id]?.f2Hajm?.let { qty(it) } ?: "" } ?: "" },
            GridCol("kiritma", t("Bu fakt"), 120f, numeric = true, editable = true) { s -> s.qator()?.let { kiritmalar[it.id]?.qiymat } ?: "" },
            GridCol("rejim", "+ / =", 56f) { s -> s.qator()?.let { q -> kiritmalar[q.id]?.rejim?.belgi?.toString() ?: "" } ?: "" },
            GridCol("ochiq", t("Ochiq qoldiq"), 110f, numeric = true) { s -> s.qator()?.let { qty(it.qoldiq) } ?: "" },
            GridCol("f2m", t("F2 ga olish mumkin"), 120f, numeric = true) { s -> s.qator()?.let { q -> holat[q.id]?.f2MumkinHajm?.let { qty(it) } ?: "" } ?: "" },
            GridCol("summa", t("Fakt summasi") + " (" + t("ustamali · ustamasiz") + ")", 230f, numeric = true) { s -> summaMatn(s) },
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
