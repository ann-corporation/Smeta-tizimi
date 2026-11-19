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
import uz.anncorp.smeta.core.fakt.EskiF2Akt
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.SummaKesim
import uz.anncorp.smeta.core.fakt.TenglashReja
import uz.anncorp.smeta.core.fakt.UstamaMalumot
import uz.anncorp.smeta.core.fakt.aktBekorPayload
import uz.anncorp.smeta.core.fakt.qamrovBolaklari
import uz.anncorp.smeta.core.fakt.tenglashJami
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.i18n.SiteI18n
import uz.anncorp.smeta.core.data.parseFaktResult
import java.util.UUID

/*
 * "Fakt = F2" preview + write = the site's FaktF2Tenglash.tsx (same texts, same exclusions by row / section, same one-confirmation write): the plan comes from the ported
 * faktF2Reja / obyektF2Reja; the write is fakt_yoz_v2 in chunks, ONE operation id per chunk reused on every retry (the server never writes a chunk twice).
 * NOT ported yet: the persisted attempt/receipt store of the site (lib/fakt-qamrov-urinish) - here a retry works while the dialog stays open.
 */

private const val KORSAT_CHEGARA = 300

@Composable
fun FaktTenglashDialog(
    c: Ctx, obyektId: Long, sana: String, sarlavha: String, reja: TenglashReja, eskiAktlar: List<EskiF2Akt>, ustama: UstamaMalumot?, ustamaTayyor: Boolean,
    onYop: () -> Unit, onBajarildi: () -> Unit,
) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var chiqQator by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var chiqBolim by remember { mutableStateOf<Set<String>>(emptySet()) }
    val jami = remember(reja, chiqQator, chiqBolim) { tenglashJami(reja, chiqQator, chiqBolim) }
    var band by remember { mutableStateOf(false) }
    var urinish by remember { mutableStateOf<List<Pair<List<FaktF2PaketQator>, String>>?>(null) }
    var tasdiqlangan by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var xato by remember { mutableStateOf<String?>(null) }
    var eskiBand by remember { mutableStateOf(false) }
    var eskiTasdiq by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val bolimli = jami.bolimlar.size > 1 || (jami.bolimlar.firstOrNull()?.nom ?: "") != ""
    val korinadi = remember(reja, chiqBolim) { reja.qatorlar.filter { (it.bolim ?: "") !in chiqBolim } }
    val yozMumkin = !band && (urinish != null || jami.paket.isNotEmpty())

    fun yoz() {
        if (band) return
        val u = urinish ?: qamrovBolaklari(jami.paket).map { it to UUID.randomUUID().toString() }.also { urinish = it }
        if (u.isEmpty()) return
        band = true; xato = null
        scope.launch {
            var hammasi = true
            for ((i, b) in u.withIndex()) {
                if (i in tasdiqlangan) continue
                val r = c.sv.api.bff("/api/sb-yoz", "POST", tenglashPayload(c.place.companyId, obyektId, sana, b.first, b.second, "Fakt = F2"))
                val out = parseFaktResult(r.body)
                if (out?.ok == true) tasdiqlangan = tasdiqlangan + i
                else { hammasi = false; xato = if (r.networkError) Tx.offlineWrite else (out?.error ?: r.code ?: "HTTP ${r.status}"); break }
            }
            band = false
            if (hammasi) onBajarildi()
        }
    }

    fun eskiniBekorQil() {
        if (eskiBand) return
        eskiBand = true; xato = null
        scope.launch {
            var ok = true
            for (a in eskiAktlar) {
                val r = c.sv.api.bff("/api/sb-yoz", "POST", aktBekorPayload(a.id))
                val out = parseFaktResult(r.body)
                if (out?.ok != true) { ok = false; xato = out?.error ?: t("Bekor qilinmadi."); break }
            }
            eskiBand = false
            if (ok) onBajarildi()
        }
    }

    Dialog(onDismissRequest = { if (!band) onYop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 980.dp).fillMaxWidth(0.82f).heightIn(max = 760.dp).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(t("Fakt = F2") + " · " + sarlavha, style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            if (eskiAktlar.isNotEmpty()) Column(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(t("Oldin smeta narxida yozilgan «Fakt = F2» hujjatlari bor: {n} ta — ularning qatorlari F2 narxiga o‘tmaydi.", mapOf("n" to eskiAktlar.size)), style = Q.type.bodySmall, color = Q.colors.text)
                Text(eskiAktlar.joinToString("\n") { "№${it.raqam ?: it.id}" + (it.sana?.let { s -> " ($s)" } ?: "") + (it.jami?.let { j -> " — " + money(j) } ?: "") }, style = Q.type.labelSmall, color = Q.colors.textDim)
                if (eskiTasdiq) Text(t("Quyidagi {n} ta «Fakt = F2» hujjati bekor qilinsinmi? Keyin «Fakt = F2» ni qayta oching — F2 narxida yoziladi.", mapOf("n" to eskiAktlar.size)), style = Q.type.labelSmall, color = Q.colors.warn)
                QButton(t("Bekor qilib qayta yozish"), { if (eskiTasdiq) eskiniBekorQil() else eskiTasdiq = true }, kind = QButtonKind.Danger, enabled = !eskiBand && !band, loading = eskiBand)
            }
            if (reja.qatorlar.isEmpty()) Text(t("Fakt allaqachon F2 ga teng yoki undan ko‘p — qo‘shiladigan hajm yo‘q."), style = Q.type.bodyMedium, color = Q.colors.textDim)
            else {
                Text(t("Tasdiqlangan F2 qatorlari ishorasi, hajmi va narxi bilan aynan ko‘chiriladi (minus qatorlar ham). Fakt F2 dan oshgan qatorlar o‘zgarmaydi."), style = Q.type.labelSmall, color = Q.colors.textDim)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${jami.paket.size} " + t("qator yoziladi"), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                    SummaUchlik(t("Summa"), SummaKesim(jami.ustamasiz, jami.kesim), ustama, ustamaTayyor) { k -> t(k) }
                    Text(t("F2 narxi: {n} qator", mapOf("n" to jami.f2Narxli)) + " · " + t("smeta narxi: {n} qator", mapOf("n" to jami.smetaNarxli)) + " · " + t("narxsiz: {n} qator", mapOf("n" to jami.narxsiz)) +
                        (if (jami.qisman > 0) " · " + t("qisman narxli F2: {n} qator", mapOf("n" to jami.qisman)) else ""), style = Q.type.labelSmall, color = Q.colors.textDim)
                    if (jami.narxsiz > 0) Text(t("summa noma’lum: {n} qator", mapOf("n" to jami.narxsiz)), style = Q.type.labelSmall, color = Q.colors.warn)
                    if (jami.rsHosila.soni > 0) Text(t("Mehnat/mashina: F2 da yo‘q {n} qator norma bo‘yicha smeta narxida ergashadi ({s}) — summaga kirgan.", mapOf("n" to jami.rsHosila.soni, "s" to money(jami.rsHosila.summa))), style = Q.type.labelSmall, color = Q.colors.textMute)
                    if (jami.rsIstisno.soni > 0) Text(t("Istisno qilingan mehnat/mashina: {n} qator — F2 dan ko‘chirilgan ish ulushiga ergashmaydi, faktga tushmaydi ({s} jamiga kirmagan).", mapOf("n" to jami.rsIstisno.soni, "s" to money(jami.rsIstisno.summa))), style = Q.type.labelSmall, color = Q.colors.warn)
                    if (jami.nusxaSoni > 0) Text(t("1:1: {n} ta F2 satri → {n} ta fakt qatori (hajm, narx, summa aynan, manbasi bilan)", mapOf("n" to jami.nusxaSoni)), style = Q.type.labelSmall, color = Q.colors.textDim)
                    if (jami.manfiySoni > 0) Text(t("F2 dagi minus qatorlar: {n} — hujjatdagidek manfiy yoziladi.", mapOf("n" to jami.manfiySoni)), style = Q.type.labelSmall, color = Q.colors.textMute)
                    if (jami.faktOrtiqSoni > 0) Text(t("Fakt F2 dan ko‘p: {n} qator ({s}) — topshirilmagan ish, o‘zgartirilmaydi.", mapOf("n" to jami.faktOrtiqSoni, "s" to money(jami.faktOrtiqSumma))), style = Q.type.labelSmall, color = Q.colors.textMute)
                    if (reja.manfiyReja > 0) Text("${reja.manfiyReja} " + t("chegirma qatori o‘tkazib yuborildi"), style = Q.type.labelSmall, color = Q.colors.textMute)
                    if (chiqQator.isNotEmpty() || chiqBolim.isNotEmpty()) Text(t("olib tashlangan: {n}", mapOf("n" to (reja.qatorlar.size - jami.paket.size))), style = Q.type.labelSmall, color = Q.colors.textMute)
                    if (jami.paket.size > 1500) Text(t("{n} ta hujjatga bo‘linadi", mapOf("n" to qamrovBolaklari(jami.paket).size)), style = Q.type.labelSmall, color = Q.colors.textMute)
                }
                val tahrir = urinish == null
                if (bolimli) Column(Modifier.fillMaxWidth().heightIn(max = 150.dp)) {
                    Row(Modifier.padding(vertical = 2.dp)) { Text(t("Bo‘lim"), Modifier.weight(1f), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Qator"), Modifier.width(120.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Summa"), Modifier.width(160.dp), style = Q.type.labelSmall, color = Q.colors.textMute) }
                    LazyColumn { items(jami.bolimlar, key = { it.nom }) { b ->
                        val chiq = b.nom in chiqBolim
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(!chiq, { if (tahrir) chiqBolim = if (chiq) chiqBolim - b.nom else chiqBolim + b.nom }, enabled = tahrir)
                            Text(b.nom.ifEmpty { t("Bo‘limsiz") }, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${b.soni}" + if (b.narxsiz > 0) " · " + t("narxsiz") + " ${b.narxsiz}" else "", Modifier.width(120.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                            Text(money(b.ustamasiz), Modifier.width(160.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                        }
                    } }
                }
                Column(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(max = 300.dp)) {
                    Row(Modifier.padding(vertical = 2.dp)) {
                        Text(t("Qator"), Modifier.weight(1f).padding(start = 40.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Fakt"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                        Text("F2", Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Qo‘shiladi"), Modifier.width(120.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Summa"), Modifier.width(140.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                    }
                    LazyColumn { items(korinadi.take(KORSAT_CHEGARA), key = { it.id }) { q ->
                        val chiq = q.id in chiqQator
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(!chiq, { if (tahrir) chiqQator = if (chiq) chiqQator - q.id else chiqQator + q.id }, enabled = tahrir)
                            Text(q.nom + (if (q.tur == "ob") " · " + t("uskuna") else if (q.tur == "mat") " · " + t("material") else "") +
                                (if (!q.nusxa.isNullOrEmpty()) " · " + t("{n} ta F2 satri", mapOf("n" to (q.nusxa?.size ?: 0))) else if (q.avtomatik > 0) " · +${q.avtomatik} " + t("mehnat/mashina avtomatik") else ""),
                                Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(qty(q.fakt), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(q.f2), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                            Text("+" + qty(q.delta) + " " + (q.birlik ?: ""), Modifier.width(120.dp), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                            Text(money(q.summa) + if (q.narxManba == "f2") "  F2" else "", Modifier.width(140.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                        }
                    } }
                    if (korinadi.size > KORSAT_CHEGARA) Text(t("yana {n} ta qator — bo‘lim jadvali bilan boshqaring", mapOf("n" to (korinadi.size - KORSAT_CHEGARA))), style = Q.type.labelSmall, color = Q.colors.textMute)
                }
            }
            xato?.let { QNote(it, tone = QTone.Danger) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("Sana") + ": " + sana, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textMute)
                QButton(t("Bekor"), onYop, kind = QButtonKind.Ghost, enabled = !band)
                QButton(
                    if (band) t("Yozilmoqda…") else if (urinish != null) t("Faktga yozish — qayta yuborish (bir xil ID)") else t("Faktga yozish ({n})", mapOf("n" to jami.paket.size)),
                    { yoz() }, kind = QButtonKind.Primary, enabled = yozMumkin, loading = band,
                )
            }
        }
    }
}
