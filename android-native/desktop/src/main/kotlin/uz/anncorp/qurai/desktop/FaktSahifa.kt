@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.fakt.BolimSumma
import uz.anncorp.smeta.core.fakt.FaktYigindi
import uz.anncorp.smeta.core.fakt.JurnalBolim
import uz.anncorp.smeta.core.fakt.Kat
import uz.anncorp.smeta.core.fakt.Kesim
import uz.anncorp.smeta.core.fakt.QadamHolat
import uz.anncorp.smeta.core.fakt.QiymatUchlik
import uz.anncorp.smeta.core.fakt.SummaKesim
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.ZanjirNatija
import uz.anncorp.smeta.core.fakt.hisob
import uz.anncorp.smeta.core.fakt.uchlik
import uz.anncorp.smeta.core.i18n.SiteI18n

/*
 * The page frame of the site's /admin/fakt (FaktNative.tsx + FaktStudioBar + FaktKorinish MeterLegenda + ZanjirChizigi): page tabs, title row, the 8-step work chain, the
 * object summary cards, the sections tree with %, the legend. Texts are the site's t() keys through SiteI18n. Money only through the ported core (hisob / qiymatUchligi).
 */

private fun tr(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, DesktopPrefs.lang, p)

/** «Fakt kiritish | Foto-dalil»: the two pages of one screen (the site has them as tabs). */
@Composable
fun FaktSahifaTablar(foto: Boolean, onSelect: (Boolean) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        QButton(tr("Fakt kiritish"), { onSelect(false) }, kind = if (!foto) QButtonKind.Primary else QButtonKind.Ghost)
        QButton(tr("Foto-dalil"), { onSelect(true) }, kind = if (foto) QButtonKind.Primary else QButtonKind.Ghost, icon = QIcons.Camera)
    }
}

/** Title + subtitle on the left; «Obyekt holatiga qaytish», «Yangilash», «F2 tayyorlash →» and the view tabs (Fakt jurnali | Xotiradan | Daraxt) on the right. */
@Composable
fun FaktSarlavhaQatori(korinish: String, onKorinish: (String) -> Unit, onYangila: () -> Unit, yangilanmoqda: Boolean) {
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.widthIn(min = 360.dp)) {
            Text(tr("Bajarilgan ishlar (Fakt)"), style = Q.type.titleLarge, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            Text(tr("Smeta hajmi va Faktni RZ → BL → RS/MAT/OB daraxtida boshqaring"), style = Q.type.bodySmall, color = Q.colors.textDim)
        }
        QButton(tr("Obyekt holatiga qaytish"), { ModNav.go?.invoke("obyektlar") }, kind = QButtonKind.Secondary)
        QButton(tr("Yangilash"), onYangila, kind = QButtonKind.Secondary, enabled = !yangilanmoqda)
        QButton(tr("F2 tayyorlash →"), { ModNav.go?.invoke("f2") }, kind = QButtonKind.Primary)
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf("tezkor" to "Fakt jurnali", "xotira" to "Xotiradan", "daraxt" to "Daraxt").forEach { (k, l) ->
                QButton(tr(l), { onKorinish(k) }, kind = if (korinish == k) QButtonKind.Primary else QButtonKind.Ghost)
            }
        }
    }
}

private fun qadamBelgi(h: QadamHolat) = when (h) { QadamHolat.Done -> "✓"; QadamHolat.Current -> "→"; QadamHolat.Blocked -> "!"; QadamHolat.NotStarted -> "○"; QadamHolat.Unknown -> "?" }

private val QADAM_MOD = mapOf("smeta" to "smeta", "fakt" to "fakt", "aosr" to "hujjat", "f2" to "f2", "nakopitelniy" to "nakop", "f3" to "nakop", "tolov" to "moliya", "slichitelniy" to "smeta")

/** The 8-step work chain (Smeta · Fakt · АОСР · F2 · Nakopitelniy · Forma 3 · To'lov · Slichitelniy) with each step's status text, «Ish oyi» and the next action. */
@Composable
fun ZanjirQatori(n: ZanjirNatija, oy: String, aniqOy: Boolean) {
    val c = Q.colors
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            n.qadamlar.forEachIndexed { i, q ->
                val (bg, bd, tx) = when (q.holat) {
                    QadamHolat.Done -> Triple(c.okSoft, c.ok.copy(alpha = 0.35f), c.ok)
                    QadamHolat.Current -> Triple(c.accentSoft, c.accent, c.text)
                    QadamHolat.Blocked -> Triple(c.surface2, c.border, c.textMute)
                    QadamHolat.NotStarted -> Triple(c.surface, c.border, c.textDim)
                    QadamHolat.Unknown -> Triple(c.surface, c.border, c.textMute)
                }
                Column(
                    Modifier.weight(1f).heightIn(min = 58.dp).background(bg, Q.shape.medium).border(BorderStroke(1.dp, bd), Q.shape.medium).clickable { QADAM_MOD[q.id]?.let { ModNav.go?.invoke(it) } }.padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${i + 1}", style = Q.type.labelSmall, color = tx); Text(" " + q.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = tx, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(qadamBelgi(q.holat), style = Q.type.bodySmall, color = tx)
                    }
                    Text(q.izoh, style = Q.type.labelSmall, color = tx, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Ish oyi") + ": ", style = Q.type.bodySmall, color = c.textMute); Text(oy, style = Q.type.bodySmall, color = c.text, fontWeight = FontWeight.SemiBold)
            val k = n.keyingi
            if (k != null) {
                QButton(k.amal + " →", { ModNav.go?.invoke(QADAM_MOD[k.id] ?: "fakt") }, kind = QButtonKind.Primary)
                Text(k.sabab + (k.eslatma?.let { " · $it" } ?: ""), Modifier.weight(1f), style = Q.type.bodySmall, color = c.textDim, maxLines = 2, overflow = TextOverflow.Ellipsis)
            } else if (n.tugallandi) Text(tr("Zanjir shu oy uchun yopilgan"), style = Q.type.bodySmall, color = c.ok)
        }
    }
}

/** One value triple: VAT-inclusive main figure, markup total (no VAT), direct cost; «▸ kesim va hisob» opens the category cut and the markup cascade. */
@Composable
fun SummaKarta(nom: String, k: SummaKesim?, ustama: UstamaMalumot?, tayyor: Boolean, modifier: Modifier = Modifier, kichik: Boolean = false, tafsilBilan: Boolean = true) {
    val kes = k ?: SummaKesim()
    val q = remember(kes, ustama) { ustama.uchlik(kes.kesim, kes.ustamasiz) }
    var ochiq by remember { mutableStateOf(false) }
    val c = Q.colors
    Column(modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
            Text(nom.uppercase(), style = Q.type.labelSmall, color = c.textMute, fontWeight = FontWeight.SemiBold)
            Text(tr("QQS bilan"), style = Q.type.labelSmall, color = c.textMute)
        }
        Text(if (q.qqsBilan != null) (if (q.taxminiy) "≈ " else "") + money(q.qqsBilan) else if (!tayyor) tr("Hisoblanmoqda…") else Tx.dash, style = if (kichik) Q.type.bodyMedium else Q.type.titleMedium, color = c.text, fontWeight = FontWeight.SemiBold)
        Text(tr("ustamali, QQS siz") + ": " + (q.ustamali?.let { money(it) } ?: Tx.dash), style = Q.type.labelSmall, color = c.textDim)
        Text(tr("to‘g‘ri xarajat (ustamasiz)") + ": " + (q.ustamasiz?.let { money(it) } ?: Tx.dash), style = Q.type.labelSmall, color = c.textDim)
        if (tafsilBilan && kes.ustamasiz != null) {
            Text((if (ochiq) "▾ " else "▸ ") + tr("kesim va hisob"), Modifier.clickable { ochiq = !ochiq }, style = Q.type.labelSmall, color = c.accentText)
            if (ochiq) KesimTafsilot(kes.kesim, ustama, q)
        }
    }
}

/** The category cut (exact categories, unknown part, round part) and, when the markup is known, the cascade steps. Nothing here is a new formula: the cut and `hisob` come from the core. */
@Composable
private fun KesimTafsilot(kesim: Kesim, ustama: UstamaMalumot?, q: QiymatUchlik) {
    val c = Q.colors
    Column(Modifier.padding(top = 2.dp).background(c.surface2, Q.shape.small).padding(6.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Kat.entries.forEach { kat -> val v = kesim.summalar[kat]; if (v != null && v != 0.0) Text("${kat.kod}: ${money(v)}", style = Q.type.labelSmall, color = c.textDim) }
        if (kesim.nomalum != 0.0 || kesim.nomalumSoni > 0) Text(tr("kat noma’lum: {pul} so‘m", mapOf("pul" to money(kesim.nomalum))) + " (${kesim.nomalumSoni})", style = Q.type.labelSmall, color = c.warn)
        kesim.yaxlit?.let { Text(tr("shundan svod yaxlit (ustamasiz): {pul} so‘m", mapOf("pul" to money(it.qqssiz))), style = Q.type.labelSmall, color = c.textDim) }
        if (kesim.summasizSoni > 0) Text(tr("narxsiz") + ": ${kesim.summasizSoni}", style = Q.type.labelSmall, color = c.warn)
        if (ustama != null && !ustama.podvalXato) {
            val h = hisob(kesim, ustama.podval, ustama.koef)
            h.ustama.forEach { s -> Text(s.nom + (s.foiz?.let { " ($it%)" } ?: "") + ": " + money(s.summa), style = Q.type.labelSmall, color = c.textDim) }
            if (q.sabab != null) Text(q.sabab!!, style = Q.type.labelSmall, color = c.warn)
        }
    }
}

/** The object summary cards (FaktStudioBar): FAKT (HOZIRCHA), SMETA, F2 (TASDIQLANGAN), QOLDIQ, SMETADA YO'Q ISHLAR, BAJARILMAYDI, «F2 davri» + «Fakt bo'yicha F2 qoralama →», the Nakopitelniy note. */
@Composable
fun FaktKartalar(y: FaktYigindi, jami: BolimSumma?, ustama: UstamaMalumot?, tayyor: Boolean, oy: String, onOy: (String) -> Unit, onF2Qoralama: (String) -> Unit, onYangiIsh: () -> Unit) {
    val c = Q.colors
    Column(Modifier.fillMaxWidth().background(c.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(26.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SummaKarta(tr("Fakt (hozircha)"), SummaKesim(y.faktUstamasiz, y.faktKesim), ustama, tayyor)
            if (y.faktF2Narxda > 0) Text(tr("fakt summasi tasdiqlangan F2 narxida: {n} ta pozitsiya (fakt hajmi o‘zgarmaydi)", mapOf("n" to y.faktF2Narxda)), style = Q.type.labelSmall, color = c.textMute)
            if (jami != null) {
                SummaKarta(tr("Smeta"), jami.smeta, ustama, tayyor, kichik = true)
                SummaKarta(tr("F2 (tasdiqlangan)"), jami.f2, ustama, tayyor, kichik = true)
                SummaKarta(tr("Qoldiq"), jami.qoldiq, ustama, tayyor, kichik = true)
            }
            Column {
                Text(tr("Smetada yo‘q ishlar").uppercase() + ": ${y.yangiSoni}", style = Q.type.labelSmall, color = c.textMute, fontWeight = FontWeight.SemiBold)
                if (y.yangiSoni > 0) SummaKarta(tr("Smetada yo‘q ishlar"), SummaKesim(y.yangiUstamasiz, y.yangiKesim), ustama, tayyor, kichik = true, tafsilBilan = false)
            }
            Column {
                Text(tr("Bajarilmaydi").uppercase() + ": ${y.bajarilmadiSoni}", style = Q.type.labelSmall, color = c.textMute, fontWeight = FontWeight.SemiBold)
                if (y.bajarilmadiSoni - y.bajarilmadiNarxsiz > 0) SummaKarta(tr("Bajarilmaydi"), SummaKesim(y.bajarilmadiUstamasiz, y.bajarilmadiKesim), ustama, tayyor, kichik = true, tafsilBilan = false)
                if (y.bajarilmadiNarxsiz > 0) Text(tr("narxi noma’lum: {n} ta", mapOf("n" to y.bajarilmadiNarxsiz)), style = Q.type.labelSmall, color = c.warn)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f))
            Text(tr("F2 davri"), style = Q.type.labelSmall, color = c.textMute)
            uz.anncorp.qurai.ui.components.QInput(oy, onOy, Modifier.width(120.dp), placeholder = "YYYY-MM")
            QButton(tr("Fakt bo‘yicha F2 qoralama") + " →", { onF2Qoralama(oy) }, kind = QButtonKind.Primary, enabled = Regex("^\\d{4}-\\d{2}$").matches(oy))
        }
        jami?.takeIf { it.qoshimcha.ustamasiz != null }?.let { j ->
            val smeta = j.smeta.ustamasiz; val qosh = j.qoshimcha.ustamasiz
            Text(tr("Nakopitelniy smeta ustuni") + " = " + tr("Smeta (asl)") + " " + money(smeta) + " + " + tr("qo‘shimcha va zamena qatorlari") + " (" + money(qosh) + ") = " + money(if (smeta != null && qosh != null) smeta + qosh else null) + " " + tr("(ustamasiz, QQS siz)"), style = Q.type.labelSmall, color = c.textMute)
        }
    }
}

/** «Chiziq = smeta 100%» and the four bar colours. */
@Composable
fun MeterLegenda() {
    val c = Q.colors
    @Composable fun kv(col: Color) = Box(Modifier.size(10.dp, 6.dp).background(col, Q.shape.small))
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(tr("Chiziq = smeta 100%"), style = Q.type.labelSmall, color = c.textDim, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) { kv(c.borderStrong); Text(tr("F2 da (tasdiqlangan)"), style = Q.type.labelSmall, color = c.textMute) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) { kv(c.accent); Text(tr("fakt, F2 ga hali olinmagan"), style = Q.type.labelSmall, color = c.textMute) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) { kv(c.accent.copy(alpha = 0.45f)); Text(tr("bugungi kiritma"), style = Q.type.labelSmall, color = c.textMute) }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) { kv(c.warn); Text(tr("smetadan oshdi"), style = Q.type.labelSmall, color = c.textMute) }
    }
}

internal fun foizBelgi(u: Double?): String = if (u == null) "" else "${Math.round(u * 100)}%"

/** The sections TREE (smeta file → section → sub-section, indented) with «N ish», the percent and the bar; collapse arrows for inner sections. */
@Composable
fun BolimDaraxtiPanel(
    bolimlar: List<JurnalBolim>, tanlangan: Long?, bolimsizSoni: Int, bolimsizTanlangan: Boolean, tugagan: Int, jami: Int,
    yopiq: Set<Long>, onYopiq: (Long) -> Unit, onTanla: (Long) -> Unit, onBolimsiz: () -> Unit, modifier: Modifier = Modifier, onYig: (() -> Unit)? = null,
) {
    val c = Q.colors
    val bolali = remember(bolimlar) { bolimlar.mapNotNull { it.otaId }.toSet() }
    val korinadi = remember(bolimlar, yopiq) {
        val byId = bolimlar.associateBy { it.id }
        bolimlar.filter { b -> var p = b.otaId; var ok = true; while (p != null) { if (p in yopiq) { ok = false; break }; p = byId[p]?.otaId }; ok }
    }
    Column(modifier.background(c.surface, Q.shape.medium)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(tr("Bo‘limlar").uppercase(), Modifier.weight(1f), style = Q.type.labelSmall, color = c.textMute, fontWeight = FontWeight.SemiBold)
            Text(tr("{a} / {b} tugagan", mapOf("a" to tugagan, "b" to jami)), style = Q.type.labelSmall, color = c.textMute)
            if (onYig != null) Text("  ◀", Modifier.clickable { onYig() }.padding(4.dp), style = Q.type.bodySmall, color = c.textDim)
        }
        LazyColumn(Modifier.weight(1f)) {
            items(korinadi, key = { it.id }) { b ->
                val sel = b.id == tanlangan
                Row(Modifier.fillMaxWidth().background(if (sel) c.accentSoft else Color.Transparent).padding(start = (4 + b.daraja * 14).dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (b.id in bolali) Text(if (b.id in yopiq) "▸" else "▾", Modifier.width(17.dp).clickable { onYopiq(b.id) }, style = Q.type.bodySmall, color = c.textMute) else Box(Modifier.width(17.dp))
                    Column(Modifier.weight(1f).clickable { onTanla(b.id) }.padding(vertical = 5.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(b.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = if (sel || b.daraja == 0) c.text else c.textDim, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(tr("{n} ish", mapOf("n" to b.ishSoni)), style = Q.type.labelSmall, color = c.textMute)
                            Text("  " + foizBelgi(b.ulush), style = Q.type.labelSmall, color = c.textDim, fontWeight = FontWeight.SemiBold)
                        }
                        Meter(b.ulush)
                    }
                }
            }
            if (bolimsizSoni > 0) item {
                Text(tr("Bo‘limsiz") + " · " + tr("{n} ish", mapOf("n" to bolimsizSoni)), Modifier.fillMaxWidth().background(if (bolimsizTanlangan) c.accentSoft else Color.Transparent).clickable { onBolimsiz() }.padding(horizontal = 24.dp, vertical = 8.dp), style = Q.type.bodySmall, color = if (bolimsizTanlangan) c.text else c.textDim)
            }
        }
    }
}

/** The in-table section header row: name, «N ish», the percent bar, the four cards (SMETA / F2 / FAKT / F2 QOLDIQ) and «Qamrov %». */
@Composable
fun BolimBlokSarlavha(b: JurnalBolim, nisbiy: Int, s: BolimSumma?, ustama: UstamaMalumot?, tayyor: Boolean, onOchish: () -> Unit, onQamrov: () -> Unit) {
    val c = Q.colors
    Row(Modifier.fillMaxWidth().fillMaxHeight().background(c.surface2).padding(start = (12 + (nisbiy - 1).coerceAtLeast(0) * 16).dp, end = 12.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.widthIn(min = 200.dp, max = 300.dp).clickable { onOchish() }) {
            Text(b.nom, style = Q.type.bodyMedium, color = c.accentText, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(tr("{n} ish", mapOf("n" to b.ishSoni)), style = Q.type.labelSmall, color = c.textMute); Text(foizBelgi(b.ulush), style = Q.type.labelSmall, color = c.textDim, fontWeight = FontWeight.SemiBold)
            }
            Box(Modifier.width(140.dp)) { Meter(b.ulush) }
        }
        if (s != null) {
            SummaKarta(tr("Smeta"), s.smeta, ustama, tayyor, Modifier.width(150.dp), kichik = true, tafsilBilan = false)
            SummaKarta(tr("F2"), s.f2, ustama, tayyor, Modifier.width(150.dp), kichik = true, tafsilBilan = false)
            SummaKarta(tr("Fakt"), s.fakt, ustama, tayyor, Modifier.width(150.dp), kichik = true, tafsilBilan = false)
            SummaKarta(tr("F2 qoldiq"), s.qoldiq, ustama, tayyor, Modifier.width(150.dp), kichik = true, tafsilBilan = false)
        }
        QButton(tr("Qamrov %"), onQamrov, kind = QButtonKind.Secondary)
    }
}

/** «Klaviatura ?»: the journal's keys. */
@Composable
fun KlaviaturaYordam(onYop: () -> Unit) {
    Dialog(onDismissRequest = onYop, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.widthIn(max = 520.dp).fillMaxWidth(0.5f).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(tr("Klaviatura tugmalari"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            listOf(
                "Ctrl+S" to tr("Saqlash"), "Ctrl+F" to tr("Qidirish"), "Ctrl+Z" to tr("Orqaga (ommaviy kiritma)"), "Shift+F" to tr("Fakt = F2 (butun obyekt)"), "F" to tr("Fakt = F2 (tanlangan bo‘lim)"),
                "%" to tr("Qamrov % (tanlangan bo‘lim)"), "Ctrl+B" to tr("Bajarilmaydi / qilib bo‘lmaydi"), "Alt+1…4" to tr("Holat filtri"), "↑ ↓ PgUp PgDn" to tr("Qatorlar bo‘ylab"), "F2 / Enter" to tr("Katakni tahrirlash"), "Esc" to tr("Yopish"),
            ).forEach { (k, v) -> Row { Text(k, Modifier.width(150.dp), style = Q.type.bodySmall, color = Q.colors.accentText, fontWeight = FontWeight.SemiBold); Text(v, style = Q.type.bodySmall, color = Q.colors.text) } }
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) { QButton(tr("Yopish"), onYop, kind = QButtonKind.Primary) }
        }
    }
}
