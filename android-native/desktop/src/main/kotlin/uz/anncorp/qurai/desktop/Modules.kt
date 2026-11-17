package uz.anncorp.qurai.desktop

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
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
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
    if (o == null) Hint("Yuqoridan obyektni tanlang") else content(o)
}

@Composable
private fun Page(title: String, sub: String? = null, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) { Title(title, sub); content() }
}

private fun statusUz(s: F2Status, raw: String?): String = when (s) {
    F2Status.DRAFT -> "Qoralama"; F2Status.SUBMITTED -> "Yuborilgan"; F2Status.CHECKED -> "Tekshirilgan"; F2Status.APPROVED -> "Tasdiqlangan"
    F2Status.REJECTED -> "Rad etilgan"; F2Status.CANCELLED -> "Bekor qilingan"; F2Status.SUPERSEDED -> "Almashtirilgan"; F2Status.UNKNOWN -> raw ?: T_DASH
}

private const val T_DASH = "—"

/** The server sum package in the owner's order: QQS bilan first, then ustamali (ITOGO-4), then ustamasiz (direct). */
@Composable
fun PackStrip(label: String, p: SumPack?) {
    Row {
        Column(Modifier.width(150.dp)) { Text(label, fontWeight = FontWeight.SemiBold) }
        Kv("QQS bilan", money(p?.qqsBilan)); Kv("Ustamali (QQS siz)", money(p?.ustamali)); Kv("Ustamasiz (QQS siz)", money(p?.ustamasiz))
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
        OutlinedTextField(q, { q = it }, label = { Text("Qidirish") }, singleLine = true, modifier = Modifier.width(360.dp))
        val rows = c.objects.filter { q.isBlank() || it.nom.contains(q, ignoreCase = true) }
        SortTable(
            rows, listOf(
                Col("Obyekt", 380.dp, sort = { it.nom.lowercase() }) { it.nom },
                Col("Turi", 110.dp, sort = { it.tur }) { it.tur ?: T_DASH },
                Col("Qator", 80.dp, true, { it.rows }) { it.rows?.toString() ?: T_DASH },
                Col("Narxsiz", 80.dp, true, { it.unpriced }) { it.unpriced?.toString() ?: T_DASH },
                Col("Smeta (QQS bilan)", 170.dp, true, { m[it.id]?.smeta?.qqsBilan }) { money(m[it.id]?.smeta?.qqsBilan) },
                Col("Fakt %", 80.dp, true, { m[it.id]?.factPct }) { formatPercent(m[it.id]?.factPct) },
                Col("F-2 %", 80.dp, true, { m[it.id]?.f2Pct }) { formatPercent(m[it.id]?.f2Pct) },
            ), key = { it.id }, onClick = onOpen, selected = { it.id == c.obj?.id },
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
        if (pk == null) { Loading(); return@Page }
        pk.Banner()
        val p = pk.valueOrNull() ?: return@Page
        PackStrip("Smeta (server)", mny.valueOrNull()?.get(o.id)?.smeta)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(q, { q = it }, label = { Text("Kod yoki nom bo'yicha qidirish") }, singleLine = true, modifier = Modifier.width(380.dp))
            OutlinedButton(onClick = { expanded = p.nodes.filter { it.hasChildren }.map { it.id }.toSet() }) { Text("Hammasini yoyish") }
            OutlinedButton(onClick = { expanded = emptySet() }) { Text("Yig'ish") }
            Hint("${p.nodes.size} ta tugun, ${p.blCount} ta ish")
        }
        val vis = remember(p, expanded, q) { visibleNodes(p.nodes, if (q.isBlank()) expanded else p.nodes.filter { it.hasChildren }.map { it.id }.toSet(), q) }
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(vertical = 6.dp)) {
            HeadCell("Kod / nom", 560.dp); HeadCell("Birlik", 70.dp); HeadCell("Hajm", 100.dp, true); HeadCell("Narx", 110.dp, true); HeadCell("Smeta summa", 150.dp, true); HeadCell("Fakt", 140.dp, true); HeadCell("F-2", 140.dp, true)
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(vis, key = { it.id }) { x ->
                val sum = if (x.isRz) x.roll else x.summa
                Row(Modifier.fillMaxWidth().clickable(enabled = x.hasChildren) { expanded = if (x.id in expanded) expanded - x.id else expanded + x.id }.padding(vertical = 4.dp)) {
                    val mark = if (x.hasChildren) (if (x.id in expanded || q.isNotBlank()) "▾ " else "▸ ") else "   "
                    Text(
                        mark + (x.kod?.let { "$it  " } ?: "") + x.nom, Modifier.width(560.dp).padding(start = (x.depth * 16).dp, end = 6.dp),
                        fontWeight = if (x.isRz) FontWeight.Bold else if (x.isBl) FontWeight.Medium else FontWeight.Normal, maxLines = 2,
                    )
                    DataCell(x.birlik ?: "", 70.dp); DataCell(if (x.isRz) "" else qty(x.hajm), 100.dp, true); DataCell(if (x.isRz) "" else money(x.narx), 110.dp, true)
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
    val acts = load(o.id, c.tick) { c.repo.f2Acts(o.id) }
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    val gen = load(o.id, c.tick) { Loaded.Fresh(DocGenRepository(c.sv.api).list(c.place.companyId, o.id).orEmpty()) }
    var pick by remember(o.id) { mutableStateOf<F2Act?>(null) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    Page("F-2 aktlar: ${o.nom}", "Qatorni bosing: akt qatorlari ochiladi") {
        if (acts == null) { Loading(); return@Page }
        acts.Banner()
        val mo: ObjectMoney? = mny.valueOrNull()?.get(o.id)
        PackStrip("Qabul qilingan F-2 (server)", mo?.f2)
        val list = acts.valueOrNull().orEmpty()
        Box(Modifier.fillMaxWidth().height(220.dp)) {
            SortTable(
                list, listOf(
                    Col("Oy", 90.dp, sort = { it.oy }) { f2MonthLabel(it.oy) ?: T_DASH },
                    Col("Raqam", 140.dp, sort = { it.raqam }) { it.raqam ?: T_DASH },
                    Col("Holat", 140.dp, sort = { it.state.ordinal }) { statusUz(it.state, it.status) },
                    Col("Qator", 80.dp, true, { it.rows }) { it.rows?.toString() ?: T_DASH },
                    Col("Narxsiz", 80.dp, true, { it.unpriced }) { it.unpriced?.toString() ?: T_DASH },
                    Col("Minus", 80.dp, true, { it.negativeRows }) { it.negativeRows?.toString() ?: T_DASH },
                    Col("Farq", 60.dp) { if (it.hasDiff) "ha" else "" },
                ), key = { it.id }, onClick = { pick = it }, selected = { it.id == pick?.id },
            )
        }
        val a = pick
        if (a != null) ActRows(c, o, a)
        val f2docs = gen.valueOrNull().orEmpty().filter { it.isF2 }
        if (f2docs.isNotEmpty()) {
            Text("Eksport (Excel / PDF)", fontWeight = FontWeight.SemiBold)
            Hint("Yuklab olinganda tokenlar yechilishi mumkin; qayta yuklash bepul.")
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
    if (rows == null) { Loading(); return }
    rows.Banner()
    val r = rows.valueOrNull().orEmpty()
    val direct = r.sumOf { it.summa ?: 0.0 }
    Row { Kv("Qatorlar soni", r.size.toString()); Kv("Qatorlar summasi (ustamasiz, QQS siz)", money(direct)); Kv("QQS bilan (12 %)", money(uz.anncorp.smeta.core.data.withVat(direct))) }
    Hint("Ustamali va QQS bilan butun obyekt summasi yuqorida (serverdan). Akt qatorlari summasi: faqat to'g'ridan-to'g'ri.")
    Box(Modifier.fillMaxWidth().height(260.dp)) {
        SortTable(
            r, listOf(
                Col("Kod", 120.dp, sort = { it.kod }) { it.kod ?: "" },
                Col("Nomi", 420.dp, sort = { it.nom.lowercase() }) { it.nom },
                Col("Birlik", 70.dp) { it.birlik ?: "" },
                Col("Hajm", 100.dp, true, { it.hajm }) { qty(it.hajm) },
                Col("Narx", 110.dp, true, { it.narx }) { money(it.narx) },
                Col("Summa", 140.dp, true, { it.summa }) { money(it.summa) },
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
        g.formats.forEach { f -> OutlinedButton(onClick = { onGen(f) }, enabled = !busy) { Text(f.uppercase()) } }
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
        journal?.Banner()
        Text("Fakt jurnali", fontWeight = FontWeight.SemiBold)
        Box(Modifier.fillMaxWidth().height(180.dp)) {
            if (journal == null) Loading() else SortTable(
                journal.valueOrNull().orEmpty(), listOf(
                    Col("Raqam", 140.dp, sort = { it.raqam }) { it.raqam ?: "#${it.id}" },
                    Col("Oy", 100.dp, sort = { it.oy }) { f2MonthLabel(it.oy) ?: T_DASH },
                    Col("Holat", 130.dp, sort = { it.status }) { it.status ?: T_DASH },
                    Col("Jami (hujjat)", 160.dp, true, { it.jami }) { money(it.jami) },
                ), key = { it.id },
            )
        }
        HorizontalDivider()
        Text("Yangi fakt yozuvi", fontWeight = FontWeight.SemiBold)
        val p = pk.valueOrNull()
        if (pk == null) Loading() else if (p == null) { pk.Banner() } else {
            val works = remember(p) { p.nodes.filter { it.isBl } }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(q, { q = it; chosen = null }, label = { Text("Ishni qidiring (kod / nom)") }, singleLine = true, modifier = Modifier.width(360.dp))
                OutlinedTextField(vol, { vol = it }, label = { Text("Hajm (minus mumkin)") }, singleLine = true, modifier = Modifier.width(160.dp), keyboardOptions = KeyboardOptions())
                OutlinedTextField(date, { date = it }, label = { Text("Sana (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.width(170.dp))
                val v = uz.anncorp.smeta.core.data.parseVolume(vol)
                Button(onClick = { chosen?.let { draft.add(it to v!!) }; vol = ""; chosen = null }, enabled = chosen != null && v != null) { Text("Qo'shish") }
            }
            val hits = if (q.isBlank() || chosen != null) emptyList() else works.filter { (it.kod ?: "").contains(q, true) || it.nom.contains(q, true) }.take(8)
            hits.forEach { w ->
                Text("${w.kod ?: ""}  ${w.nom}  [${w.birlik ?: ""}]  smeta ${qty(w.hajm)}, fakt ${qty(w.faktHajm)}", Modifier.fillMaxWidth().clickable { chosen = w; q = w.nom }.padding(vertical = 3.dp), style = MaterialTheme.typography.bodyMedium)
            }
            chosen?.let { Hint("Tanlandi: ${it.nom}") }
            draft.forEachIndexed { i, (n, h) ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${n.kod ?: ""} ${n.nom}", Modifier.weight(1f), maxLines = 1); Text("${qty(h)} ${n.birlik ?: ""}")
                    TextButton(onClick = { draft.removeAt(i) }) { Text("Olib tashlash") }
                }
            }
            msg?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            Button(onClick = { confirm = true }, enabled = draft.isNotEmpty() && !busy && Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(date)) { Text("Yozish (${draft.size} qator)") }
        }
        if (confirm) AlertDialog(
            onDismissRequest = { confirm = false }, title = { Text("Faktni yozish") },
            text = { Text("${o.nom}: ${draft.size} qator, sana $date. Serverga yoziladi.") },
            confirmButton = { TextButton(onClick = {
                confirm = false; busy = true
                scope.launch {
                    val r = c.sv.api.bff("/api/sb-yoz", "POST", faktWriteBody(c.place.companyId, o.id, date, draft.map { FaktLine(it.first.id, it.second) }, UUID.randomUUID().toString()))
                    val out = parseFaktOutcome(r)
                    msg = when {
                        r.networkError -> Tx.offlineWrite
                        out.ok -> "Yozildi: ${out.raqam ?: ""} ${out.jami?.let { "jami " + money(it) } ?: ""} ${out.warnings.joinToString("; ")}".trim().also { draft.clear(); refresh++ }
                        else -> "Xato: ${out.error ?: "HTTP ${r.status}"}"
                    }
                    Log.i("fakt write ok=${out.ok} status=${r.status}")
                    busy = false
                }
            }) { Text("Yozish") } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Bekor") } },
        )
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
        if (gen == null) { Loading(); return@Page }
        val items = (gen as? Loaded.Fresh)?.data
        if (items == null) { Text("Hujjatlar ro'yxatini yuklab bo'lmadi (oflayn yoki ruxsat yo'q)", color = MaterialTheme.colorScheme.error); return@Page }
        val own = items.filter { it.type == "nakopitelniy" || it.type == "slichitelniy" || it.type == "ostatka" || it.isF3 }
        Hint("Yuklab olinganda tokenlar yechilishi mumkin; qayta yuklash bepul. Tasdiqlangan F-2 oylari: ${acts.valueOrNull().orEmpty().count { it.state == F2Status.APPROVED }} ta")
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (own.isEmpty()) Hint("Bu obyekt uchun nakopitelniy / slichitelniy hozircha yo'q (tasdiqlangan F-2 kerak)")
        LazyColumn(Modifier.fillMaxSize()) {
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
        if (narx == null) { Loading(); return@Page }
        narx.Banner()
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(q, { q = it }, label = { Text("Resurs qidirish") }, singleLine = true, modifier = Modifier.width(360.dp))
            OutlinedButton(onClick = { onlyRisk = !onlyRisk }) { Text(if (onlyRisk) "Hammasi" else "Faqat xavfli farq") }
        }
        val rows = narx.valueOrNull().orEmpty().filter { (q.isBlank() || it.nom.contains(q, true)) && (!onlyRisk || it.xavf) }
        Hint("${rows.size} ta resurs")
        SortTable(
            rows, listOf(
                Col("Resurs", 400.dp, sort = { it.nom.lowercase() }) { it.nom },
                Col("Birlik", 70.dp, sort = { it.birlik }) { it.birlik ?: "" },
                Col("Turi", 90.dp, sort = { it.kat }) { it.kat ?: "" },
                Col("Obyekt", 70.dp, true, { it.obyektSoni }) { it.obyektSoni.toString() },
                Col("Smeta min", 120.dp, true, { it.smetaMin }) { money(it.smetaMin) },
                Col("Smeta max", 120.dp, true, { it.smetaMax }) { money(it.smetaMax) },
                Col("Belgilangan", 120.dp, true, { it.belgilangan }) { money(it.belgilangan) },
                Col("Natija (max)", 130.dp, true, { it.natija }) { money(it.natija) },
                Col("Manba", 100.dp, sort = { it.manba }) { it.manba ?: "" },
                Col("Xavf", 60.dp, sort = { it.xavf }) { if (it.xavf) "farq>5%" else "" },
            ),
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
            OutlinedButton(onClick = { tab = 0 }) { Text(if (tab == 0) "● Obyektlar bo'yicha" else "Obyektlar bo'yicha") }
            OutlinedButton(onClick = { tab = 1 }) { Text(if (tab == 1) "● Qarzdorlar" else "Qarzdorlar") }
        }
        if (tab == 0) {
            if (mny == null) { Loading(); return@Page }
            mny.Banner()
            val m = mny.valueOrNull().orEmpty()
            val rows = c.objects.filter { m[it.id]?.any == true }
            Hint("${rows.size} ta obyekt (moliyaviy ma'lumoti borlari)")
            SortTable(
                rows, listOf(
                    Col("Obyekt", 300.dp, sort = { it.nom.lowercase() }) { it.nom },
                    Col("Smeta QQS bilan", 150.dp, true, { m[it.id]?.smeta?.qqsBilan }) { money(m[it.id]?.smeta?.qqsBilan) },
                    Col("Smeta ustamali", 150.dp, true, { m[it.id]?.smeta?.ustamali }) { money(m[it.id]?.smeta?.ustamali) },
                    Col("Smeta ustamasiz", 150.dp, true, { m[it.id]?.smeta?.ustamasiz }) { money(m[it.id]?.smeta?.ustamasiz) },
                    Col("Fakt QQS bilan", 150.dp, true, { m[it.id]?.fakt?.qqsBilan }) { money(m[it.id]?.fakt?.qqsBilan) },
                    Col("Fakt ustamali", 150.dp, true, { m[it.id]?.fakt?.ustamali }) { money(m[it.id]?.fakt?.ustamali) },
                    Col("Fakt ustamasiz", 150.dp, true, { m[it.id]?.fakt?.ustamasiz }) { money(m[it.id]?.fakt?.ustamasiz) },
                    Col("F-2 QQS bilan", 150.dp, true, { m[it.id]?.f2?.qqsBilan }) { money(m[it.id]?.f2?.qqsBilan) },
                    Col("F-2 ustamali", 150.dp, true, { m[it.id]?.f2?.ustamali }) { money(m[it.id]?.f2?.ustamali) },
                    Col("F-2 ustamasiz", 150.dp, true, { m[it.id]?.f2?.ustamasiz }) { money(m[it.id]?.f2?.ustamasiz) },
                    Col("Shartnoma (QQS bilan)", 170.dp, true, { m[it.id]?.contractQqs }) { money(m[it.id]?.contractQqs) },
                    Col("To'langan", 150.dp, true, { m[it.id]?.paid }) { money(m[it.id]?.paid) },
                    Col("Qarz", 150.dp, true, { m[it.id]?.debt }) { money(m[it.id]?.debt) },
                    Col("Fakt %", 80.dp, true, { m[it.id]?.factPct }) { formatPercent(m[it.id]?.factPct) },
                    Col("F-2 %", 80.dp, true, { m[it.id]?.f2Pct }) { formatPercent(m[it.id]?.f2Pct) },
                ), key = { it.id },
            )
        } else {
            if (debts == null) { Loading(); return@Page }
            debts.Banner()
            val rows = debts.valueOrNull().orEmpty()
            val known = rows.mapNotNull { it.qarz }
            Row { Kv("Qarz jami (ma'lum qatorlar)", money(if (known.isEmpty()) null else known.sum())); Kv("Shartnoma", rows.size.toString()) }
            SortTable(
                rows, listOf(
                    Col("Kontragent", 260.dp, sort = { it.kontragent?.lowercase() }) { it.kontragent ?: "" },
                    Col("Shartnoma", 200.dp, sort = { it.raqam }) { listOfNotNull(it.raqam, it.nom).joinToString(" ") },
                    Col("Summa", 150.dp, true, { it.shartnoma }) { money(it.shartnoma) },
                    Col("F-3 sotuv", 150.dp, true, { it.f3 }) { money(it.f3) },
                    Col("To'langan", 150.dp, true, { it.tolangan }) { money(it.tolangan) },
                    Col("Qarz", 150.dp, true, { it.qarz }) { money(it.qarz) },
                    Col("Oxirgi to'lov", 110.dp, sort = { it.oxirgiTolov }) { it.oxirgiTolov?.take(10) ?: "" },
                ),
            )
        }
    }
}

// ============================ Hujjatlar ============================

@Composable
fun DocsScreen(c: Ctx) = NeedObject(c) { o ->
    val docs = load(o.id, c.tick) { c.repo.docs(c.place.companyId, o.id) }
    val inbox = load(c.place.companyId, c.tick) { Loaded.Fresh(ApprovalsRepository(c.sv.api).inbox(c.place.companyId).second) }
    val scope = rememberCoroutineScope()
    var msg by remember { mutableStateOf<String?>(null) }
    Page("Hujjatlar: ${o.nom}", "Qatorni bosing: hujjat yuklanadi va ochiladi") {
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (docs == null) { Loading(); return@Page }
        docs.Banner()
        Box(Modifier.fillMaxWidth().height(300.dp)) {
            SortTable(
                docs.valueOrNull().orEmpty(), listOf(
                    Col("Fayl", 420.dp, sort = { it.name.lowercase() }) { it.name },
                    Col("Turi", 110.dp, sort = { it.type }) { it.type },
                    Col("Hajmi", 100.dp, true, { it.size }) { "${it.size / 1024} KB" },
                    Col("Yangilangan", 150.dp, sort = { it.updated }) { formatIsoStamp(it.updated) },
                    Col("Tayyor", 80.dp) { if (it.ready) "ha" else "yo'q" },
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
        if (inbox == null) Loading() else if (items.isEmpty()) Hint("Hozircha tasdiqlash kutayotgan hujjat yo'q") else {
            SortTable(
                items, listOf(
                    Col("Sarlavha", 360.dp, sort = { it.sarlavha }) { it.sarlavha },
                    Col("Turi", 110.dp, sort = { it.tur }) { it.tur },
                    Col("Rol", 110.dp) { it.rol ?: "" },
                    Col("Muddat", 120.dp, sort = { it.muddat }) { it.muddat?.take(10) ?: "" },
                    Col("Kechikkan", 90.dp) { if (it.kechikkan) "ha" else "" },
                ), key = { it.id },
            )
            Hint("Qaror (tasdiqlash / rad etish) hozircha Android ilovada yoki saytda; bu yerda faqat ko'rish.")
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
        if (list == null) { Loading(); return@Page }
        val v = list.valueOrNull()
        if (v == null) { list.Banner(); return@Page }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("O'qilmagan: ${v.unread}")
            Button(onClick = { scope.launch { repo.markRead(v.items.filter { !it.oqildi }.map { it.id }); tick++; onRead() } }, enabled = v.unread > 0) { Text("Hammasini o'qilgan deb belgilash") }
        }
        SortTable(
            v.items, listOf(
                Col("", 30.dp) { if (it.oqildi) "" else "●" },
                Col("Mavzu", 420.dp, sort = { it.mavzu }) { notifKind(it.mavzu).label() },
                Col("Vaqt", 170.dp, sort = { it.yaratildi }) { it.yaratildi?.let { s -> formatIsoStamp(s) } ?: "" },
            ), key = { it.id },
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
    Page("Sozlamalar") {
        if (prof == null) { Loading(); return@Page }
        prof.Banner()
        val p = prof.valueOrNull()
        Section {
            Text("Profil", fontWeight = FontWeight.SemiBold)
            Text("Email / login: ${p?.email ?: c.me.email}")
            Text("Rol: ${c.me.role}   |   Kompaniya: ${c.place.nom} (${c.place.rol})")
            OutlinedTextField(name ?: p?.ism.orEmpty(), { name = it }, label = { Text("Ism") }, singleLine = true, modifier = Modifier.width(360.dp))
            OutlinedTextField(phone ?: p?.telefon.orEmpty(), { phone = it }, label = { Text("Telefon") }, singleLine = true, modifier = Modifier.width(360.dp))
            Button(onClick = {
                scope.launch {
                    val r = c.sv.api.bff("/api/profil", "POST", profileUpdateBody(name?.takeIf { it.isNotBlank() }, phone?.takeIf { it.isNotBlank() }, null))
                    msg = if (r.ok) "Saqlandi" else if (r.networkError) Tx.offlineWrite else "Xato: ${r.code ?: r.status}"
                }
            }, enabled = (name != null || phone != null) && !c.me.offline) { Text("Saqlash") }
            msg?.let { Text(it) }
        }
        Section {
            Text("Ilova", fontWeight = FontWeight.SemiBold)
            Text("QURAI Windows v${BuildInfo.VERSION}")
            Text("Server: ${BuildInfo.API_BASE}")
            Text("Ma'lumotlar: ${AppPaths.root.absolutePath}")
            Hint("Oflayn nusxa shifrlangan (Windows DPAPI), 72 soat saqlanadi.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { c.sv.cache.wipe(); c.sv.cache.scope(c.me.id); msg = "Oflayn nusxa tozalandi" }) { Text("Oflayn nusxani tozalash") }
                OutlinedButton(onClick = { openFile(AppPaths.logs) }) { Text("Jurnal papkasi") }
                OutlinedButton(onClick = { openFile(downloadsDir()) }) { Text("Yuklangan hujjatlar") }
            }
        }
        Section {
            Text("Tezkor tugmalar", fontWeight = FontWeight.SemiBold)
            Text("Ctrl+K: Jarvis paneli   |   Ctrl+1..9: bo'limlar   |   F5: yangilash   |   Ctrl+E: Jarvis ga fokus")
        }
        Button(onClick = { scope.launch { c.sv.signOut() } }) { Text("Chiqish") }
    }
}
