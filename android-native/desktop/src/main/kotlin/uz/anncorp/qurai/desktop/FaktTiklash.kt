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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.SummaKesim
import uz.anncorp.smeta.core.fakt.TiklashSatr
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.faktKeyin
import uz.anncorp.smeta.core.fakt.qamrovBolaklari
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.fakt.tiklashJami
import uz.anncorp.smeta.core.fakt.tiklashSarlavha
import uz.anncorp.smeta.core.i18n.SiteI18n
import java.util.UUID

/*
 * "Fakt tiklash" = the site's FaktTiklash.tsx: evidence-based proposals (approved F2 ticked by default, draft F2 not), ONE confirmation, the same chunked fakt_yoz_v2 write as
 * "Fakt = F2" (delta only, one operation id per chunk reused on retry). NOT ported yet: the per-company summary ("Kompaniya bo'yicha") and the persisted attempt store.
 */

private const val KORSAT_CHEGARA = 400

@Composable
fun FaktTiklashDialog(
    c: Ctx, obyektId: Long, sana: String, obyektNom: String, satrlar: List<TiklashSatr>, fakt: SummaKesim?, f2: SummaKesim?, ustama: UstamaMalumot?, ustamaTayyor: Boolean,
    onYop: () -> Unit, onBajarildi: () -> Unit,
) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var tanlangan by remember { mutableStateOf(satrlar.filter { it.manba == "f2" }.map { it.kalit }.toSet()) }
    val jami = remember(satrlar, tanlangan) { tiklashJami(satrlar, tanlangan) }
    val keyin = remember(fakt, jami) { faktKeyin(fakt?.ustamasiz, fakt?.kesim, jami.umumiy) }
    var band by remember { mutableStateOf(false) }
    var urinish by remember { mutableStateOf<List<Pair<List<FaktF2PaketQator>, String>>?>(null) }
    var tasdiqlangan by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var xato by remember { mutableStateOf<String?>(null) }
    var tasdiqKerak by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val f2Satrlar = remember(satrlar) { satrlar.filter { it.manba == "f2" } }
    val qorSatrlar = remember(satrlar) { satrlar.filter { it.manba == "qoralama" } }
    val yozMumkin = !band && (urinish != null || jami.paket.isNotEmpty())

    fun yoz() {
        if (band) return
        if (urinish == null && !tasdiqKerak) { tasdiqKerak = true; return }
        val u = urinish ?: qamrovBolaklari(jami.paket).map { it to UUID.randomUUID().toString() }.also { urinish = it }
        if (u.isEmpty()) return
        tasdiqKerak = false; band = true; xato = null
        val izoh = tiklashSarlavha(obyektNom, jami.hujjatlar)
        scope.launch {
            var hammasi = true
            for ((i, b) in u.withIndex()) {
                if (i in tasdiqlangan) continue
                val r = c.sv.api.bff("/api/sb-yoz", "POST", tenglashPayload(c.place.companyId, obyektId, sana, b.first, b.second, "Fakt tiklash: $izoh".take(480)))
                val out = parseFaktResult(r.body)
                if (out?.ok == true) tasdiqlangan = tasdiqlangan + i else { hammasi = false; xato = if (r.networkError) Tx.offlineWrite else (out?.error ?: r.code ?: "HTTP ${r.status}"); break }
            }
            band = false
            if (hammasi) onBajarildi()
        }
    }

    @Composable
    fun jadval(royxat: List<TiklashSatr>, nomi: String) {
        if (royxat.isEmpty()) return
        val hammasi = royxat.all { it.kalit in tanlangan }
        val tahrir = urinish == null
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(hammasi, { yoq -> if (tahrir) tanlangan = if (yoq) tanlangan + royxat.map { it.kalit } else tanlangan - royxat.map { it.kalit }.toSet() }, enabled = tahrir)
            Text(nomi, style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold); Text(" (${royxat.size})", style = Q.type.bodySmall, color = Q.colors.textMute)
        }
        Row(Modifier.padding(vertical = 2.dp)) {
            Text(t("Qator"), Modifier.weight(1f).padding(start = 40.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Fakt hozir"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
            Text(t("Taklif"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Farq"), Modifier.width(110.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
            Text(t("Manba hujjat"), Modifier.width(170.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Pul ta’siri"), Modifier.width(140.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
        }
        royxat.take(KORSAT_CHEGARA).forEach { s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(s.kalit in tanlangan, { if (tahrir) tanlangan = if (s.kalit in tanlangan) tanlangan - s.kalit else tanlangan + s.kalit }, enabled = tahrir)
                Text(s.nom + (if (s.tur == "ob") " · " + t("uskuna") else if (s.tur == "mat") " · " + t("material") else if (s.tur == "rs") " · " + t("mehnat/mashina") else ""), Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(qty(s.fakt), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(s.keyin), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                Text((if (s.delta > 0) "+" else "") + qty(s.delta) + " " + (s.birlik ?: ""), Modifier.width(110.dp), style = Q.type.bodySmall, color = if (s.delta < 0) Q.colors.warn else Q.colors.text, fontWeight = FontWeight.SemiBold)
                Text(s.hujjat, Modifier.width(170.dp), style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(money(s.summa), Modifier.width(140.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
            }
        }
        if (royxat.size > KORSAT_CHEGARA) Text(t("yana {n} ta qator", mapOf("n" to (royxat.size - KORSAT_CHEGARA))), style = Q.type.labelSmall, color = Q.colors.textMute)
    }

    Dialog(onDismissRequest = { if (!band) onYop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 1060.dp).fillMaxWidth(0.84f).heightIn(max = 780.dp).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(t("Fakt tiklash"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            Text(obyektNom, style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 1)
            Text(t("Dalil: hujjatda fakt dan ko‘p ish bor qatorlar. Qatorlarni belgilang va bitta bosishda yozing — bu qo‘lda amal. Fakt to‘qilmaydi: faqat farq (delta) yoziladi, tasdiqlangan F2 o‘zgarmaydi."), style = Q.type.labelSmall, color = Q.colors.textDim)
            FlowRow(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SummaUchlik(t("Fakt hozir"), fakt ?: SummaKesim(), ustama, ustamaTayyor) { k -> t(k) }
                SummaUchlik(t("Keyin"), keyin, ustama, ustamaTayyor) { k -> t(k) }
                SummaUchlik("F2", f2 ?: SummaKesim(), ustama, ustamaTayyor) { k -> t(k) }
                Text("${jami.paket.size} " + t("qator yoziladi") + " · " + t("tasdiqlangan F2: {n}", mapOf("n" to jami.f2.soni)) + " · " + t("qoralama: {n}", mapOf("n" to jami.qoralama.soni)) +
                    (if (jami.umumiy.narxsiz > 0) " · " + t("summa noma’lum: {n} qator", mapOf("n" to jami.umumiy.narxsiz)) else "") + (if (jami.manfiySoni > 0) " · " + t("minus qatorlar: {n}", mapOf("n" to jami.manfiySoni)) else ""), style = Q.type.labelSmall, color = Q.colors.textDim)
            }
            LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = 380.dp)) {
                if (satrlar.isEmpty()) item { Text(t("Fakt dalildan kam emas — qo‘shiladigan hajm yo‘q."), style = Q.type.bodyMedium, color = Q.colors.textDim) }
                else {
                    item { jadval(f2Satrlar, t("Tasdiqlangan F2 (kuchli dalil)")) }
                    item { jadval(qorSatrlar, t("Qoralama F2 (kuchsizroq dalil — tasdiqlanmagan)")) }
                }
            }
            if (tasdiqKerak) QNote(t("{n} qator faktga yoziladi (hujjatlar: {h}). Tasdiqlangan F2 o‘zgarmaydi.", mapOf("n" to jami.paket.size, "h" to jami.hujjatlar.joinToString("; "))) +
                (if (jami.qoralama.soni > 0) "\n" + t("Shundan {n} qator qoralama F2 asosida — bu kuchsizroq dalil (qoralama hali tasdiqlanmagan).", mapOf("n" to jami.qoralama.soni)) else "") + "\n" + t("Davom etilsinmi?"), tone = QTone.Warn)
            xato?.let { QNote(it, tone = QTone.Danger) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("Sana") + ": " + sana, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textMute)
                QButton(t("Bekor"), onYop, kind = QButtonKind.Ghost, enabled = !band)
                QButton(if (band) t("Yozilmoqda…") else if (urinish != null) t("Faktga yozish — qayta yuborish (bir xil ID)") else t("Faktga yozish ({n})", mapOf("n" to jami.paket.size)), { yoz() }, kind = QButtonKind.Primary, enabled = yozMumkin, loading = band)
            }
        }
    }
}
