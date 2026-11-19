@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.BolakHolat
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.JurnalHolat
import uz.anncorp.smeta.core.fakt.JurnalIsh
import uz.anncorp.smeta.core.fakt.PaketQator
import uz.anncorp.smeta.core.fakt.QamrovIstisno
import uz.anncorp.smeta.core.fakt.QamrovOpsiya
import uz.anncorp.smeta.core.fakt.QamrovUrinish
import uz.anncorp.smeta.core.fakt.QamrovYozilgan
import uz.anncorp.smeta.core.fakt.SummaKesim
import uz.anncorp.smeta.core.fakt.UrinishDokoni
import uz.anncorp.smeta.core.fakt.UrinishHolat
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.aktBekorPayload
import uz.anncorp.smeta.core.fakt.urinishFoizMatn
import uz.anncorp.smeta.core.fakt.ishlarniYangila
import uz.anncorp.smeta.core.fakt.qamrovBolaklari
import uz.anncorp.smeta.core.fakt.qamrovFoizOqi
import uz.anncorp.smeta.core.fakt.qamrovJami
import uz.anncorp.smeta.core.fakt.qamrovReja
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.fakt.urinishAktlari
import uz.anncorp.smeta.core.fakt.urinishHolati
import uz.anncorp.smeta.core.fakt.urinishOchiqmi
import uz.anncorp.smeta.core.fakt.urinishReceipt
import uz.anncorp.smeta.core.fakt.urinishYarat
import uz.anncorp.smeta.core.fakt.yozilganKorinadimi
import uz.anncorp.smeta.core.fakt.yozilganYasa
import uz.anncorp.smeta.core.i18n.SiteI18n
import java.util.UUID

/*
 * "Qamrov %" (Tiklash rejimi) = the site's FaktQamrov.tsx: a section (with descendants) or one work -> ONE percent -> fakt = percent x open remainder. Preview (rows, sum, exceptions)
 * -> the owner removes what is not wanted -> ONE fakt document (fakt_yoz_v2; a huge coverage = several documents, one operation id per chunk, reused on retry). "Bekor qilish"
 * returns every document of the operation (akt_bekor). Over-smeta rows are NEVER lowered by the percent: the separate "Tuzatish" (with preview). The estimate rows are untouched.
 * The attempt / receipt / written-record store is the process-wide UrinishDokoni (the site keeps the same in a module registry + localStorage).
 */

private const val KORSAT_CHEGARA = 300

private val ISTISNO_NOM = mapOf(
    QamrovIstisno.Faktli to "Allaqachon faktli", QamrovIstisno.Zamenalangan to "Zamenalangan (asl)", QamrovIstisno.Zamena to "Zamena qatori",
    QamrovIstisno.Bajarilmaydi to "Bajarilmaydi belgili", QamrovIstisno.Narxsiz to "Narxsiz", QamrovIstisno.Chegirma to "Chegirma (manfiy smeta)",
)

@Composable
fun FaktQamrovDialog(
    c: Ctx, obyektId: Long, sana: String, sarlavha: String, ishlar: List<JurnalIsh>, holat: Map<Long, JurnalHolat>, narxOl: (Long) -> Double?,
    ustama: UstamaMalumot?, ustamaTayyor: Boolean, onYop: () -> Unit, onBajarildi: () -> Unit, onXabar: (String) -> Unit = {},
) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    val cid = c.place.companyId
    var foizText by remember { mutableStateOf("100") }
    var ichki by remember { mutableStateOf(true) }
    var chiqarilgan by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var band by remember { mutableStateOf(false) }
    var xabar by remember { mutableStateOf<Pair<String, QTone>?>(null) }
    var urinish by remember { mutableStateOf(UrinishDokoni.urinishOl(cid, obyektId)?.takeIf { urinishOchiqmi(it) }) }
    var yozilgan by remember { mutableStateOf(UrinishDokoni.yozilganOl(cid, obyektId)) }
    var tuzatishOchiq by remember { mutableStateOf(false) }
    var tuzTanlangan by remember { mutableStateOf<Set<Long>>(emptySet()) }
    val scope = rememberCoroutineScope()

    val jadvalYangi = yozilgan.let { it == null || yozilganKorinadimi(it) { id -> holat[id]?.faktHajm } }
    fun urinishQoy(u: QamrovUrinish?) { urinish = u; if (u != null) UrinishDokoni.urinishSaqla(u) else UrinishDokoni.urinishOchir(cid, obyektId) }
    fun yozilganQoy(y: QamrovYozilgan?) { yozilgan = y; if (y != null) UrinishDokoni.yozilganSaqla(y) else UrinishDokoni.yozilganOchir(cid, obyektId) }

    val foiz = qamrovFoizOqi(foizText)
    // The snapshot (works at opening) is refreshed with the CURRENT state: fakt written while the dialog is open lowers the remainder.
    val ishlarJoriy = remember(ishlar, holat) { ishlarniYangila(ishlar, holat) }
    val reja = remember(ishlarJoriy, foiz, holat, ichki, narxOl) { qamrovReja(ishlarJoriy, foiz ?: 0.0, holat, QamrovOpsiya(ichki, narxOl)) }
    val jami = remember(reja, chiqarilgan) { qamrovJami(reja, chiqarilgan) }
    val bolaklanadi = jami.paket.size > uz.anncorp.smeta.core.fakt.QAMROV_BOLAK
    val istisnoli = remember(reja) { reja.qatorlar.filter { it.istisnolar.isNotEmpty() } }
    val tuzPaket = remember(reja, tuzTanlangan) { reja.oshganlar.filter { it.id in tuzTanlangan }.map { PaketQator(it.id, it.hajm) } }
    fun turNomi(tur: String) = if (tur == "bl") t("ISH") else if (tur == "ob") t("uskuna") else t("material")

    fun bekorQil(aktlar: List<Long>) {
        scope.launch {
            var xato: String? = null
            for (a in aktlar) {
                val r = c.sv.api.bff("/api/sb-yoz", "POST", aktBekorPayload(a))
                if (parseFaktResult(r.body)?.ok != true) { xato = parseFaktResult(r.body)?.error ?: t("Bekor qilinmadi."); break }
            }
            if (xato != null) xabar = xato to QTone.Danger
            else {
                val m = t("Qamrov % bekor qilindi."); xabar = m to QTone.Ok; onXabar(m)
                // Receipts of cancelled acts are no longer valid: the record and (that) attempt are cleared.
                val bekor = aktlar.toSet()
                val y = UrinishDokoni.yozilganOl(cid, obyektId)
                if (y != null && y.aktlar.all { it in bekor }) yozilganQoy(null)
                val u = urinish
                if (u != null && urinishAktlari(u).any { it in bekor } && urinishHolati(u) != UrinishHolat.Nomalum) urinishQoy(null)
            }
            onBajarildi()
        }
    }

    /** Write: a new snapshot only when there is NO unresolved attempt; otherwise the SAME snapshot (same UUIDs) is re-sent. Every chunk's answer becomes a receipt at once. */
    fun yoz(tuzatish: List<PaketQator>? = null) {
        if (band) return
        var u = urinish
        if (u == null) {
            if (yozilgan != null) {
                if (!jadvalYangi) { xabar = t("Jadval hali yangilanmagan — oldingi yozuv ko‘rinmayapti. «Jadvalni yangilash» ni bosing.") to QTone.Warn; return }
                yozilganQoy(null)
            }
            val paket = tuzatish ?: jami.paket
            if ((tuzatish == null && foiz == null) || paket.isEmpty()) return
            val faktlar = (reja.qatorlar + reja.oshganlar).associate { it.id to it.fakt }
            val bolaklar = qamrovBolaklari(paket.map { FaktF2PaketQator(it.qatorId, it.hajm) })
            u = if (tuzatish != null) urinishYarat(cid, obyektId, sana, sarlavha, 100.0, bolaklar, { UUID.randomUUID().toString() }, "Tuzatish (oshgan fakt → smeta)", "tuzatish") { faktlar[it] ?: 0.0 }
            else urinishYarat(cid, obyektId, sana, sarlavha, foiz!!, bolaklar, { UUID.randomUUID().toString() }, null, "qamrov") { faktlar[it] ?: 0.0 }
        }
        val start: QamrovUrinish = u ?: return
        band = true; xabar = null; urinishQoy(start)
        scope.launch {
            var cur = start
            for (i in cur.bolaklar.indices) {
                if (cur.bolaklar[i].holat == BolakHolat.Confirmed) continue   // already written: its receipt stays
                val b = cur.bolaklar[i]
                val r = runCatching { c.sv.api.bff("/api/sb-yoz", "POST", tenglashPayload(cid, cur.obyektId, cur.sana, b.qatorlar, b.operationId, b.izoh)) }.getOrNull()
                cur = urinishReceipt(cur, i, r); urinishQoy(cur)
            }
            val aktlar = urinishAktlari(cur); val h = urinishHolati(cur)
            val qatorSoni = cur.bolaklar.sumOf { it.qatorlar.size }
            if (h == UrinishHolat.Toliq) {
                yozilganQoy(yozilganYasa(cur)); urinishQoy(null); band = false
                val m = if (cur.tur == "tuzatish") t("Tuzatish: {n} qator fakti smetaga tushirildi", mapOf("n" to qatorSoni)) else t("Qamrov {foiz}%: {n} qator faktga yozildi", mapOf("foiz" to urinishFoizMatn(cur.foiz), "n" to qatorSoni))
                onXabar(m); onYop(); onBajarildi(); return@launch
            }
            val birinchi = cur.bolaklar.firstOrNull { it.holat != BolakHolat.Confirmed }; val tasdiq = cur.bolaklar.count { it.holat == BolakHolat.Confirmed }
            xabar = ((if (h == UrinishHolat.Nomalum) t("Javob olinmadi — amal serverda bajarilgan bo‘lishi mumkin. «Qayta yuborish» xuddi shu amalni (bir xil ID) yuboradi, ikkinchi hujjat yaratilmaydi.") else birinchi?.xato ?: t("Fakt saqlanmadi.")) +
                (if (tasdiq > 0) " — " + t("yozilgani") + ": $tasdiq/${cur.bolaklar.size}" else "")) to QTone.Danger
            band = false
            if (aktlar.isNotEmpty()) onBajarildi()
        }
    }

    fun urinishniTashla() {
        val u = urinish ?: return
        if (urinishHolati(u) == UrinishHolat.Nomalum) return
        val y = yozilganYasa(u)
        if (y != null) {
            val eski = UrinishDokoni.yozilganOl(cid, obyektId)
            yozilganQoy(if (eski != null) QamrovYozilgan(y.kalit, y.sarlavha, y.foiz, eski.aktlar + y.aktlar, eski.tekshir + y.tekshir) else y)
            onBajarildi()
        }
        urinishQoy(null)
    }

    Dialog(onDismissRequest = { if (!band) onYop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 1000.dp).fillMaxWidth(0.82f).heightIn(max = 800.dp).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp)
                .onPreviewKeyEvent { e -> if (e.type == KeyEventType.KeyDown && e.isCtrlPressed && e.key == Key.Enter) { if (urinish != null || jami.paket.isNotEmpty()) yoz(); true } else false },
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(t("Qamrov %") + " · " + t("Tiklash rejimi"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            Text(sarlavha, style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            UrinishPanel(::t, urinish, yozilgan, jadvalYangi, ::bekorQil, ::urinishniTashla, onBajarildi)

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                QInput(foizText, { foizText = it }, Modifier.width(150.dp).onPreviewKeyEvent { e ->
                    if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    if (e.key == Key.Enter && !e.isCtrlPressed) { yoz(); return@onPreviewKeyEvent true }
                    // Keyboard (owner 2026-11-07): up/down = +-5%, PgUp/PgDn = +-25% (0..100).
                    val q = when (e.key) { Key.DirectionUp -> 5.0; Key.DirectionDown -> -5.0; Key.PageUp -> 25.0; Key.PageDown -> -25.0; else -> null } ?: return@onPreviewKeyEvent false
                    foizText = urinishFoizMatn(((foiz ?: 0.0) + q).coerceIn(0.0, 100.0)); true
                }, label = t("Bajarilish foizi") + " %", enabled = urinish == null, isError = foiz == null)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(25, 50, 70, 100).forEach { p -> QButton("$p%", { foizText = p.toString() }, kind = if (foiz == p.toDouble()) QButtonKind.Primary else QButtonKind.Ghost, enabled = urinish == null) }
                }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(ichki, { ichki = it }, enabled = urinish == null); Text(t("Ish ichidagi material/uskuna ham"), style = Q.type.bodySmall, color = Q.colors.textDim) }
            }
            Text(t("Har qatorga: foiz × ochiq qoldiq (smeta − fakt − almashtirilgan − bajarilmaydi). Mehnat va mashina norma bo‘yicha o‘zi ergashadi. Hech narsa bloklanmaydi."), style = Q.type.labelSmall, color = Q.colors.textMute)

            FlowRow(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("${jami.paket.size} " + t("qator yoziladi"), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                SummaUchlik(t("Summa"), SummaKesim(jami.ustamasiz, jami.kesim), ustama, ustamaTayyor) { k -> t(k) }
                if (jami.narxsiz > 0) Text(t("summa noma’lum: {n} qator", mapOf("n" to jami.narxsiz)), style = Q.type.labelSmall, color = Q.colors.warn)
                if (reja.yopiq > 0) Text(t("ochiq qoldig‘i yo‘q: {n}", mapOf("n" to reja.yopiq)), style = Q.type.labelSmall, color = Q.colors.textMute)
                if (reja.smetasiz > 0) Text(t("smetasi noma’lum: {n}", mapOf("n" to reja.smetasiz)), style = Q.type.labelSmall, color = Q.colors.textMute)
                if (reja.oshganlar.isNotEmpty()) Text(t("allaqachon ≥100% (smetadan oshgan, o‘zgarmaydi): {n}", mapOf("n" to reja.oshganlar.size)), style = Q.type.labelSmall, color = Q.colors.warn)
                if (chiqarilgan.isNotEmpty()) Text(t("olib tashlangan: {n}", mapOf("n" to chiqarilgan.size)), style = Q.type.labelSmall, color = Q.colors.textMute)
                if (bolaklanadi) Text(t("{n} ta hujjatga bo‘linadi", mapOf("n" to qamrovBolaklari(jami.paket).size)), style = Q.type.labelSmall, color = Q.colors.textMute)
            }

            LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = 380.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (istisnoli.isEmpty()) item { Text(if (reja.qatorlar.isNotEmpty()) t("Istisno yo‘q — hamma qator bir xil foizda olinadi.") else t("Yoziladigan qator yo‘q."), style = Q.type.bodySmall, color = Q.colors.textDim) }
                else {
                    item {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            QamrovIstisno.entries.filter { k -> reja.qatorlar.any { k in it.istisnolar } }.forEach { k ->
                                val hammasi = reja.qatorlar.filter { k in it.istisnolar }; val chiq = hammasi.all { it.id in chiqarilgan }
                                QButton(t(ISTISNO_NOM.getValue(k)) + ": ${hammasi.size} · " + if (chiq) t("qaytarish") else t("olib tashlash"),
                                    { chiqarilgan = if (chiq) chiqarilgan - hammasi.map { it.id }.toSet() else chiqarilgan + hammasi.map { it.id } }, kind = if (chiq) QButtonKind.Danger else QButtonKind.Secondary)
                            }
                        }
                    }
                    item {
                        Row(Modifier.padding(vertical = 2.dp)) {
                            Text(t("Qator"), Modifier.weight(1f).padding(start = 40.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Istisno"), Modifier.width(200.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                            Text(t("Fakt"), Modifier.width(80.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Ochiq qoldiq"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                            Text(t("Yoziladi"), Modifier.width(110.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Summa"), Modifier.width(130.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                        }
                    }
                    items(istisnoli.take(KORSAT_CHEGARA), key = { it.id }) { q ->
                        val ota = q.otaIshId != null && q.otaIshId in chiqarilgan
                        val chiq = q.id in chiqarilgan || ota
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(!chiq, { chiqarilgan = if (q.id in chiqarilgan) chiqarilgan - q.id else chiqarilgan + q.id }, enabled = !ota && urinish == null)
                            Text(turNomi(q.tur) + " " + (q.kod?.let { "$it " } ?: "") + q.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = if (chiq) Q.colors.textMute else Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(q.istisnolar.joinToString(", ") { t(ISTISNO_NOM.getValue(it)) }, Modifier.width(200.dp), style = Q.type.labelSmall, color = Q.colors.warn, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(qty(q.fakt), Modifier.width(80.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(q.ochiq), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                            Text((if (q.hajm > 0) "+" else "") + qty(q.hajm) + " " + (q.birlik ?: ""), Modifier.width(110.dp), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                            Text(money(q.summa), Modifier.width(130.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                        }
                    }
                    if (istisnoli.size > KORSAT_CHEGARA) item { Text(t("yana {n} ta istisno — yuqoridagi tur tugmalari bilan boshqaring", mapOf("n" to (istisnoli.size - KORSAT_CHEGARA))), style = Q.type.labelSmall, color = Q.colors.textMute) }
                }
                if (urinish == null && reja.oshganlar.isNotEmpty()) item {
                    Column(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(t("Smetadan oshgan qatorlar foiz bilan KAMAYTIRILMAYDI. Kamaytirish kerak bo‘lsa — alohida tuzatish (oldindan ko‘rish bilan)."), style = Q.type.labelSmall, color = Q.colors.textDim)
                        if (!tuzatishOchiq) QButton(t("Tuzatishni ko‘rish ({n})", mapOf("n" to reja.oshganlar.size)), { tuzTanlangan = reja.oshganlar.map { it.id }.toSet(); tuzatishOchiq = true }, kind = QButtonKind.Secondary)
                        else {
                            Row(Modifier.padding(vertical = 2.dp)) {
                                Text(t("Qator"), Modifier.weight(1f).padding(start = 40.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Smeta"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                                Text(t("Hozirgi fakt"), Modifier.width(100.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Yangi fakt"), Modifier.width(100.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Farq"), Modifier.width(110.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                            }
                            reja.oshganlar.take(KORSAT_CHEGARA).forEach { q ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(q.id in tuzTanlangan, { tuzTanlangan = if (q.id in tuzTanlangan) tuzTanlangan - q.id else tuzTanlangan + q.id })
                                    Text(turNomi(q.tur) + " " + (q.kod?.let { "$it " } ?: "") + q.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(qty(q.smeta), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(q.fakt), Modifier.width(100.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                                    Text(qty(q.fakt + q.hajm), Modifier.width(100.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(q.hajm) + " " + (q.birlik ?: ""), Modifier.width(110.dp), style = Q.type.bodySmall, color = Q.colors.danger, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                QButton(t("Bekor"), { tuzatishOchiq = false }, kind = QButtonKind.Ghost)
                                QButton(t("Tuzatishni yozish — faktni kamaytirish ({n})", mapOf("n" to tuzPaket.size)), { yoz(tuzPaket) }, kind = QButtonKind.Danger, enabled = !band && tuzPaket.isNotEmpty() && jadvalYangi)
                            }
                        }
                    }
                }
            }
            xabar?.let { QNote(it.first, tone = it.second) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("Sana") + ": " + sana, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textMute)
                QButton(t("Bekor"), onYop, kind = QButtonKind.Ghost, enabled = !band)
                QButton(if (band) t("Yozilmoqda…") else if (urinish != null) t("Faktga yozish — qayta yuborish (bir xil ID)") else t("Faktga yozish ({n})", mapOf("n" to jami.paket.size)) + " (Ctrl+Enter)",
                    { yoz() }, kind = QButtonKind.Primary, enabled = !band && (urinish != null || (foiz != null && jami.paket.isNotEmpty() && jadvalYangi)), loading = band)
            }
        }
    }
}

private val BOLAK_HOLAT = mapOf(BolakHolat.Confirmed to "tasdiqlandi", BolakHolat.Failed to "rad etildi", BolakHolat.Unknown to "noma’lum", BolakHolat.Kutmoqda to "kutmoqda")

/** Unresolved attempt and earlier-written record warnings (the same in the "Qamrov %" and "Fakt = F2" dialogs; site FaktUrinishPanel). */
@Composable
internal fun UrinishPanel(
    t: (String, Map<String, Any>) -> String, urinish: QamrovUrinish?, yozilgan: QamrovYozilgan?, jadvalYangi: Boolean, bekorQil: (List<Long>) -> Unit, urinishniTashla: () -> Unit, onBajarildi: () -> Unit,
) {
    fun tx(k: String) = t(k, emptyMap())
    if (urinish != null) {
        val h = urinishHolati(urinish); val aktlar = urinishAktlari(urinish)
        Column(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (h == UrinishHolat.Nomalum) tx("Oldingi urinish natijasi noma’lum — avval shuni hal qiling") else tx("Oldingi urinish to‘liq yozilmadi — avval shuni hal qiling"), style = Q.type.bodySmall, color = Q.colors.warn, fontWeight = FontWeight.SemiBold)
            Text((if (urinish.tur == "f2") tx("Fakt = F2") + ": ${urinish.sarlavha}" else (if (urinish.tur == "tuzatish") tx("Tuzatish") else tx("Qamrov")) + ": ${urinish.sarlavha} · ${urinishFoizMatn(urinish.foiz)}%") +
                " · " + tx("Sana") + ": ${urinish.sana} · " + tx("bo‘laklar") + ": " + urinish.bolaklar.mapIndexed { i, b -> "${i + 1}:" + tx(BOLAK_HOLAT.getValue(b.holat)) + (b.aktId?.let { " (№$it)" } ?: "") }.joinToString(", "), style = Q.type.labelSmall, color = Q.colors.textDim)
            Text(tx("«Qayta yuborish» xuddi shu amalni bir xil ID bilan yuboradi — server yozilganini qaytadan yozmaydi. Foizni o‘zgartirish bu urinish hal bo‘lgach mumkin."), style = Q.type.labelSmall, color = Q.colors.textDim)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (aktlar.isNotEmpty()) QButton(t("Yozilgan {n} hujjatni bekor qilish", mapOf("n" to aktlar.size)), { bekorQil(aktlar) }, kind = QButtonKind.Danger)
                if (h != UrinishHolat.Nomalum) QButton(tx("Urinishni tashlash (yangisiga yo‘l)"), urinishniTashla, kind = QButtonKind.Secondary)
            }
        }
    } else if (yozilgan != null) {
        Column(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(tx("Oldin yozilgan") + ": ${yozilgan.sarlavha} · ${urinishFoizMatn(yozilgan.foiz)}% · " + tx("hujjatlar") + ": " + (yozilgan.aktlar.joinToString(", ") { "№$it" }.ifEmpty { "—" }) + " · " + t("{n} qator", mapOf("n" to yozilgan.tekshir.size)),
                style = Q.type.bodySmall, color = if (jadvalYangi) Q.colors.text else Q.colors.warn)
            if (!jadvalYangi) Text(tx("Jadval bu yozuvni hali ko‘rsatmayapti — yangi qamrov eski qoldiqdan hisoblanib, ikki marta yozilishi mumkin edi. Yangilanmaguncha yozish yopiq."), style = Q.type.labelSmall, color = Q.colors.textDim)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (yozilgan.aktlar.isNotEmpty()) QButton(t("Yozilgan {n} hujjatni bekor qilish", mapOf("n" to yozilgan.aktlar.size)), { bekorQil(yozilgan.aktlar) }, kind = QButtonKind.Danger)
                if (!jadvalYangi) QButton(tx("Jadvalni yangilash"), onBajarildi, kind = QButtonKind.Secondary)
            }
        }
    }
}
