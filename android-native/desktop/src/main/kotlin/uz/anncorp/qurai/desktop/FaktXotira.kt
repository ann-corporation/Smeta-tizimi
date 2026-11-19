@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.JurnalMalumot
import uz.anncorp.smeta.core.fakt.SavatQator
import uz.anncorp.smeta.core.fakt.XotiraHolatTuri
import uz.anncorp.smeta.core.fakt.XotiraNatija
import uz.anncorp.smeta.core.fakt.XotiraNomzod
import uz.anncorp.smeta.core.fakt.miqdorBoshlang
import uz.anncorp.smeta.core.fakt.nomzodHajmi
import uz.anncorp.smeta.core.fakt.numStr
import uz.anncorp.smeta.core.fakt.qatorlarniOqi
import uz.anncorp.smeta.core.fakt.savatHajmi
import uz.anncorp.smeta.core.fakt.savatJami
import uz.anncorp.smeta.core.fakt.savatPaketi
import uz.anncorp.smeta.core.fakt.savatdanOlish
import uz.anncorp.smeta.core.fakt.savatgaQosh
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.fakt.ustamaOqi
import uz.anncorp.smeta.core.fakt.xotiraIndeks
import uz.anncorp.smeta.core.fakt.xotiraMosla
import uz.anncorp.smeta.core.fakt.xotiraQidiruv
import uz.anncorp.smeta.core.i18n.SiteI18n
import java.time.LocalDate
import java.util.UUID

/*
 * «Xotiradan» tab of the Fakt page = the site's XotiradanFakt.tsx: free text (one job per line) -> candidates from the WHOLE estimate -> the owner picks -> the fakt basket
 * (a work brings its mat/ob resources by norm) -> ONE fakt_yoz_v2 document. All rules are the ported lib/xotira-fakt (Xotira.kt). Volume is never blocked.
 * NOT ported: «Boshqa joydan olish» (copy a row from another section/object as an additional row) and the catalogue add: both need the IshAbc modal flow.
 */

private data class QatorUI(val aktiv: Int = 0, val miqdor: String = "", val qidiruv: String = "", val qoshildi: Boolean = false)

@Composable
fun FaktXotiradanScreen(c: Ctx, obyektId: Long, d: JurnalMalumot, onChanged: () -> Unit) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var matn by remember(obyektId) { mutableStateOf("") }
    var natijalar by remember(obyektId) { mutableStateOf<List<XotiraNatija>>(emptyList()) }
    var ui by remember(obyektId) { mutableStateOf<Map<Int, QatorUI>>(emptyMap()) }
    var aktivQator by remember(obyektId) { mutableStateOf(0) }
    var savat by remember(obyektId) { mutableStateOf<List<SavatQator>>(emptyList()) }
    var saqlanmoqda by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<Pair<String, QTone>?>(null) }
    var operationId by remember(obyektId) { mutableStateOf(UUID.randomUUID().toString()) }
    val scope = rememberCoroutineScope()
    val ind = remember(d) { xotiraIndeks(d.rows, d.states) }
    val summalar = remember(d) { d.states.associate { it.qatorId to it.smetaSumma } }
    val summa: (Long) -> Double? = { summalar[it] }
    // The object's markup coefficients (contract); unreadable -> only the direct total (never a guessed markup).
    val nk by produceState<Map<String, Double?>?>(null, obyektId) { value = runCatching { ustamaOqi(c.sv.api, c.place.companyId, obyektId)?.koef }.getOrNull() }
    val jami = remember(savat, nk) { savatJami(savat, nk) }

    fun ol(id: Int) = ui[id] ?: QatorUI()
    fun yangila(id: Int, f: (QatorUI) -> QatorUI) { ui = ui + (id to f(ol(id))) }

    fun moslash() {
        val n = xotiraMosla(qatorlarniOqi(matn), ind, 5)
        natijalar = n
        ui = n.associate { it.qator.id to QatorUI(0, miqdorBoshlang(it.qator), "", false) }
        aktivQator = 0; msg = null
    }

    /** The row's candidates: a manual search wins over the automatic match. */
    fun nomzodlar(x: XotiraNatija): List<XotiraNomzod> { val s = ol(x.qator.id).qidiruv; return if (s.trim().length >= 2) xotiraQidiruv(ind, s, 5) else x.nomzodlar }

    fun keyingiHalQilinmagan(dan: Int): Int {
        for (k in 1..natijalar.size) { val i = (dan + k) % natijalar.size; if (!ol(natijalar[i].qator.id).qoshildi) return i }
        return dan
    }

    fun qosh(qi: Int, ni: Int? = null): Boolean {
        val x = natijalar.getOrNull(qi) ?: return false
        val u = ol(x.qator.id); val nz = nomzodlar(x).getOrNull(ni ?: u.aktiv) ?: return false
        val h = nomzodHajmi(x.qator, nz, u.miqdor)
        if (h == null || h == 0.0) { msg = t("Miqdorni kiriting: son, foiz yoki “hammasi”.") to QTone.Warn; return false }
        savat = savatgaQosh(savat, d.rows, nz, h, if (u.qidiruv.isNotBlank()) "qidiruv" else "matn", summa)
        yangila(x.qator.id) { it.copy(qoshildi = true) }
        aktivQator = keyingiHalQilinmagan(qi); msg = null
        return true
    }

    fun saqla() {
        val paket = savatPaketi(savat)
        if (paket.isEmpty() || saqlanmoqda) return
        saqlanmoqda = true; msg = null
        scope.launch {
            val r = c.sv.api.bff("/api/sb-yoz", "POST", tenglashPayload(c.place.companyId, obyektId, LocalDate.now().toString(), paket.map { FaktF2PaketQator(it.qatorId, it.hajm) }, operationId, "Xotiradan fakt: ${paket.size} qator"))
            val out = parseFaktResult(r.body)
            if (out?.ok == true) {
                msg = t("Fakt saqlandi: {n} qator.", mapOf("n" to paket.size)) to QTone.Ok
                operationId = UUID.randomUUID().toString(); savat = emptyList(); natijalar = emptyList(); ui = emptyMap(); matn = ""
                onChanged()
            } else msg = (if (r.networkError) Tx.offlineWrite else (out?.error ?: r.code ?: t("Fakt saqlanmadi."))) to QTone.Danger
            saqlanmoqda = false
        }
    }

    Column(Modifier.fillMaxSize().onPreviewKeyEvent { e ->
        if (e.type == KeyEventType.KeyDown && e.isCtrlPressed && e.key == Key.Enter) { moslash(); true } else false
    }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        msg?.let { QNote(it.first, tone = it.second) }
        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // ---- left: text, matching, candidates ----
            Column(Modifier.weight(1f).fillMaxHeight().background(Q.colors.surface, Q.shape.medium).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                QInput(matn, { matn = it }, Modifier.fillMaxWidth(), label = t("Bajarilgan ishlar (har qator — bitta ish)"), placeholder = t("masalan: kanal tubiga beton 120 m3"), singleLine = false, minLines = 5, maxLines = 8)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QButton(t("Smetaga moslash"), { moslash() }, kind = QButtonKind.Primary, enabled = matn.isNotBlank(), icon = QIcons.Search)
                    Text(t("Ctrl+Enter — moslash; ? — tugmalar ro‘yxati"), style = Q.type.labelSmall, color = Q.colors.textMute, modifier = Modifier.weight(1f))
                    if (natijalar.isNotEmpty()) Text(t("{a} / {b} qator savatda", mapOf("a" to natijalar.count { ol(it.qator.id).qoshildi }, "b" to natijalar.size)), style = Q.type.bodySmall, color = Q.colors.textDim)
                }
                if (natijalar.isEmpty()) Text(t("Bajarilgan ishlarni yozing va “Smetaga moslash” ni bosing: har qator uchun obyekt smetasining hamma bo‘limlaridan nomzodlar chiqadi."), style = Q.type.bodySmall, color = Q.colors.textMute)
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(natijalar, key = { _, x -> x.qator.id }) { qi, x ->
                        val u = ol(x.qator.id); val nz = nomzodlar(x); val faol = qi == aktivQator
                        val holat = if (nz.isEmpty()) XotiraHolatTuri.Topilmadi else x.holat
                        val belgi = when (holat) { XotiraHolatTuri.Aniq -> t("Aniq moslik") to Q.colors.ok; XotiraHolatTuri.Taklif -> t("Taklif: tanlang") to Q.colors.warn; XotiraHolatTuri.Topilmadi -> t("Smetadan topilmadi") to Q.colors.danger }
                        Column(
                            Modifier.fillMaxWidth().border(1.dp, if (faol) Q.colors.accent else Q.colors.border, Q.shape.medium).background(if (faol) Q.colors.accentSoft else Q.colors.surface, Q.shape.medium)
                                .clickable { aktivQator = qi }.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("●", color = belgi.second); Text(x.qator.xom, Modifier.weight(1f), style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(belgi.first, style = Q.type.labelSmall, color = belgi.second)
                                QInput(u.miqdor, { v -> yangila(x.qator.id) { it.copy(miqdor = v) } }, Modifier.width(150.dp), label = t("Miqdor"), placeholder = t("son, % yoki hammasi"))
                                if (u.qoshildi) Text(t("Savatda"), style = Q.type.labelSmall, color = Q.colors.ok)
                            }
                            if (holat == XotiraHolatTuri.Topilmadi || u.qidiruv.isNotEmpty())
                                QInput(u.qidiruv, { v -> yangila(x.qator.id) { it.copy(qidiruv = v, aktiv = 0) } }, Modifier.fillMaxWidth(), placeholder = t("Nom yoki kod bilan qidiring"), leading = QIcons.Search)
                            nz.forEachIndexed { ni, n ->
                                val tanlangan = u.aktiv == ni; val h = nomzodHajmi(x.qator, n, u.miqdor)
                                Row(
                                    Modifier.fillMaxWidth().border(1.dp, if (tanlangan) Q.colors.accent else Q.colors.surface3, Q.shape.small).background(if (tanlangan) Q.colors.surface2 else Q.colors.surface, Q.shape.small)
                                        .clickable { aktivQator = qi; yangila(x.qator.id) { it.copy(aktiv = ni) } }.padding(8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(n.yol.ifEmpty { Tx.dash }, style = Q.type.labelSmall, color = Q.colors.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text((n.kod?.let { "$it " } ?: "") + n.nom, style = Q.type.bodySmall, color = Q.colors.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                            Text(t("Smeta") + ": " + qty(n.smetaHajm) + " " + (n.birlik ?: ""), style = Q.type.labelSmall, color = Q.colors.textDim)
                                            Text(t("Fakt") + ": " + qty(n.faktHajm), style = Q.type.labelSmall, color = Q.colors.textDim)
                                            Text(t("F2 da") + ": " + qty(n.f2Hajm), style = Q.type.labelSmall, color = Q.colors.textDim)
                                            Text(t("Qoldiq") + ": " + qty(n.qoldiq), style = Q.type.labelSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                                            if (n.birlikMos == false) Text(t("Birlik mos emas"), style = Q.type.labelSmall, color = Q.colors.warn)
                                            if (n.sigadi == false) Text("▲ " + t("Qoldiqdan oshadi"), style = Q.type.labelSmall, color = Q.colors.warn)
                                        }
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("${n.ball}%", style = Q.type.labelSmall, color = Q.colors.textDim)
                                        if (tanlangan && h != null) Text("+" + qty(h), style = Q.type.labelSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                                    }
                                    QButton(t("Qo‘shish"), { qosh(qi, ni) }, kind = QButtonKind.Secondary)
                                }
                            }
                            if (nz.isEmpty()) Text(t("Mos qator topilmadi — yuqoridagi qidiruv maydonidan foydalaning."), style = Q.type.labelSmall, color = Q.colors.textMute)
                        }
                    }
                }
            }
            // ---- right: the fakt basket ----
            Column(Modifier.width(400.dp).fillMaxHeight().background(Q.colors.surface, Q.shape.medium).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t("Fakt savati") + " (${savat.count { it.guruh == null }})", style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (savat.isEmpty()) item { Text(t("Savat bo‘sh. Ish tanlansa, uning materiallari ham norma bo‘yicha birga qo‘shiladi; mehnat va mashina avtomatik hisoblanadi."), style = Q.type.bodySmall, color = Q.colors.textMute) }
                    items(savat.filter { it.guruh == null }, key = { it.qatorId }) { x ->
                        Column(Modifier.fillMaxWidth().border(1.dp, Q.colors.border, Q.shape.small).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            SavatSatr(x, false, ::t, { h -> savat = savatHajmi(savat, d.rows, x.qatorId, h) }) { savat = savatdanOlish(savat, x.qatorId) }
                            savat.filter { it.guruh == x.qatorId }.forEach { ch -> Column(Modifier.padding(start = 14.dp)) { SavatSatr(ch, true, ::t, { h -> savat = savatHajmi(savat, d.rows, ch.qatorId, h) }, null) } }
                        }
                    }
                }
                Column(Modifier.fillMaxWidth().border(1.dp, Q.colors.surface3, Q.shape.small).padding(8.dp)) {
                    Row { Text(t("Jami, QQS bilan"), Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold); Text(money(jami.ustamali), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold) }
                    Row { Text(t("Ustamasiz"), Modifier.weight(1f), style = Q.type.labelSmall, color = Q.colors.textMute); Text(money(jami.asos), style = Q.type.labelSmall, color = Q.colors.textMute) }
                    if (jami.narxsiz > 0) Text(t("Narxsiz qatorlar: {n} — jamiga kirmaydi", mapOf("n" to jami.narxsiz)), style = Q.type.labelSmall, color = Q.colors.warn)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    QButton(t("Saqlash") + " (${savat.size})", { saqla() }, kind = QButtonKind.Primary, enabled = savat.isNotEmpty() && !saqlanmoqda, loading = saqlanmoqda, icon = QIcons.Check, modifier = Modifier.weight(1f))
                    QButton(t("F2 tayyorlash →"), { ModNav.go?.invoke("f2") }, kind = QButtonKind.Secondary)
                }
            }
        }
    }
}

@Composable
private fun SavatSatr(x: SavatQator, kichik: Boolean, t: (String, Map<String, Any>) -> String, onHajm: (Double) -> Unit, onOlish: (() -> Unit)?) {
    var matn by remember(x.qatorId, x.hajm) { mutableStateOf(numStr(x.hajm)) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(Modifier.weight(1f)) {
            Text((x.kod?.let { "$it " } ?: "") + x.nom, style = if (kichik) Q.type.labelSmall else Q.type.bodySmall, color = if (kichik) Q.colors.textDim else Q.colors.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(x.birlik ?: "", style = Q.type.labelSmall, color = Q.colors.textMute)
                if (x.oshdi) Text("▲ " + t("Qoldiqdan oshdi", emptyMap()), style = Q.type.labelSmall, color = Q.colors.warn)
                if (x.narx == null) Text(t("Narxsiz", emptyMap()), style = Q.type.labelSmall, color = Q.colors.warn)
            }
        }
        QInput(matn, { v -> matn = v; v.replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() && it != x.hajm }?.let(onHajm) }, Modifier.width(110.dp))
        if (onOlish != null) QButton("✕", onOlish, kind = QButtonKind.Ghost)
    }
}
