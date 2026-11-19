@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.fakt.HOLAT_MUHR
import uz.anncorp.smeta.core.fakt.HOLAT_TARTIB
import uz.anncorp.smeta.core.fakt.HolatTur
import uz.anncorp.smeta.core.fakt.JurnalMalumot
import uz.anncorp.smeta.core.fakt.JurnalXulosa
import uz.anncorp.smeta.core.fakt.ObyektUlushi
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.bajarilishTahlili
import uz.anncorp.smeta.core.fakt.bajarilmadiHajmlar
import uz.anncorp.smeta.core.fakt.bajarilmadiRoyxatSoro
import uz.anncorp.smeta.core.fakt.foizMatn
import uz.anncorp.smeta.core.fakt.parseBajarilmadiRoyxat
import uz.anncorp.smeta.core.fakt.tahlilUsulMatnKalit
import uz.anncorp.smeta.core.i18n.SiteI18n

/*
 * "Bajarilish tahlili" = the site's FaktXulosaPanel (components/fakt/FaktKorinish.tsx) behind the collapsible of FaktJurnal: the object's completion, the finished sections and the works by
 * status. All numbers come from the ported rules (core.fakt.bajarilishTahlili); the panel is also exported so the page can show it inline.
 */

@Composable
private fun holatRangi(h: HolatTur): Color = when (h) {
    HolatTur.Tugadi -> Q.colors.ok; HolatTur.Qisman -> Q.colors.info; HolatTur.Yangi -> Q.colors.surface3; HolatTur.Oshdi -> Q.colors.warn; HolatTur.Smetasiz -> Q.colors.borderStrong
}

/** The panel: three cells (Obyekt bajarilishi / Bo'limlar / Ishlar holati). */
@Composable
fun FaktXulosaPanel(x: JurnalXulosa, obyekt: ObyektUlushi, modifier: Modifier = Modifier) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    @Composable
    fun katak(sarlavha: String, izoh: String?, modifier: Modifier, content: @Composable () -> Unit) {
        Column(modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(sarlavha.uppercase(), style = Q.type.labelSmall, color = Q.colors.textMute, fontWeight = FontWeight.SemiBold)
            content()
            if (izoh != null) Text(izoh, style = Q.type.labelSmall, color = Q.colors.textMute)
        }
    }
    Row(modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).border(BorderStroke(1.dp, Q.colors.border), Q.shape.medium)) {
        katak(t("Obyekt bajarilishi"), t(tahlilUsulMatnKalit(obyekt)), Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (obyekt.ulush == null) "—" else foizMatn(obyekt.ulush!! * 100), style = Q.type.titleLarge, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                Box(Modifier.weight(1f)) { TahlilMeter(obyekt.ulush) }
            }
        }
        katak(t("Bo‘limlar"), t("yuqori darajadagi bo‘limlar"), Modifier.weight(0.7f)) {
            Text((if (x.bolimJami > 0 && x.bolimTugagan == x.bolimJami) "✓ " else "") + t("{a} / {b} tugagan", mapOf("a" to x.bolimTugagan, "b" to x.bolimJami)), style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
        }
        katak(t("Ishlar holati"), t("Jami {n} ish (ish va alohida resurslar)", mapOf("n" to x.ishJami)), Modifier.weight(1.6f)) {
            val holatlar = HOLAT_TARTIB.filter { (x.ishlar[it] ?: 0) > 0 }
            if (x.ishJami > 0) Row(Modifier.fillMaxWidth().height(8.dp).background(Q.colors.surface2, Q.shape.small)) {
                holatlar.forEach { h -> Box(Modifier.weight((x.ishlar[h] ?: 1).toFloat()).fillMaxHeight().background(holatRangi(h))) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                HOLAT_TARTIB.forEach { h ->
                    if (h == HolatTur.Smetasiz && (x.ishlar[h] ?: 0) == 0) return@forEach
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(10.dp).background(holatRangi(h), Q.shape.small))
                        Text(t(HOLAT_MUHR.getValue(h)) + " " + (x.ishlar[h] ?: 0), style = Q.type.bodySmall, color = Q.colors.textDim)
                    }
                }
            }
        }
    }
}

/** The section/object bar (site BolimMeter): done = green. */
@Composable
private fun TahlilMeter(ulush: Double?) {
    val f = (ulush ?: 0.0).coerceIn(0.0, 1.0).toFloat()
    Box(Modifier.fillMaxWidth().height(6.dp).background(Q.colors.surface3, Q.shape.small)) {
        Box(Modifier.fillMaxWidth(f).fillMaxHeight().background(if ((ulush ?: 0.0) >= 1.0 - 1e-9) Q.colors.ok else Q.colors.accent, Q.shape.small))
    }
}

@Composable
fun FaktBajarilishTahlilDialog(c: Ctx, obyektId: Long, d: JurnalMalumot, ustama: UstamaMalumot?, ustamaTayyor: Boolean, onYop: () -> Unit) {
    val lang = DesktopPrefs.lang
    fun t(k: String) = SiteI18n.t(k, lang)
    // The not-done marks (a taken-out resource leaves the section sum); unreadable -> computed without them (the same as an empty list).
    val baj by produceState<Map<Long, Double>?>(null, obyektId) {
        value = runCatching { parseBajarilmadiRoyxat(c.sv.api.bff("/api/sb", "POST", bajarilmadiRoyxatSoro(c.place.companyId, obyektId)).body) }.getOrNull()?.let(::bajarilmadiHajmlar) ?: emptyMap()
    }
    val tahlil = remember(d, baj, ustama?.svod) { baj?.let { bajarilishTahlili(d, it, ustama?.svod) } }
    Dialog(onDismissRequest = onYop, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 1000.dp).fillMaxWidth(0.8f).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(t("Bajarilish tahlili"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            if (tahlil == null || !ustamaTayyor) QLoading() else FaktXulosaPanel(tahlil.xulosa, tahlil.obyekt)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { QButton(t("Yopish"), onYop, kind = QButtonKind.Secondary) }
        }
    }
}
