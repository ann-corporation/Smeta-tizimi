package uz.anncorp.qurai.desktop

import uz.anncorp.smeta.core.data.formatDate

import uz.anncorp.qurai.ui.components.*

import uz.anncorp.smeta.core.data.Loaded
import uz.anncorp.smeta.feature.common.*

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import uz.anncorp.smeta.feature.disk.detailText
import uz.anncorp.smeta.feature.disk.label as diskLabel
import androidx.compose.runtime.collectAsState
import uz.anncorp.qurai.ui.theme.Q
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.AMAL_FAKT
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
import uz.anncorp.smeta.core.data.FaktLine
import uz.anncorp.smeta.core.data.faktPayload
import uz.anncorp.smeta.core.data.parseFaktResult
import uz.anncorp.smeta.core.data.DocGenRepository
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Status
import uz.anncorp.smeta.core.data.GenItem
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.SumPack
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.ApprovalsRepository
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.data.notifKind
import uz.anncorp.smeta.core.data.formatIsoStamp
import java.time.LocalDate
import java.util.UUID

/** What every module receives: services, the chosen company, the chosen object (modules that need one), and a refresh counter (F5). */
class Ctx(val sv: Services, val repo: Repo, val me: SessionUser, val place: Workplace, val objects: List<Obj>, val obj: Obj?, val tick: Int)

@Composable
fun <T> load(k1: Any?, k2: Any?, f: suspend () -> Loaded<T>): Loaded<T>? {
    var s by remember(k1, k2) { mutableStateOf<Loaded<T>?>(null) }
    LaunchedEffect(k1, k2) { s = null; s = f() }
    return s
}

@Composable
private fun NeedObject(c: Ctx, content: @Composable (Obj) -> Unit) {
    val o = c.obj
    if (o == null) QHint("Yuqoridan obyektni tanlang") else content(o)
}

@Composable
private fun Page(title: String, sub: String? = null, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) { QPageHead(title, desc = sub); content() }
}

private fun statusUz(s: F2Status, raw: String?): String = when (s) {
    F2Status.DRAFT -> "Qoralama"; F2Status.SUBMITTED -> "Yuborilgan"; F2Status.CHECKED -> "Tekshirilgan"; F2Status.APPROVED -> "Tasdiqlangan"
    F2Status.REJECTED -> "Rad etilgan"; F2Status.CANCELLED -> "Bekor qilingan"; F2Status.SUPERSEDED -> "Almashtirilgan"; F2Status.UNKNOWN -> raw ?: T_DASH
}

private const val T_DASH = "\u2014"

/** The server sum package in the owner's order: QQS bilan first, then ustamali (ITOGO-4), then ustamasiz (direct). */
@Composable
fun PackStrip(label: String, p: SumPack?) {
    Row {
        Column(Modifier.width(150.dp)) { Text(label, fontWeight = FontWeight.SemiBold) }
        QKv("QQS bilan", money(p?.qqsBilan)); QKv("Ustamali (QQS siz)", money(p?.ustamali)); QKv("Ustamasiz (QQS siz)", money(p?.ustamasiz))
    }
}

// ============================ Obyektlar ============================

@Composable
fun ObjectsScreen(c: Ctx, onOpen: (Obj) -> Unit) {
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    var q by remember { mutableStateOf("") }
    val m = mny.valueOrNull().orEmpty()
    Page("Obyektlar", "${c.objects.size} ta obyekt. Qatorni bosing: obyekt tanlanadi") {
        mny?.Banner()
        QInput(q, { q = it }, label = "Qidirish", singleLine = true, modifier = Modifier.width(360.dp))
        val rows = c.objects.filter { q.isBlank() || it.nom.contains(q, ignoreCase = true) }
        uz.anncorp.qurai.ui.screens.QObjectList(
            rows.map { o -> val s = m[o.id]?.smeta; uz.anncorp.qurai.ui.screens.QObjectRow(o.id, o.nom, o.tur, o.rows, o.unpriced, s?.qqsBilan?.let(::money), s?.ustamali?.let(::money), s?.ustamasiz?.let(::money), m[o.id]?.factPct?.let { formatPercent(it) }, m[o.id]?.f2Pct?.let { formatPercent(it) }) },
            { r -> rows.firstOrNull { it.id == r.id }?.let(onOpen) }, Modifier.weight(1f), selectedId = c.obj?.id,
        )
   }
}

// ============================ Smeta (tree) ============================

@Composable
fun SmetaScreen(c: Ctx) = NeedObject(c) { o ->
    val pk = load(o.id, c.tick) { c.repo.packet(o.id) }
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    var q by remember(o.id) { mutableStateOf("") }
    var expanded by remember(o.id) { mutableStateOf(setOf<Long>()) }
    Page("Smeta: ${o.nom}") {
        if (pk == null) { QLoading(); return@Page }
        pk.Banner()
        val p = pk.valueOrNull() ?: return@Page
        PackStrip("Smeta (server)", mny.valueOrNull()?.get(o.id)?.smeta)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QInput(q, { q = it }, label = "Kod yoki nom bo'yicha qidirish", singleLine = true, modifier = Modifier.width(380.dp))
            QSecondaryButton(onClick = { expanded = p.nodes.filter { it.hasChildren }.map { it.id }.toSet() }) { Text("Hammasini yoyish") }
            QSecondaryButton(onClick = { expanded = emptySet() }) { Text("Yig'ish") }
            QHint("${p.nodes.size} ta tugun, ${p.blCount} ta ish")
        }
        val vis = remember(p, expanded, q) { visibleNodes(p.nodes, if (q.isBlank()) expanded else p.nodes.filter { it.hasChildren }.map { it.id }.toSet(), q) }
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(vertical = 6.dp)) {
            HeadCell("Kod / nom", 560.dp); HeadCell("Birlik", 70.dp); HeadCell("Hajm", 100.dp, true); HeadCell("Narx", 110.dp, true); HeadCell("Smeta summa", 150.dp, true); HeadCell("Fakt", 140.dp, true); HeadCell("F-2", 140.dp, true)
        }
        LazyColumn(Modifier.weight(1f)) {
            items(vis, key = { it.id }) { x ->
                val sum = if (x.isRz) x.roll else x.summa
                Row(Modifier.fillMaxWidth().clickable(enabled = x.hasChildren) { expanded = if (x.id in expanded) expanded - x.id else expanded + x.id }.padding(vertical = 4.dp)) {
                    val mark = if (x.hasChildren) (if (x.id in expanded || q.isNotBlank()) "в–ѕ " else "в–ё ") else "   "
                    Text(
                        mark + (x.kod?.let { "$it  " } ?: "") + x.nom, Modifier.width(560.dp).padding(start = (x.depth * 16).dp, end = 6.dp),
                        fontWeight = if (x.isRz) FontWeight.Bold else if (x.isBl) FontWeight.Medium else FontWeight.Normal, maxLines = 2,
                    )
                    DataCell(uz.anncorp.smeta.core.data.displayUnit(x.birlik), 70.dp); DataCell(if (x.isRz) "" else qty(x.hajm), 100.dp, true); DataCell(if (x.isRz) "" else money(x.narx), 110.dp, true)
                    DataCell(money(sum), 150.dp, true); DataCell(if (x.isBl) money(x.faktSumma) else "", 140.dp, true); DataCell(if (x.isBl) money(x.f2Summa) else "", 140.dp, true)
                }
                HorizontalDivider(thickness = 0.5.dp)
            }
        }
    }
}

@Composable
private fun HeadCell(t: String, w: androidx.compose.ui.unit.Dp, right: Boolean = false) =
    Text(t, Modifier.width(w).padding(horizontal = 6.dp), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge, textAlign = if (right) androidx.compose.ui.text.style.TextAlign.End else androidx.compose.ui.text.style.TextAlign.Start)

@Composable
private fun DataCell(t: String, w: androidx.compose.ui.unit.Dp, right: Boolean = false) =
    Text(t, Modifier.width(w).padding(horizontal = 6.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 1, textAlign = if (right) androidx.compose.ui.text.style.TextAlign.End else androidx.compose.ui.text.style.TextAlign.Start)

// ============================ F-2 ============================

@Composable
fun F2Screen(c: Ctx) = NeedObject(c) { o ->
    var refreshF2 by remember { mutableStateOf(0) }
    val acts = load(o.id, c.tick + refreshF2) { c.repo.f2Acts(o.id) }
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    val gen = load(o.id, c.tick) { Loaded.Fresh(DocGenRepository(c.sv.api).list(c.place.companyId, o.id).orEmpty()) }
    var pick by remember(o.id) { mutableStateOf<F2Act?>(null) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    Page("F-2 aktlar: ${o.nom}", "Qatorni bosing: akt qatorlari ochiladi") {
        if (acts == null) { QLoading(); return@Page }
        acts.Banner()
        val mo: ObjectMoney? = mny.valueOrNull()?.get(o.id)
        PackStrip("Qabul qilingan F-2 (server)", mo?.f2)
        val list = acts.valueOrNull().orEmpty()
        Box(Modifier.fillMaxWidth().height(220.dp)) {
            QTable(
                list, listOf(
                    QCol("Oy", 90.dp, sort = { it.oy }) { f2MonthLabel(it.oy) ?: T_DASH },
                    QCol("Raqam", 140.dp, sort = { it.raqam }) { it.raqam ?: T_DASH },
                    QCol("Holat", 140.dp, sort = { it.state.ordinal }) { statusUz(it.state, it.status) },
                    QCol("Qator", 80.dp, true, { it.rows }) { it.rows?.toString() ?: T_DASH },
                    QCol("Narxsiz", 80.dp, true, { it.unpriced }) { it.unpriced?.toString() ?: T_DASH },
                    QCol("Minus", 80.dp, true, { it.negativeRows }) { it.negativeRows?.toString() ?: T_DASH },
                    QCol("Farq", 60.dp) { if (it.hasDiff) "ha" else "" },
                ), key = { it.id }, onClick = { pick = it }, selected = { it.id == pick?.id },
            )
        }
        val a = pick
        if (a != null) AktSummaStrip(c, a.id)
        if (a != null) F2StepBar(c, a) { pick = null; refreshF2++ }
        if (a != null) ActRows(c, o, a)
        val f2docs = gen.valueOrNull().orEmpty().filter { it.isF2 }
        if (f2docs.isNotEmpty()) {
            Text("Eksport (Excel / PDF)", fontWeight = FontWeight.SemiBold)
            QHint("Yuklab olinganda tokenlar yechilishi mumkin; qayta yuklash bepul.")
            LazyColumn(Modifier.height(150.dp)) {
                items(f2docs, key = { it.key }) { g -> GenRow(g, busy == g.key) { fmt -> scope.launch { busy = g.key; generate(c, o, g, fmt); busy = null } } }
            }
        }
    }
}

@Composable
private fun ActRows(c: Ctx, o: Obj, a: F2Act) {
    val pk = load(o.id, c.tick) { c.repo.packet(o.id) }
    val names = pk.valueOrNull()?.byId.orEmpty()
    val rows = load(a.id, names.size) { c.repo.actRows(a.id, names) }
    Text("Akt ${a.raqam ?: a.id} qatorlari", fontWeight = FontWeight.SemiBold)
    if (rows == null) { QLoading(); return }
    rows.Banner()
    val r = rows.valueOrNull().orEmpty()
    val direct = r.sumOf { it.summa ?: 0.0 }
    Row { QKv("Qatorlar soni", r.size.toString()); QKv("Qatorlar summasi (ustamasiz, QQS siz)", money(direct)) }
    QHint("Ustamali va QQS bilan summalar faqat serverdan (yuqorida, obyekt bo'yicha qabul qilingan F-2). Akt qatorlari summasi: faqat ustamasiz.")
    Box(Modifier.fillMaxWidth().height(260.dp)) {
        QTable(
            r, listOf(
                QCol("Kod", 120.dp, sort = { it.kod }) { it.kod ?: "" },
                QCol("Nomi", 420.dp, sort = { it.nom.lowercase() }) { it.nom },
                QCol("Birlik", 70.dp) { uz.anncorp.smeta.core.data.displayUnit(it.birlik) },
                QCol("Hajm", 100.dp, true, { it.hajm }) { qty(it.hajm) },
                QCol("Narx", 110.dp, true, { it.narx }) { money(it.narx) },
                QCol("Summa", 140.dp, true, { it.summa }) { money(it.summa) },
            ),
        )
    }
}

private suspend fun generate(c: Ctx, o: Obj, g: GenItem, fmt: String) {
    when (val res = DocGenRepository(c.sv.api).generate(c.place.companyId, o.id, g, fmt)) {
        is GenResult.Ready -> saveAndOpen(res.name, res.bytes)
        else -> Log.i("generate ${res::class.simpleName}")
    }
}

@Composable
private fun GenRow(g: GenItem, busy: Boolean, onGen: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(g.title, Modifier.weight(1f), maxLines = 2)
        Text(g.state, Modifier.width(110.dp), style = MaterialTheme.typography.labelMedium)
        Text(money(g.amount), Modifier.width(150.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        g.formats.forEach { f -> QSecondaryButton(onClick = { onGen(f) }, enabled = !busy) { Text(f.uppercase()) } }
    }
    HorizontalDivider(thickness = 0.5.dp)
}

// ============================ Fakt ============================

@Composable
fun FaktScreen(c: Ctx) = NeedObject(c) { o ->
    var refresh by remember { mutableStateOf(0) }
    val journal = load(o.id, c.tick + refresh) { c.repo.faktJournal(o.id) }
    val pk = load(o.id, c.tick) { c.repo.packet(o.id) }
    val scope = rememberCoroutineScope()
    var q by remember(o.id) { mutableStateOf("") }
    var vol by remember(o.id) { mutableStateOf("") }
    var date by remember(o.id) { mutableStateOf(LocalDate.now().toString()) }
    var chosen by remember(o.id) { mutableStateOf<SNode?>(null) }
    val draft = remember(o.id) { mutableStateListOf<Pair<SNode, Double>>() }
    var confirm by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Page("Fakt: ${o.nom}") {
        Text("Fakt foto-dalil", fontWeight = FontWeight.SemiBold)
        UploadBar(c, o.id)
        journal?.Banner()
        Text("Fakt jurnali", fontWeight = FontWeight.SemiBold)
        Box(Modifier.fillMaxWidth().height(180.dp)) {
            if (journal == null) QLoading() else QTable(
                journal.valueOrNull().orEmpty(), listOf(
                    QCol("Raqam", 140.dp, sort = { it.raqam }) { it.raqam ?: "#${it.id}" },
                    QCol("Oy", 100.dp, sort = { it.oy }) { f2MonthLabel(it.oy) ?: T_DASH },
                    QCol("Holat", 130.dp, sort = { it.status }) { it.status ?: T_DASH },
                    QCol("Jami (hujjat)", 160.dp, true, { it.jami }) { money(it.jami) },
                ), key = { it.id },
            )
        }
        HorizontalDivider()
        Text("Yangi fakt yozuvi", fontWeight = FontWeight.SemiBold)
        val p = pk.valueOrNull()
        if (pk == null) QLoading() else if (p == null) { pk.Banner() } else {
            val works = remember(p) { p.nodes.filter { it.isBl } }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                QInput(q, { q = it; chosen = null }, label = "Ishni qidiring (kod / nom)", singleLine = true, modifier = Modifier.width(360.dp))
                QInput(vol, { vol = it }, label = "Hajm (minus mumkin)", singleLine = true, modifier = Modifier.width(160.dp), keyboardOptions = KeyboardOptions())
                uz.anncorp.qurai.ui.components.QDateField(date, { date = it }, label = T("Sana"), modifier = Modifier.width(170.dp))
                val v = uz.anncorp.smeta.core.data.parseVolume(vol)
                QPrimaryButton(onClick = { chosen?.let { draft.add(it to v!!) }; vol = ""; chosen = null }, enabled = chosen != null && v != null) { Text("Qo'shish") }
            }
            val hits = if (q.isBlank() || chosen != null) emptyList() else works.filter { (it.kod ?: "").contains(q, true) || it.nom.contains(q, true) }.take(8)
            hits.forEach { w ->
                Text("${w.kod ?: ""}  ${w.nom}  [${uz.anncorp.smeta.core.data.displayUnit(w.birlik)}]  smeta ${qty(w.hajm)}, fakt ${qty(w.faktHajm)}", Modifier.fillMaxWidth().clickable { chosen = w; q = w.nom }.padding(vertical = 3.dp), style = MaterialTheme.typography.bodyMedium)
            }
            chosen?.let { QHint("Tanlandi: ${it.nom}") }
            draft.forEachIndexed { i, (n, h) ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${n.kod ?: ""} ${n.nom}", Modifier.weight(1f), maxLines = 1); Text("${qty(h)} ${uz.anncorp.smeta.core.data.displayUnit(n.birlik)}")
                    QGhostButton(onClick = { draft.removeAt(i) }) { Text("Olib tashlash") }
                }
            }
            msg?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            QPrimaryButton(onClick = { confirm = true }, enabled = draft.isNotEmpty() && !busy && Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date)) { Text("Yozish (${draft.size} qator)") }
        }
        if (confirm) QDialog("Faktni yozish", { confirm = false }, buttons = {
            QGhostButton(onClick = { confirm = false }) { Text("Bekor") }
            QPrimaryButton(onClick = {
                confirm = false; busy = true
                scope.launch {
                    val r = c.sv.api.bff("/api/sb-yoz", "POST", faktPayload(AMAL_FAKT, c.place.companyId, o.id, date, draft.map { FaktLine(it.first.id, it.second) }, UUID.randomUUID().toString()))
                    val out = parseFaktResult(r.body)
                    msg = when {
                        r.networkError -> Tx.offlineWrite
                        out?.ok == true -> "Yozildi: ${out.raqam ?: ""} ${out.jami?.let { "jami " + money(it) } ?: ""} ${faktWarnings(out).joinToString("; ")}".trim().also { draft.clear(); refresh++ }
                        else -> "Xato: ${out?.error ?: r.code ?: "HTTP ${r.status}"}"
                    }
                    Log.i("fakt write ok=${out?.ok} status=${r.status}")
                    busy = false
                }
            }) { Text("Yozish") }
        }) { Text("${o.nom}: ${draft.size} qator, sana $date. Serverga yoziladi.") }
    }
}

// ============================ Nakopitelniy / Slichitelniy ============================

@Composable
fun NakopScreen(c: Ctx) = NeedObject(c) { o ->
    val gen = load(o.id, c.tick) { Loaded.Fresh(DocGenRepository(c.sv.api).list(c.place.companyId, o.id)) }
    val acts = load(o.id, c.tick) { c.repo.f2Acts(o.id) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    Page("Nakopitelniy / Slichitelniy: ${o.nom}", "Hujjatni server tayyorlaydi; fayl Documents\\QURAI papkasiga saqlanadi") {
        if (gen == null) { QLoading(); return@Page }
        val items = (gen as? Loaded.Fresh)?.data
        if (items == null) { Text("Hujjatlar ro'yxatini yuklab bo'lmadi (oflayn yoki ruxsat yo'q)", color = MaterialTheme.colorScheme.error); return@Page }
        val own = items.filter { it.type == "nakopitelniy" || it.type == "slichitelniy" || it.type == "ostatka" || it.isF3 }
        QHint("Yuklab olinganda tokenlar yechilishi mumkin; qayta yuklash bepul. Tasdiqlangan F-2 oylari: ${acts.valueOrNull().orEmpty().count { it.state == F2Status.APPROVED }} ta")
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (own.isEmpty()) QHint("Bu obyekt uchun nakopitelniy / slichitelniy hozircha yo'q (tasdiqlangan F-2 kerak)")
        LazyColumn(Modifier.weight(1f)) {
            items(own, key = { it.key }) { g ->
                GenRow(g, busy == g.key) { fmt ->
                    scope.launch {
                        busy = g.key; msg = null
                        when (val res = DocGenRepository(c.sv.api).generate(c.place.companyId, o.id, g, fmt)) {
                            is GenResult.Ready -> saveAndOpen(res.name, res.bytes)
                            GenResult.NoTokens -> msg = "Token yetarli emas"
                            GenResult.Offline -> msg = Tx.offlineWrite
                            GenResult.Forbidden -> msg = Tx.forbidden
                            GenResult.DataIncomplete -> msg = "Obyekt ma'lumoti to'liq emas"
                            is GenResult.Failed -> msg = "Xato: ${res.code}"
                        }
                        busy = null
                    }
                }
            }
        }
    }
}

// ============================ Narx / katalog ============================

@Composable
fun NarxScreen(c: Ctx) {
    val narx = load(c.place.companyId, c.tick) { c.repo.narx(c.place.companyId) }
    var q by remember { mutableStateOf("") }
    var onlyRisk by remember { mutableStateOf(false) }
    Page("Narx / katalog", "Narxlar markazi: resurs bo'yicha eng yuqori narx (QQS siz)") {
        if (narx == null) { QLoading(); return@Page }
        narx.Banner()
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QInput(q, { q = it }, label = "Resurs qidirish", singleLine = true, modifier = Modifier.width(360.dp))
            QSecondaryButton(onClick = { onlyRisk = !onlyRisk }) { Text(if (onlyRisk) "Hammasi" else "Faqat xavfli farq") }
        }
        val rows = narx.valueOrNull().orEmpty().filter { (q.isBlank() || it.nom.contains(q, true)) && (!onlyRisk || it.xavf) }
        QHint("${rows.size} ta resurs")
        QTable(
            rows, listOf(
                QCol("Resurs", 400.dp, sort = { it.nom.lowercase() }) { it.nom },
                QCol("Birlik", 70.dp, sort = { it.birlik }) { uz.anncorp.smeta.core.data.displayUnit(it.birlik) },
                QCol("Turi", 90.dp, sort = { it.kat }) { it.kat ?: "" },
                QCol("Obyekt", 70.dp, true, { it.obyektSoni }) { it.obyektSoni.toString() },
                QCol("Smeta min", 120.dp, true, { it.smetaMin }) { money(it.smetaMin) },
                QCol("Smeta max", 120.dp, true, { it.smetaMax }) { money(it.smetaMax) },
                QCol("Belgilangan", 120.dp, true, { it.belgilangan }) { money(it.belgilangan) },
                QCol("Natija (max)", 130.dp, true, { it.natija }) { money(it.natija) },
                QCol("Manba", 100.dp, sort = { it.manba }) { it.manba ?: "" },
                QCol("Xavf", 60.dp, sort = { it.xavf }) { if (it.xavf) "farq>5%" else "" },
            ), modifier = Modifier.weight(1f),
        )
    }
}

// ============================ Moliya ============================

@Composable
fun MoneyScreen(c: Ctx) {
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    val debts = load(c.place.companyId, c.tick) { c.repo.debts(c.place.companyId) }
    var tab by remember { mutableStateOf(0) }
    Page("Moliya", "Hamma summa: QQS bilan, ustamali, ustamasiz (serverdan, qurilmada hisoblanmaydi)") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QSecondaryButton(onClick = { tab = 0 }) { Text(if (tab == 0) "в—Џ Obyektlar bo'yicha" else "Obyektlar bo'yicha") }
            QSecondaryButton(onClick = { tab = 1 }) { Text(if (tab == 1) "в—Џ Qarzdorlar" else "Qarzdorlar") }
        }
        if (tab == 0) {
            if (mny == null) { QLoading(); return@Page }
            mny.Banner()
            val m = mny.valueOrNull().orEmpty()
            val rows = c.objects.filter { m[it.id]?.any == true }
            QHint("${rows.size} ta obyekt (moliyaviy ma'lumoti borlari)")
            QTable(
                rows, listOf(
                    QCol("Obyekt", 300.dp, sort = { it.nom.lowercase() }) { it.nom },
                    QCol("Smeta QQS bilan", 150.dp, true, { m[it.id]?.smeta?.qqsBilan }) { money(m[it.id]?.smeta?.qqsBilan) },
                    QCol("Smeta ustamali", 150.dp, true, { m[it.id]?.smeta?.ustamali }) { money(m[it.id]?.smeta?.ustamali) },
                    QCol("Smeta ustamasiz", 150.dp, true, { m[it.id]?.smeta?.ustamasiz }) { money(m[it.id]?.smeta?.ustamasiz) },
                    QCol("Fakt QQS bilan", 150.dp, true, { m[it.id]?.fakt?.qqsBilan }) { money(m[it.id]?.fakt?.qqsBilan) },
                    QCol("Fakt ustamali", 150.dp, true, { m[it.id]?.fakt?.ustamali }) { money(m[it.id]?.fakt?.ustamali) },
                    QCol("Fakt ustamasiz", 150.dp, true, { m[it.id]?.fakt?.ustamasiz }) { money(m[it.id]?.fakt?.ustamasiz) },
                    QCol("F-2 QQS bilan", 150.dp, true, { m[it.id]?.f2?.qqsBilan }) { money(m[it.id]?.f2?.qqsBilan) },
                    QCol("F-2 ustamali", 150.dp, true, { m[it.id]?.f2?.ustamali }) { money(m[it.id]?.f2?.ustamali) },
                    QCol("F-2 ustamasiz", 150.dp, true, { m[it.id]?.f2?.ustamasiz }) { money(m[it.id]?.f2?.ustamasiz) },
                    QCol("Shartnoma (QQS bilan)", 170.dp, true, { m[it.id]?.contractQqs }) { money(m[it.id]?.contractQqs) },
                    QCol("To'langan", 150.dp, true, { m[it.id]?.paid }) { money(m[it.id]?.paid) },
                    QCol("Qarz", 150.dp, true, { m[it.id]?.debt }) { money(m[it.id]?.debt) },
                    QCol("Fakt %", 80.dp, true, { m[it.id]?.factPct }) { formatPercent(m[it.id]?.factPct) },
                    QCol("F-2 %", 80.dp, true, { m[it.id]?.f2Pct }) { formatPercent(m[it.id]?.f2Pct) },
                ), modifier = Modifier.weight(1f), key = { it.id },
            )
        } else {
            if (debts == null) { QLoading(); return@Page }
            debts.Banner()
            val rows = debts.valueOrNull().orEmpty()
            val known = rows.mapNotNull { it.debt }
            Row { QKv("Qarz jami (ma'lum qatorlar)", money(if (known.isEmpty()) null else known.sum())); QKv("Shartnoma", rows.size.toString()) }
            QTable(
                rows, listOf(
                    QCol("Kontragent", 260.dp, sort = { it.counterparty?.lowercase() }) { it.counterparty ?: "" },
                    QCol("Shartnoma", 200.dp, sort = { it.number }) { listOfNotNull(it.number, it.name).joinToString(" ") },
                    QCol("Summa", 150.dp, true, { it.contractSum }) { money(it.contractSum) },
                    QCol("F-3 sotuv", 150.dp, true, { it.f3Sale }) { money(it.f3Sale) },
                    QCol("To'langan", 150.dp, true, { it.paid }) { money(it.paid) },
                    QCol("Qarz", 150.dp, true, { it.debt }) { money(it.debt) },
                    QCol("Oxirgi to'lov", 110.dp, sort = { it.lastPayment }) { formatDate(it.lastPayment) },
                ), modifier = Modifier.weight(1f),
            )
        }
    }
}

// ============================ Disk ============================

/** "Disk" (website: Mening diskim | Kompaniya diski | Ulashilgan | Savat) (4 tabs only; the approval queue is its own page "Hujjat aylanishi"). Same state machine as Android (shared DiskController). */
@Composable
fun DiskScreen(c: Ctx, onOpenModule: (String, Long?) -> Unit = { _, _ -> }) {
    val scope = rememberCoroutineScope()
    val ctl = remember(c.place.companyId) { uz.anncorp.smeta.feature.disk.DiskController(uz.anncorp.smeta.feature.disk.DiskRepository(c.sv.api), scope) { c.place.companyId } }
    var section by remember { mutableStateOf("mine") }
    val st by ctl.state.collectAsState()
    // Files go to the Downloads folder (open = also launch it); "Tizimda ochish" jumps to the module of this app or opens the website page.
    val host = remember(ctl, onOpenModule) {
        object : uz.anncorp.smeta.feature.disk.DiskHost {
            override fun deliver(name: String, mime: String, bytes: ByteArray, open: Boolean) { saveAndOpen(name, bytes, open) }
            override val modules = setOf("smeta", "f2", "nakop")
            override fun openModule(module: String, objectId: Long?) = onOpenModule(module, objectId)
            override fun openWeb(path: String) { runCatching { java.awt.Desktop.getDesktop().browse(java.net.URI(BuildInfo.API_BASE.trimEnd('/') + path)) } }
        }
    }
    LaunchedEffect(ctl, host) { ctl.host = host }
    LaunchedEffect(c.place.companyId, c.tick) { ctl.reload() }
    val tabs = listOf(
        uz.anncorp.qurai.ui.screens.QDiskTab("mine", I18n.s("qa2_disk_mine", "Mening diskim")), uz.anncorp.qurai.ui.screens.QDiskTab("company", I18n.s("qa2_disk_company", "Kompaniya diski")),
        uz.anncorp.qurai.ui.screens.QDiskTab("shared", I18n.s("qa2_disk_shared", "Ulashilgan")), uz.anncorp.qurai.ui.screens.QDiskTab("trash", I18n.s("qa2_disk_trash", "Savat")),
    )
    Column(Modifier.fillMaxSize()) {
        Text(I18n.s("qa2_disk_title", "Disk"), style = Q.type.titleLarge, color = Q.colors.text, modifier = Modifier.padding(bottom = 6.dp))
        uz.anncorp.qurai.ui.screens.QDiskTabs(tabs, section, { id ->
            section = id
            when (id) {
                "mine" -> ctl.select(uz.anncorp.smeta.feature.disk.DiskTab.MINE); "company" -> ctl.select(uz.anncorp.smeta.feature.disk.DiskTab.COMPANY)
                "shared" -> ctl.select(uz.anncorp.smeta.feature.disk.DiskTab.SHARED); "trash" -> ctl.select(uz.anncorp.smeta.feature.disk.DiskTab.TRASH)
            }
        })
        uz.anncorp.qurai.ui.screens.QDiskList(
            rows = st.rows.map { uz.anncorp.qurai.ui.screens.QDiskRow(it.key, it.folder, it.name, it.sub, it.meta) },
            state = when (st.status) {
                uz.anncorp.smeta.feature.disk.DiskController.Status.LOADING -> uz.anncorp.qurai.ui.screens.QDiskState.Loading
                uz.anncorp.smeta.feature.disk.DiskController.Status.READY -> uz.anncorp.qurai.ui.screens.QDiskState.Ready
                uz.anncorp.smeta.feature.disk.DiskController.Status.FAILED -> uz.anncorp.qurai.ui.screens.QDiskState.Failed
            },
            onRow = { r -> st.rows.firstOrNull { it.key == r.key }?.let { m -> if (!m.folder) ctl.showFile(m.key) else if (section == "mine" || section == "company") ctl.openFolder(m.id, m.name) } },
            crumbs = st.stack.takeIf { it.isNotEmpty() }?.joinToString(" / ") { it.name },
            onUp = if (st.canGoUp) ({ ctl.up() }) else null, upLabel = I18n.s("p1_back", "Orqaga"),
            emptyText = I18n.s("qa2_disk_empty", "Bu yerda hali hech narsa yo'q"),
            errorText = if (st.offline) Tx.offlineWrite else if (st.forbidden) I18n.s("qa2_disk_forbidden", "Bu diskni ko'rishga ruxsat yo'q") else "Yuklab bo'lmadi",
            onRetry = { ctl.reload() },
        )
    }
    st.detail?.let { d ->
        val labels = uz.anncorp.qurai.ui.screens.QDiskFileLabels(
            open = I18n.s("qa3_disk_open", "Ochish"), download = I18n.s("qa3_disk_download", "Yuklab olish"), system = I18n.s("qa3_disk_system", "Tizimda ochish"), versions = I18n.s("qa3_disk_versions", "Versiyalar"),
            current = I18n.s("qa3_disk_current", "joriy"), close = I18n.s("qa3_disk_close", "Yopish"), loading = I18n.s("qa3_disk_loading", "Yuklanmoqda..."),
            versionsFailed = I18n.s("qa3_disk_versions_failed", "Versiyalarni yuklab bo'lmadi"), busy = I18n.s("qa3_disk_busy", "Tayyorlanmoqda..."),
        )
        val notice = d.notice?.let { n -> when (n) {
            uz.anncorp.smeta.feature.disk.DiskNotice.SAVED -> I18n.s("qa3_disk_n_saved", "Tayyor"); uz.anncorp.smeta.feature.disk.DiskNotice.OFFLINE -> Tx.offlineWrite
            uz.anncorp.smeta.feature.disk.DiskNotice.FORBIDDEN -> I18n.s("qa3_disk_n_forbidden", "Bu faylni ochishga ruxsat yo'q"); uz.anncorp.smeta.feature.disk.DiskNotice.TOO_LARGE -> I18n.s("qa3_disk_n_too_large", "Fayl juda katta")
            uz.anncorp.smeta.feature.disk.DiskNotice.MISSING -> I18n.s("qa3_disk_n_missing", "Fayl topilmadi"); uz.anncorp.smeta.feature.disk.DiskNotice.PAYMENT -> I18n.s("qa3_disk_n_payment", "Bu hujjat saytda to'lanadi")
            uz.anncorp.smeta.feature.disk.DiskNotice.FAILED -> I18n.s("qa3_disk_n_failed", "Faylni olib bo'lmadi")
        } }
        uz.anncorp.qurai.ui.screens.QDiskFileDialog(
            name = d.file.name, meta = d.file.detailText(), versions = d.versions?.map { uz.anncorp.qurai.ui.screens.QDiskVersionRow(it.number, it.diskLabel(), it.current) }, versionsFailed = d.versionsFailed,
            busy = d.busy, notice = notice, noticeOk = d.notice == uz.anncorp.smeta.feature.disk.DiskNotice.SAVED, labels = labels,
            onOpen = { ctl.deliver(null, true) }, onDownload = { ctl.deliver(null, false) }, onVersion = { ctl.deliver(it, false) },
            onSystem = if (ctl.systemTarget() != null) ({ ctl.openInSystem() }) else null, onClose = { ctl.closeFile() },
        )
    }
}

// ============================ Hujjat aylanishi ============================

@Composable
fun DocsScreen(c: Ctx) = NeedObject(c) { o ->
    var bump by remember { mutableStateOf(0) }
    val docs = load(o.id, c.tick + bump) { c.repo.docs(c.place.companyId, o.id) }
    var openItem by remember { mutableStateOf<uz.anncorp.smeta.core.data.ApprovalItem?>(null) }
    val inbox = load(c.place.companyId, c.tick + bump) { Loaded.Fresh(ApprovalsRepository(c.sv.api).inbox(c.place.companyId).second) }
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    Page("Hujjatlar: ${o.nom}", "Qatorni bosing: hujjat yuklanadi va ochiladi") {
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        UploadBar(c, o.id) { bump++ }
        if (docs == null) { QLoading(); return@Page }
        docs.Banner()
        Box(Modifier.fillMaxWidth().height(300.dp)) {
            QTable(
                docs.valueOrNull().orEmpty(), listOf(
                    QCol("Fayl", 420.dp, sort = { it.name.lowercase() }) { it.name },
                    QCol("Turi", 110.dp, sort = { it.type }) { it.type },
                    QCol("Hajmi", 100.dp, true, { it.size }) { "${it.size / 1024} KB" },
                    QCol("Yangilangan", 150.dp, sort = { it.updated }) { formatIsoStamp(it.updated) },
                    QCol("Tayyor", 80.dp) { if (it.ready) "ha" else "yo'q" },
                ), key = { it.id },
                onClick = { d ->
                    scope.launch {
                        msg = null
                        val r = c.sv.api.bffBytes(docPath(d.id), DOC_MAX_BYTES)
                        if (r.ok && r.bytes != null) saveAndOpen(r.filename ?: d.name, r.bytes!!) else msg = if (r.status == 0) Tx.offlineWrite else "Yuklab bo'lmadi: ${r.code ?: r.status}"
                    }
                },
            )
        }
        Text("Tasdiqlash kutayotganlar", fontWeight = FontWeight.SemiBold)
        val items = inbox.valueOrNull().orEmpty()
        if (inbox == null) QLoading() else if (items.isEmpty()) QHint("Hozircha tasdiqlash kutayotgan hujjat yo'q") else {
            QTable(
                items, listOf(
                    QCol("Sarlavha", 360.dp, sort = { it.sarlavha }) { it.sarlavha },
                    QCol("Turi", 110.dp, sort = { it.tur }) { it.tur },
                    QCol("Rol", 110.dp) { it.rol ?: "" },
                    QCol("Muddat", 120.dp, sort = { it.muddat }) { formatDate(it.muddat) },
                    QCol("Kechikkan", 90.dp) { if (it.kechikkan) "ha" else "" },
                ), modifier = Modifier.weight(1f), key = { it.id }, onClick = { openItem = it },
            )
            QHint("Qatorni bosing: hujjat ochiladi, u yerda tasdiqlash, qaytarish yoki rad etish (sabab bilan).")
            openItem?.let { it0 -> ApprovalDialog(c, it0) { changed -> openItem = null; if (changed) bump++ } }
        }
    }
}

// ============================ Bildirishnomalar ============================

@Composable
fun NotifScreen(c: Ctx, onRead: () -> Unit) {
    val repo = remember { TodayRepository(c.sv.api) }
    var tick by remember { mutableStateOf(0) }
    val list = load(c.tick, tick) { repo.notifications(100, false)?.let { Loaded.Fresh(it) } ?: Loaded.NoData }
    val scope = rememberCoroutineScope()
    Page("Bildirishnomalar") {
        if (list == null) { QLoading(); return@Page }
        val v = list.valueOrNull()
        if (v == null) { list.Banner(); return@Page }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("O'qilmagan: ${v.unread}")
            QPrimaryButton(onClick = { scope.launch { repo.markRead(v.items.filter { !it.oqildi }.map { it.id }); tick++; onRead() } }, enabled = v.unread > 0) { Text("Hammasini o'qilgan deb belgilash") }
        }
        QTable(
            v.items, listOf(
                QCol("", 30.dp) { if (it.oqildi) "" else "в—Џ" },
                QCol("Mavzu", 420.dp, sort = { it.mavzu }) { notifKind(it.mavzu).label() },
                QCol("Vaqt", 170.dp, sort = { it.yaratildi }) { it.yaratildi?.let { s -> formatIsoStamp(s) } ?: "" },
            ), modifier = Modifier.weight(1f), key = { it.id },
        )
    }
}

private fun uz.anncorp.smeta.core.data.NotifKind.label(): String = when (this) {
    uz.anncorp.smeta.core.data.NotifKind.APPROVAL_WAITING -> "Tasdiqlash kutilmoqda"
    uz.anncorp.smeta.core.data.NotifKind.APPROVED -> "Tasdiqlandi"
    uz.anncorp.smeta.core.data.NotifKind.REJECTED -> "Rad etildi"
    uz.anncorp.smeta.core.data.NotifKind.RETURNED -> "Qaytarildi"
    uz.anncorp.smeta.core.data.NotifKind.LETTER -> "Yangi xat"
    uz.anncorp.smeta.core.data.NotifKind.DEADLINE_NEAR -> "Muddat yaqin"
    uz.anncorp.smeta.core.data.NotifKind.DEADLINE_PASSED -> "Muddat o'tdi"
    uz.anncorp.smeta.core.data.NotifKind.DRAWING -> "Chizma"
    uz.anncorp.smeta.core.data.NotifKind.DRAWING_DECISION -> "Chizma qarori"
    uz.anncorp.smeta.core.data.NotifKind.OTHER -> "Xabar"
}

// ============================ Sozlamalar / profil ============================

@Composable
fun SettingsScreen(c: Ctx) {
    val prof = load(c.me.id, c.tick) { c.repo.profile() }
    var name by remember { mutableStateOf<String?>(null) }
    var phone by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    Page(T("Sozlamalar")) {
        if (prof == null) { QLoading(); return@Page }
        prof.Banner()
        val p = prof.valueOrNull()
        QPanel {
            Text("Profil", fontWeight = FontWeight.SemiBold)
            Text("Email / login: ${p?.email ?: c.me.email}")
            Text("Rol: ${c.me.role}   |   Kompaniya: ${c.place.nom} (${c.place.rol})")
            QInput(name ?: p?.ism.orEmpty(), { name = it }, label = "Ism", singleLine = true, modifier = Modifier.width(360.dp))
            QInput(phone ?: p?.telefon.orEmpty(), { phone = it }, label = "Telefon", singleLine = true, modifier = Modifier.width(360.dp))
            QPrimaryButton(onClick = {
                scope.launch {
                    val r = c.sv.api.bff("/api/profil", "POST", profileUpdateBody(name?.takeIf { it.isNotBlank() }, phone?.takeIf { it.isNotBlank() }, null))
                    msg = if (r.ok) "Saqlandi" else if (r.networkError) Tx.offlineWrite else "Xato: ${r.code ?: r.status}"
                }
            }, enabled = (name != null || phone != null) && !c.me.offline) { Text("Saqlash") }
            msg?.let { Text(it) }
        }
        // Til + Mavzu on top of the page (QA 2026-11-18: no language setting on Windows). The language list reads the same translations as Android.
        QPanel {
            Text(T("Til"), fontWeight = FontWeight.SemiBold)
            QFilterBar(I18n.languages, DesktopPrefs.lang, { I18n.names[it] ?: it }, { DesktopPrefs.chooseLang(it) })
            Text(I18n.s("qa2_theme", "Mavzu"), fontWeight = FontWeight.SemiBold)
            QFilterBar(listOf(true, false), DesktopPrefs.dark, { if (it) I18n.s("qa2_theme_dark", "Qorong'i") else I18n.s("qa2_theme_light", "Yorug'") }, { DesktopPrefs.chooseDark(it) })
        }
        QPanel {
            Text("Ilova", fontWeight = FontWeight.SemiBold)
            Text("QURAI Windows v${BuildInfo.VERSION}")
            Text("Server: ${BuildInfo.API_BASE}")
            Text("Ma'lumotlar: ${AppPaths.root.absolutePath}")
            QHint("Oflayn nusxa shifrlangan (Windows DPAPI), 72 soat saqlanadi.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QSecondaryButton(onClick = { c.sv.cache.wipe(); c.sv.cache.scope(c.me.id); msg = "Oflayn nusxa tozalandi" }) { Text("Oflayn nusxani tozalash") }
                QSecondaryButton(onClick = { openFile(AppPaths.logs) }) { Text("Jurnal papkasi") }
                QSecondaryButton(onClick = { openFile(downloadsDir()) }) { Text("Yuklangan hujjatlar") }
            }
        }
        QPanel {
            Text("Tezkor tugmalar", fontWeight = FontWeight.SemiBold)
            Text("Ctrl+K: Jarvis paneli   |   Ctrl+1..9: bo'limlar   |   F5: yangilash   |   Ctrl+E: Jarvis ga fokus")
        }
        QPrimaryButton(onClick = { scope.launch { c.sv.signOut() } }) { Text("Chiqish") }
    }
}
