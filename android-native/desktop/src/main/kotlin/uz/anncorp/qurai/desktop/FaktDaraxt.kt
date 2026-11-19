@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridState
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.DaraxtNode
import uz.anncorp.smeta.core.fakt.DaraxtSatr
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.JurnalMalumot
import uz.anncorp.smeta.core.fakt.TezFiltr
import uz.anncorp.smeta.core.fakt.daraxtBolaliKalitlar
import uz.anncorp.smeta.core.fakt.daraxtFaktKiritiladi
import uz.anncorp.smeta.core.fakt.daraxtFoizi
import uz.anncorp.smeta.core.fakt.daraxtOlchov
import uz.anncorp.smeta.core.fakt.daraxtQur
import uz.anncorp.smeta.core.fakt.daraxtSuz
import uz.anncorp.smeta.core.fakt.daraxtTekis
import uz.anncorp.smeta.core.fakt.daraxtTezSoni
import uz.anncorp.smeta.core.fakt.faktBelgilaV2Payload
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.i18n.SiteI18n
import java.time.LocalDate
import java.util.UUID

/*
 * «Daraxt» tab of the Fakt page = the site's SmetaTree: the RZ -> BL -> RS/MAT/OB tree (Nom/Birlik, Smeta, Fakt, F2 olingan, Bajarilish, F2 mumkin, Qoldiq, Narx holati and the
 * money columns), search + quick filters with counts, expand/collapse, the Asosiy / F2 / To'liq column presets, and the row drawer (Umumiy / Fakt / F2 / Audit) with the fakt write
 * (Jami Faktni o'rnatish = fakt_belgila_v2, Faktga qo'shish = fakt_yoz_v2). The tree is built from the object packet (rows + states).
 * NOT ported: the "Narx nazorati" preset/filters (t2_price_control_v1 read-model), "Asl smetadan farq" (muhr), "Avvalgi versiya", the row field editor (QatorTahrirModal), edit mode / drag-drop.
 */

private enum class Preset(val nom: String) { Asosiy("Asosiy"), F2("F2"), Toliq("To‘liq (pul ustunlari bilan)") }

@Composable
fun FaktDaraxtScreen(c: Ctx, obyektId: Long, d: JurnalMalumot, onChanged: () -> Unit) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    val data = remember(d) { daraxtQur(d.rows, d.states) }
    var qidiruv by remember(obyektId) { mutableStateOf("") }
    var tez by remember(obyektId) { mutableStateOf(TezFiltr.Hammasi) }
    var preset by remember { mutableStateOf(Preset.Asosiy) }
    var ochiq by remember(obyektId) { mutableStateOf<Set<Long>>(emptySet()) }
    var ustidan by remember(obyektId) { mutableStateOf<Map<Long, Boolean>>(emptyMap()) }
    var grid by remember(obyektId) { mutableStateOf(GridState()) }
    var drawer by remember(obyektId) { mutableStateOf<Long?>(null) }
    val filtrRejimi = qidiruv.isNotBlank() || tez == TezFiltr.Asl || tez == TezFiltr.Qosh || tez == TezFiltr.Zamena
    val filtrlangan = remember(data, qidiruv, tez) { daraxtSuz(data, qidiruv, tez) }
    // Search / group filters open every branch so the found rows are visible; the user can still fold one (kept until the filter changes).
    val kengaytirilgan = remember(filtrlangan, ochiq, ustidan, filtrRejimi) {
        if (filtrRejimi) daraxtBolaliKalitlar(filtrlangan).filter { ustidan[it] != false }.toSet() else ochiq
    }
    val tekis = remember(filtrlangan, kengaytirilgan) { daraxtTekis(filtrlangan, kengaytirilgan) }
    val soni = remember(data) { daraxtTezSoni(data) }
    LaunchedEffect(qidiruv, tez) { ustidan = emptyMap() }
    val byId = remember(data) { HashMap<Long, DaraxtNode>().also { m -> val st = ArrayDeque(data); while (st.isNotEmpty()) { val n = st.removeLast(); m[n.id] = n; st.addAll(n.children) } } }

    fun toggle(n: DaraxtNode) {
        if (filtrRejimi) ustidan = ustidan + (n.id to (n.id !in kengaytirilgan))
        else ochiq = if (n.id in ochiq) ochiq - n.id else ochiq + n.id
    }
    val tanlanganId = grid.active as? Long

    val cols = remember(preset, lang) {
        val l = ArrayList<GridCol<DaraxtSatr>>()
        l.add(GridCol("nom", t("Nom / Birlik"), 460f) { s ->
            val n = s.node
            "  ".repeat(s.depth * 2) + (if (s.hasChildren) (if (s.isExpanded) "▾ " else "▸ ") else "   ") + (if (n.zamena) "⟲ " else if (n.qosh) "＋ " else "") +
                (n.kod?.let { "$it  " } ?: "") + n.nom.ifEmpty { t("Nomsiz") } + (if (n.zamena) "  [${t("ZAMENA")}]" else if (n.qosh) "  [${t("QO‘SHIMCHA")}]" else "") + (n.birlik?.let { "  · $it" } ?: "")
        })
        if (preset != Preset.F2) { l.add(GridCol("smetaHajm", t("Smeta"), 100f, numeric = true) { s -> qty(s.node.smetaHajm).takeIf { s.node.smetaHajm != null } ?: "" }); l.add(GridCol("fakt", t("Fakt"), 100f, numeric = true) { s -> s.node.fakt?.let { qty(it) } ?: "" }) }
        l.add(GridCol("f2ol", t("F2 olingan"), 100f, numeric = true) { s -> s.node.f2ol?.let { qty(it) } ?: "" })
        l.add(GridCol("foiz", t("Bajarilish"), 90f, numeric = true) { s -> daraxtFoizi(s.node)?.let { "$it%" } ?: "" })
        l.add(GridCol("f2mum", t("F2 mumkin"), 100f, numeric = true) { s -> s.node.f2mum?.let { qty(it) } ?: "" })
        l.add(GridCol("qoldiq", t("Qoldiq"), 90f, numeric = true) { s -> s.node.qoldiq?.let { qty(it) } ?: "" })
        l.add(GridCol("narxHolati", t("Narx holati"), 110f) { _ -> Tx.dash })
        if (preset == Preset.Toliq) {
            l.add(GridCol("smeta", t("Smeta, so‘m"), 130f, numeric = true) { s -> s.node.smeta?.let { money(it) } ?: "" }); l.add(GridCol("stFakt", t("Fakt, so‘m"), 130f, numeric = true) { s -> s.node.stFakt?.let { money(it) } ?: "" })
            l.add(GridCol("stF2", t("F2, so‘m"), 130f, numeric = true) { s -> s.node.stF2?.let { money(it) } ?: "" }); l.add(GridCol("stOst", t("Qoldiq, so‘m"), 130f, numeric = true) { s -> s.node.stOst?.let { money(it) } ?: "" })
        }
        l
    }
    val actions = listOf(
        GridAction<DaraxtSatr>(t("Shoxni ochish yoki yopish")) { rows -> rows.firstOrNull { it.hasChildren }?.let { toggle(it.node) } },
        GridAction<DaraxtSatr>(t("Qator tafsilotlari")) { rows -> rows.firstOrNull()?.let { drawer = it.node.id } },
    )

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                QInput(qidiruv, { qidiruv = it }, Modifier.width(300.dp), placeholder = t("Qidiruv…"), leading = QIcons.Search)
                if (qidiruv.isNotBlank()) Text("${tekis.size} " + t("ta qator topildi"), style = Q.type.labelSmall, color = Q.colors.textMute)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Preset.entries.forEach { p -> QButton(t(p.nom), { preset = p }, kind = if (preset == p) QButtonKind.Primary else QButtonKind.Secondary) }
                }
                Box(Modifier.weight(1f))
                QButton(t("Hammasini yoyish"), { ochiq = daraxtBolaliKalitlar(data); ustidan = emptyMap() }, kind = QButtonKind.Ghost, icon = QIcons.ChevronDown)
                QButton(t("Yig‘ish"), { ochiq = emptySet(); if (filtrRejimi) ustidan = daraxtBolaliKalitlar(filtrlangan).associateWith { false } }, kind = QButtonKind.Ghost, icon = QIcons.ChevronRight)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TezFiltr.entries.forEach { f ->
                    QButton(t(f.nom) + (if (f != TezFiltr.Hammasi) "  ${soni[f] ?: 0}" else ""), { tez = f }, kind = if (tez == f) QButtonKind.Primary else QButtonKind.Secondary)
                }
                Text(t("Narx nazorati filtrlari: ma’lumot ulanmagan"), style = Q.type.labelSmall, color = Q.colors.textMute, modifier = Modifier.padding(start = 8.dp, top = 8.dp))
            }
        }
        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DataGrid(
                tekis, cols, key = { it.node.id }, state = grid, onState = { grid = it }, modifier = Modifier.weight(1f).fillMaxHeight(), cellsKey = listOf(kengaytirilgan, preset, lang),
                rowTone = { s -> if (s.node.tur == "rz") QTone.Info else null }, actions = actions, empty = t("Hech narsa topilmadi."),
                onOpen = { s -> if (s.hasChildren) toggle(s.node) else drawer = s.node.id },
            )
            drawer?.let { id -> byId[id]?.let { n -> DaraxtDrawer(c, obyektId, n, tekis.firstOrNull { it.node.id == id }?.yol.orEmpty(), { drawer = null }, onChanged) } }
        }
        tanlanganId?.let { id -> byId[id]?.let { n -> if (drawer == null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(n.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (n.children.isNotEmpty()) QButton(if (id in kengaytirilgan) t("Yig‘ish") else t("Hammasini yoyish"), { toggle(n) }, kind = QButtonKind.Ghost)
            QButton(t("Qator tafsilotlari"), { drawer = id }, kind = QButtonKind.Secondary)
        } } }
    }
}

@Composable
private fun Olchov(sm: Double?, fk: Double?, f2: Double?, t: (String) -> String) {
    val o = daraxtOlchov(sm, fk, f2)
    if (o == null) { Text(t("Bajarilish: smeta qiymati noma’lum"), style = Q.type.labelSmall, color = Q.colors.textMute); return }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.weight(1f).height(8.dp).background(Q.colors.surface3, Q.shape.small)) {
                if (o.f2Ulush > 0) Box(Modifier.weight(o.f2Ulush.toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().background(Q.colors.accent, Q.shape.small))
                if (o.faktUlush > 0) Box(Modifier.weight(o.faktUlush.toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().background(Q.colors.info, Q.shape.small))
                val qol = (1.0 - o.f2Ulush - o.faktUlush).toFloat()
                if (qol > 0) Box(Modifier.weight(qol).fillMaxHeight())
            }
            Text("${o.foiz}%", style = Q.type.labelSmall, color = if (o.oshdi) Q.colors.warn else Q.colors.text, fontWeight = FontWeight.SemiBold)
        }
        Text(t("F2 olingan") + " · " + t("fakt (F2 siz)") + " · " + t("qoldiq"), style = Q.type.labelSmall, color = Q.colors.textMute)
    }
}

@Composable
private fun Kpi(nom: String, v: String, modifier: Modifier = Modifier) {
    Column(modifier.border(1.dp, Q.colors.border, Q.shape.small).padding(8.dp)) { Text(nom, style = Q.type.labelSmall, color = Q.colors.textMute); Text(v, style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold) }
}

/** The row drawer of the site: Umumiy / Fakt / F2 / Audit; the Fakt tab writes the fakt. */
@Composable
private fun DaraxtDrawer(c: Ctx, obyektId: Long, n: DaraxtNode, yol: List<String>, onYop: () -> Unit, onChanged: () -> Unit) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var tab by remember(n.id) { mutableStateOf("umumiy") }
    var rejim by remember(n.id) { mutableStateOf("jami") }
    var qiymat by remember(n.id, n.fakt) { mutableStateOf(n.fakt?.let { numText(it) } ?: "") }
    var saqlanmoqda by remember(n.id) { mutableStateOf(false) }
    var holat by remember(n.id) { mutableStateOf<Pair<String, QTone>?>(null) }
    val scope = rememberCoroutineScope()
    val rz = n.tur == "rz"

    fun saqla() {
        val v = qiymat.trim().replace(',', '.').toDoubleOrNull()
        if (v == null || !v.isFinite()) { holat = t("Fakt hajmini raqam ko‘rinishida kiriting.") to QTone.Warn; return }
        if (saqlanmoqda) return
        saqlanmoqda = true; holat = t("Saqlanmoqda…") to QTone.Warn
        val sana = LocalDate.now().toString(); val op = UUID.randomUUID().toString()
        scope.launch {
            val body = if (rejim == "jami") faktBelgilaV2Payload(c.place.companyId, obyektId, n.id, n.fakt ?: 0.0, v, sana, op, "Fakt daraxtidan kanonik jami tahriri")
            else tenglashPayload(c.place.companyId, obyektId, sana, listOf(FaktF2PaketQator(n.id, v)), op, "Fakt daraxtidan kanonik qo‘shish")
            val r = c.sv.api.bff("/api/sb-yoz", "POST", body)
            val out = parseFaktResult(r.body)
            val ok = out?.ok == true
            val conflict = r.code == "FAKT_CONFLICT" || out?.error?.contains("FAKT_CONFLICT") == true
            holat = when {
                ok -> t("Saqlandi. Server qiymati yangilandi.") to QTone.Ok
                conflict -> t("Qator serverda o‘zgargan. Yangilang.") to QTone.Warn
                r.networkError -> Tx.offlineWrite to QTone.Danger
                else -> (out?.error ?: r.code ?: t("Fakt saqlanmadi.")) to QTone.Danger
            }
            saqlanmoqda = false
            if (ok || conflict) onChanged()
        }
    }

    Column(Modifier.width(430.dp).fillMaxHeight().background(Q.colors.surface, Q.shape.medium).border(1.dp, Q.colors.border, Q.shape.medium)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (yol.size > 1) Text(yol.dropLast(1).joinToString(" › "), style = Q.type.labelSmall, color = Q.colors.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(n.nom.ifEmpty { t("Nomsiz") }, style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold, maxLines = 3)
                if (!rz) Text(listOfNotNull(n.kat, n.kod ?: t("Kod yo‘q"), n.birlik ?: t("Birlik yo‘q")).joinToString("  ·  ") + (if (n.zamena) "  ·  " + t("Zamena") else "") + (if (n.qosh) "  ·  " + t("Qo‘shimcha") else ""), style = Q.type.labelSmall, color = Q.colors.textMute)
            }
            QButton("✕", onYop, kind = QButtonKind.Ghost)
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("umumiy" to "Umumiy", "fakt" to "Fakt", "f2" to "F2", "audit" to "Audit").forEach { (k, l) -> QButton(t(l), { tab = k }, kind = if (tab == k) QButtonKind.Primary else QButtonKind.Ghost) }
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (tab) {
                "umumiy" -> {
                    if (rz) Olchov(n.smeta, n.stFakt, n.stF2) { t(it) } else Olchov(n.smetaHajm, n.fakt, n.f2ol) { t(it) }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (rz) listOf("Smeta summasi" to n.smeta, "Fakt summasi" to n.stFakt, "F2 summasi" to n.stF2, "Qoldiq summasi" to n.stOst).forEach { (k, v) -> Kpi(t(k), money(v), Modifier.width(190.dp)) }
                        else listOf("Smeta hajmi" to n.smetaHajm, "Fakt hajmi" to n.fakt, "F2 hajmi" to n.f2ol, "F2 mumkin" to n.f2mum, "Qoldiq hajmi" to n.qoldiq, "Narx, so‘m" to n.narx).forEach { (k, v) -> Kpi(t(k), if (k.startsWith("Narx")) money(v) else qty(v), Modifier.width(190.dp)) }
                    }
                    if (!rz && listOf(n.smeta, n.stFakt, n.stF2, n.stOst).any { it != null }) Column(Modifier.fillMaxWidth().border(1.dp, Q.colors.border, Q.shape.small).padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(t("Summalar, so‘m"), style = Q.type.labelSmall, color = Q.colors.textMute)
                        listOf("Smeta" to n.smeta, "Fakt" to n.stFakt, "F2 olingan" to n.stF2, "Qoldiq" to n.stOst).forEach { (k, v) -> Row { Text(t(k), Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textDim); Text(money(v), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold) } }
                    }
                }
                "fakt" -> {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi(t("Smeta"), qty(n.smetaHajm), Modifier.width(190.dp)); Kpi(t("Joriy Fakt"), qty(n.fakt), Modifier.width(190.dp)); Kpi("F2", qty(n.f2ol), Modifier.width(190.dp)); Kpi(t("F2 mumkin"), qty(n.f2mum), Modifier.width(190.dp))
                    }
                    if (!daraxtFaktKiritiladi(n.tur)) Text(if (n.tur == "rs") "RS resursi BL Fakt × norma sarf orqali avtomatik hisoblanadi." else "Razdel jamlanma qator; unga Fakt kiritilmaydi.", style = Q.type.bodySmall, color = Q.colors.textMute)
                    else Column(Modifier.fillMaxWidth().border(1.dp, Q.colors.border, Q.shape.small).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("Fakt amalini tanlang"), style = Q.type.labelMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f).border(1.dp, if (rejim == "jami") Q.colors.accent else Q.colors.border, Q.shape.small).clickable(enabled = !saqlanmoqda) { rejim = "jami"; qiymat = n.fakt?.let { numText(it) } ?: ""; holat = null }.padding(8.dp)) {
                                Text(t("Jami Faktni o‘rnatish"), style = Q.type.bodySmall, color = Q.colors.text); Text(t("Server eskirgan qiymatni conflict sifatida tekshiradi."), style = Q.type.labelSmall, color = Q.colors.textMute)
                            }
                            Column(Modifier.weight(1f).border(1.dp, if (rejim == "qoshish") Q.colors.accent else Q.colors.border, Q.shape.small).clickable(enabled = !saqlanmoqda) { rejim = "qoshish"; qiymat = ""; holat = null }.padding(8.dp)) {
                                Text(t("Faktga qo‘shish"), style = Q.type.bodySmall, color = Q.colors.text); Text(t("Kiritilgan qiymat alohida Fakt qatoriga yoziladi."), style = Q.type.labelSmall, color = Q.colors.textMute)
                            }
                        }
                        QInput(qiymat, { qiymat = it }, Modifier.fillMaxWidth(), label = if (rejim == "jami") t("Yangi jami Fakt hajmi") else t("Qo‘shiladigan Fakt hajmi"), enabled = !saqlanmoqda)
                        QButton(if (saqlanmoqda) t("Saqlanmoqda…") else t("Faktni saqlash"), { saqla() }, kind = QButtonKind.Primary, enabled = !saqlanmoqda && qiymat.isNotBlank(), loading = saqlanmoqda)
                        holat?.let { QNote(it.first, tone = it.second) }
                    }
                }
                "f2" -> {
                    if (rz) Olchov(n.smeta, n.stFakt, n.stF2) { t(it) } else Olchov(n.smetaHajm, n.fakt, n.f2ol) { t(it) }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (rz) { Kpi(t("F2 summasi"), money(n.stF2), Modifier.width(190.dp)) } else { Kpi(t("F2 hajmi"), qty(n.f2ol), Modifier.width(190.dp)); Kpi(t("F2 mumkin"), qty(n.f2mum), Modifier.width(190.dp)) }
                    }
                    Text(t("F2 mumkin — bajarilgan (fakt), lekin hali F2 akti bilan topshirilmagan qism."), style = Q.type.labelSmall, color = Q.colors.textMute)
                }
                else -> {
                    Kpi(t("Qator identifikatori"), n.id.toString()); Kpi(t("Versiya"), n.versiya.toString())
                    Kpi(t("O‘zgarish holati"), if (n.zamena) t("Zamena aloqasi mavjud") else if (n.qosh) t("Qo‘shimcha ish") else t("Oddiy qator"))
                }
            }
        }
    }
}

private fun numText(x: Double): String = uz.anncorp.smeta.core.fakt.numStr(x)
