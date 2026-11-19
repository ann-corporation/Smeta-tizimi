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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.obyektLoyihaRequest
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.fakt.BirlikOgoh
import uz.anncorp.smeta.core.fakt.EgizakNatija
import uz.anncorp.smeta.core.fakt.EgizakOqishXatosi
import uz.anncorp.smeta.core.fakt.EgizakQator
import uz.anncorp.smeta.core.fakt.EgizakReja
import uz.anncorp.smeta.core.fakt.EgizakTomon
import uz.anncorp.smeta.core.fakt.FaktF2PaketQator
import uz.anncorp.smeta.core.fakt.Kiritma
import uz.anncorp.smeta.core.fakt.RAD_SABAB_MATN
import uz.anncorp.smeta.core.fakt.EgizakObyekt
import uz.anncorp.smeta.core.fakt.egizakHolatOl
import uz.anncorp.smeta.core.fakt.egizakJuftlari
import uz.anncorp.smeta.core.fakt.egizakQatorlarOl
import uz.anncorp.smeta.core.fakt.egizakServerFakt
import uz.anncorp.smeta.core.fakt.faktEgizakReja
import uz.anncorp.smeta.core.fakt.faktEgizakYoz
import uz.anncorp.smeta.core.fakt.ogohSon
import uz.anncorp.smeta.core.fakt.qiymatBirlikOgohi
import uz.anncorp.smeta.core.fakt.qoshimchaXarita
import uz.anncorp.smeta.core.fakt.tenglashPayload
import uz.anncorp.smeta.core.i18n.SiteI18n
import uz.anncorp.smeta.feature.common.Obj
import java.util.UUID
import kotlin.math.abs

/*
 * "Egizaklarga ham yozish" = the site's FaktEgizakOyna.tsx: in THIS window (no new page) a preview for the chosen twin objects (rows that match / do not match with the reason, the volume
 * that will be written) and a per-twin write result. Matching = the F2 twin core; the percent comes from each twin's OWN smeta; '+' / '=' as typed. Every twin has its OWN operation_id
 * (kept while the plan is unchanged), '=' rows are re-read on the server (CAS): a difference stops THAT twin only. The twin reads are sequential and one unreadable twin does not stop the others.
 */

private const val KORSAT = 150

/** The unit-mistake warning text (site birlikOgohMatn, kind "kiritish"). Only a warning: never blocks. */
internal fun birlikOgohMatn(o: BirlikOgoh, t: (String, Map<String, Any>) -> String): String =
    if (o.taklif != null && o.birlikMatn != null) t("Birlik: {birlik} — siz {n} kiritdingiz (smeta {smeta}). {taklif} nazarda tutilmaganmi?", mapOf("birlik" to o.birlikMatn!!, "n" to ogohSon(o.kiritilgan), "smeta" to ogohSon(o.smeta), "taklif" to ogohSon(o.taklif!!, 2)))
    else t("Siz {n} kiritdingiz — jami smetadan {k} marta ko‘p (smeta {smeta}). Birlik yoki o‘nli vergulni tekshiring.", mapOf("n" to ogohSon(o.kiritilgan), "k" to ogohSon(abs(o.nisbat)), "smeta" to ogohSon(o.smeta)))

private class Tomon(val qatorlar: List<EgizakQator>, val smeta: Map<Long, Double?>, val fakt: Map<Long, Double>, val qosh: Map<Long, Long>)
private enum class Doira { Qoralama, Bolim, Obyekt }

/**
 * @param qoralama unsaved entries of the journal (qator id -> Kiritma); @param bolimKiritma / obyektKiritma = the section's / whole object's current fakt as "=" entries
 * (build with `faktdanKiritmalar(rows)`); @param manbaSaqla saves THIS object's unsaved entries first (the journal's own path), returns false when it could not.
 */
@Composable
fun FaktEgizakDialog(
    c: Ctx, obyektId: Long, obyektNom: String, sana: String, objects: List<Obj>, qoralama: Map<Long, Kiritma>, bolimNom: String?, bolimKiritma: Map<Long, Kiritma>, obyektKiritma: Map<Long, Kiritma>,
    manbaSaqla: suspend () -> Boolean, onYop: () -> Unit, onYozildi: () -> Unit,
) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    val cid = c.place.companyId
    // The snapshot at opening: even if the source is saved and the journal draft is cleared, the plan does not change.
    val snap = remember { Triple(qoralama.toMap(), bolimKiritma.toMap(), obyektKiritma.toMap()) }
    var loyiha by remember { mutableStateOf<Map<Long, Long>?>(null) }
    val nomzod = remember(objects, loyiha) { egizakJuftlari(objects.map { EgizakObyekt(it.id, it.nom, loyiha?.get(it.id)) }, obyektId) }
    var doira by remember { mutableStateOf(if (snap.first.isNotEmpty()) Doira.Qoralama else if (bolimNom != null) Doira.Bolim else Doira.Obyekt) }
    var tanlangan by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var manbaBilan by remember { mutableStateOf(true) }
    var yuk by remember { mutableStateOf(true) }
    var xato by remember { mutableStateOf("") }
    var manba by remember { mutableStateOf<List<EgizakQator>>(emptyList()) }
    var tomonlar by remember { mutableStateOf<Map<Long, Tomon>>(emptyMap()) }
    var tomonXato by remember { mutableStateOf<Map<Long, String>>(emptyMap()) }
    var band by remember { mutableStateOf(false) }
    var natijalar by remember { mutableStateOf<Map<Long, EgizakNatija>>(emptyMap()) }
    var tasdiqKerak by remember { mutableStateOf(false) }
    val opRef = remember { HashMap<Long, Pair<String, String>>() }
    val scope = rememberCoroutineScope()

    // The project of every object (twin = same project + "<root> №N"): t2_obyekt_jami.loyiha_id.
    LaunchedEffect(cid) {
        loyiha = runCatching {
            c.sv.api.bff("/api/sb", "POST", obyektLoyihaRequest(cid)).body.obj()?.get("qatorlar").arr()?.mapNotNull { r -> val o = r.obj(); val id = o?.get("id").num()?.toLong(); val l = o?.get("loyiha_id").num()?.toLong(); if (id != null && l != null) id to l else null }?.toMap()
        }.getOrNull() ?: emptyMap()
    }
    LaunchedEffect(obyektId, nomzod, loyiha) {
        if (loyiha == null) return@LaunchedEffect
        tanlangan = nomzod.map { it.id }.toSet()
        try {
            if (nomzod.isEmpty()) { yuk = false; return@LaunchedEffect }
            val m = egizakQatorlarOl(c.sv.api, obyektId); manba = m
            // Twins one after another: one unreadable twin (time / error) does not stop the others; its error code is shown.
            for (o in nomzod) {
                try {
                    val qatorlar = egizakQatorlarOl(c.sv.api, o.id); val hq = egizakHolatOl(c.sv.api, o.id)
                    val smeta = LinkedHashMap<Long, Double?>(); val fakt = LinkedHashMap<Long, Double>()
                    for (q in qatorlar) { val x = hq[q.id]; smeta[q.id] = x?.first ?: q.hajm; fakt[q.id] = x?.second ?: 0.0 }
                    tomonlar = tomonlar + (o.id to Tomon(qatorlar, smeta, fakt, qoshimchaXarita(m, qatorlar, o.id)))
                } catch (e: Exception) {
                    val kod = if (e is EgizakOqishXatosi) e.kod else "XATO"
                    tomonXato = tomonXato + (o.id to t("«{nom}» o‘qilmadi ({kod}) — bu egizak o‘tkazib yuborildi.", mapOf("nom" to (o.nom ?: "#${o.id}"), "kod" to kod)))
                }
            }
            yuk = false
        } catch (e: Exception) { xato = e.message ?: t("Egizak obyekt ma’lumotlari o‘qilmadi."); yuk = false }
    }

    val kirit = when (doira) { Doira.Qoralama -> snap.first; Doira.Bolim -> snap.second; Doira.Obyekt -> snap.third }
    val rejalar = remember(nomzod, tomonlar, manba, kirit) {
        nomzod.filter { it.id in tomonlar }.map { o -> val e = tomonlar.getValue(o.id); faktEgizakReja(manba, kirit, EgizakTomon(o.id, o.nom ?: "#${o.id}", e.qatorlar, e.smeta, e.fakt), e.qosh) }
    }
    val yozilgan = natijalar.values.filter { it.holat == "yozildi" }.map { it.obyektId }.toSet()
    val yoziladi = rejalar.filter { it.obyektId in tanlangan && it.obyektId !in yozilgan && it.paket.isNotEmpty() }
    val jamiQator = yoziladi.sumOf { it.paket.size }
    fun mosOgohi(x: uz.anncorp.smeta.core.fakt.EgizakMos) = qiymatBirlikOgohi(x.qiymat, x.rejim, x.smeta, x.joriy, x.birlik)
    val ogohSoni = yoziladi.sumOf { r -> r.moslar.count { mosOgohi(it) != null } }

    /** One operation id per twin, kept while that twin's plan is unchanged (a re-send is safe). */
    fun opOl(r: EgizakReja): String {
        val imzo = r.paket.joinToString(";") { "${it.qatorId}:${it.hajm}" }
        val bor = opRef[r.obyektId]
        if (bor != null && bor.first == imzo) return bor.second
        val id = UUID.randomUUID().toString(); opRef[r.obyektId] = imzo to id; return id
    }

    fun yoz() {
        if (band || yoziladi.isEmpty()) return
        if (ogohSoni > 0 && !tasdiqKerak) { tasdiqKerak = true; return }
        tasdiqKerak = false; band = true
        scope.launch {
            try {
                if (doira == Doira.Qoralama && manbaBilan && !manbaSaqla()) return@launch
                val ops = yoziladi.associate { it.obyektId to opOl(it) }
                val res = faktEgizakYoz(yoziladi, ops,
                    serverFakt = { oid, idlar -> egizakServerFakt(c.sv.api, oid, idlar) },
                    yoz = { oid, paket, op ->
                        val r = c.sv.api.bff("/api/sb-yoz", "POST", tenglashPayload(cid, oid, sana, paket.map { FaktF2PaketQator(it.qatorId, it.hajm) }, op, "Egizak fakt: $obyektNom → ${paket.size} qator"))
                        val out = parseFaktResult(r.body)
                        (out?.ok == true) to (if (out?.ok == true) null else (if (r.networkError) Tx.offlineWrite else out?.error ?: r.code))
                    },
                    progress = { n -> natijalar = natijalar + (n.obyektId to n) })
                if (res.any { it.holat == "yozildi" }) onYozildi()
            } finally { band = false }
        }
    }

    fun natijaMatn(n: EgizakNatija) = when (n.holat) {
        "yozildi" -> t("Yozildi: {n} qator", mapOf("n" to n.qatorSoni))
        "ziddiyat" -> t("Ziddiyat: {n} qator fakti boshqa joyda o‘zgargan — bu egizak to‘xtadi. Oynani qayta oching.", mapOf("n" to (n.ziddiyatIdlar?.size ?: 0)))
        "bosh" -> t("Yoziladigan qator yo‘q")
        else -> t("Xato: {xabar}", mapOf("xabar" to (n.xabar ?: "")))
    }

    Dialog(onDismissRequest = { if (!band) onYop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 1000.dp).fillMaxWidth(0.82f).heightIn(max = 800.dp).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(t("Egizaklarga ham yozish"), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            Text(obyektNom, style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)

            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(Doira.Qoralama to t("Saqlanmagan kiritmalar") + " (${snap.first.size})", Doira.Bolim to (if (bolimNom != null) t("Bo‘lim: {nom}", mapOf("nom" to bolimNom)) else t("Bo‘lim")) + " (${snap.second.size})",
                    Doira.Obyekt to t("Butun obyekt fakti") + " (${snap.third.size})").forEach { (k, l) ->
                    QButton(l, { doira = k }, kind = if (doira == k) QButtonKind.Primary else QButtonKind.Ghost, enabled = !band && !(k == Doira.Bolim && bolimNom == null))
                }
                if (doira == Doira.Qoralama) Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(manbaBilan, { manbaBilan = it }, enabled = !band); Text(t("Avval shu obyektga ham saqlash"), style = Q.type.bodySmall, color = Q.colors.textDim) }
            }
            Text(if (doira == Doira.Qoralama) t("«+» va «=» rejimi, foiz (masalan 50%) har egizakning o‘z smeta hajmidan hisoblanadi.") else t("Joriy fakt egizaklarga «jami» (=) sifatida yoziladi; faqat fakti bor ish/material qatorlari. Tasdiqlangan F2 o‘zgarmaydi."), style = Q.type.labelSmall, color = Q.colors.textMute)

            if (yuk) Text(t("Egizak obyekt tekshirilmoqda…"), style = Q.type.bodySmall, color = Q.colors.textDim)
            if (xato.isNotEmpty()) QNote(xato, tone = QTone.Danger)
            tomonXato.values.forEach { QNote(it, tone = QTone.Danger) }
            if (!yuk && xato.isEmpty() && nomzod.isEmpty()) Text(t("Bu loyihada egizak obyekt yo‘q."), style = Q.type.bodySmall, color = Q.colors.textDim)

            LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(rejalar, key = { it.obyektId }) { r ->
                    val n = natijalar[r.obyektId]
                    Column(Modifier.fillMaxWidth().border(BorderStroke(1.dp, Q.colors.border), Q.shape.medium).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(r.obyektId in tanlangan, { tanlangan = if (r.obyektId in tanlangan) tanlangan - r.obyektId else tanlangan + r.obyektId }, enabled = !band && r.obyektId !in yozilgan)
                                Text(r.nom, style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                            }
                            Text(t("mos: {a}, mos kelmadi: {b}", mapOf("a" to r.moslar.size, "b" to r.radlar.size)), style = Q.type.labelSmall, color = Q.colors.textDim)
                            if (!r.qatiy) Text(t("smeta tuzilmasi aynan bir xil emas"), style = Q.type.labelSmall, color = Q.colors.warn)
                            if (n != null) Text(natijaMatn(n), style = Q.type.labelSmall, color = if (n.holat == "yozildi") Q.colors.ok else if (n.holat == "bosh") Q.colors.textDim else Q.colors.danger)
                        }
                        if (r.moslar.isNotEmpty()) {
                            Row(Modifier.padding(vertical = 2.dp)) {
                                Text(t("Qator"), Modifier.weight(1f), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Smeta"), Modifier.width(90.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                                Text(t("Hozirgi fakt"), Modifier.width(100.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Rejim"), Modifier.width(110.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                                Text(t("Qo‘shiladi"), Modifier.width(110.dp), style = Q.type.labelSmall, color = Q.colors.textMute); Text(t("Yangi fakt"), Modifier.width(100.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                            }
                            r.moslar.take(KORSAT).forEach { x ->
                                val og = mosOgohi(x)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(x.nom + (if (x.hajmFarq) " ⚠" else ""), Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(qty(x.smeta), Modifier.width(90.dp), style = Q.type.bodySmall, color = Q.colors.textDim); Text(qty(x.joriy), Modifier.width(100.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                                    Text(x.rejim.belgi.toString() + (if (x.qiymat.contains('%')) " ${x.qiymat}" else ""), Modifier.width(110.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                                    Text((if (x.delta > 0) "+" else "") + qty(x.delta) + " " + (x.birlik ?: ""), Modifier.width(110.dp), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                                    Text(qty(x.yangi), Modifier.width(100.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                                }
                                if (og != null) Text("⚠ " + birlikOgohMatn(og, ::t), style = Q.type.labelSmall, color = Q.colors.warn)
                            }
                        }
                        if (r.moslar.size > KORSAT) Text(t("yana {n} ta qator", mapOf("n" to (r.moslar.size - KORSAT))), style = Q.type.labelSmall, color = Q.colors.textMute)
                        if (r.radlar.isNotEmpty()) {
                            Text(t("Yozilmaydigan qatorlar ({n}):", mapOf("n" to r.radlar.size)), style = Q.type.labelSmall, color = Q.colors.warn, fontWeight = FontWeight.SemiBold)
                            r.radlar.take(KORSAT).forEach { x -> Text("• ${x.nom} — " + t(RAD_SABAB_MATN.getValue(x.sabab)), style = Q.type.labelSmall, color = Q.colors.warn) }
                        }
                    }
                }
            }
            if (tasdiqKerak) QNote(t("{n} qatorda fakt smetadan ancha oshgan — baribir saqlansinmi?", mapOf("n" to ogohSoni)), tone = QTone.Warn)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(t("Sana") + ": " + sana, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.textMute)
                QButton(t("Yopish"), onYop, kind = QButtonKind.Ghost, enabled = !band)
                QButton(if (band) t("Yozilmoqda…") else t("Egizaklarga yozish ({n})", mapOf("n" to jamiQator)), { yoz() }, kind = QButtonKind.Primary, enabled = !band && !yuk && yoziladi.isNotEmpty(), loading = band)
            }
        }
    }
}
