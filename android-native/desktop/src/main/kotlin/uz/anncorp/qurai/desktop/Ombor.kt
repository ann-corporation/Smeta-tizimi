package uz.anncorp.qurai.desktop

import uz.anncorp.qurai.ui.components.*

import uz.anncorp.smeta.feature.common.*

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.parseVolume
import uz.anncorp.smeta.feature.ombor.OmborScope
import uz.anncorp.smeta.feature.ombor.StockRow
import uz.anncorp.smeta.feature.ombor.Warehouse
import uz.anncorp.smeta.feature.ombor.filterStock
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.objectStockRequest
import uz.anncorp.smeta.feature.ombor.parseObjectStock
import java.time.LocalDate

private sealed interface Entry {
    data class User(val text: String) : Entry
    data class Reply(val reply: OmborReply) : Entry
    data class Done(val text: String, val ok: Boolean) : Entry
}

private enum class OTab(val title: String) { Cmd("Kirim / chiqim"), Stock("Qoldiq"), Report("Hisobot"), Objects("Obyektlarda") }

/** Ombor: voice-free typed commands (kirim / chiqim with the server's preview-confirm flow), stock on any date, period report, object stock. */
@Composable
fun OmborScreen(c: Ctx) {
    val cid = c.place.companyId
    val whs = load(cid, c.tick) { c.repo.warehouses(cid) }
    var wh by remember(cid) { mutableStateOf<Warehouse?>(null) }
    var tab by remember { mutableStateOf(OTab.Cmd) }
    val list = whs.valueOrNull().orEmpty()
    LaunchedEffect(list) { if (wh == null || list.none { it.id == wh?.id }) wh = list.firstOrNull() }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QPageHead("Ombor")
        whs?.Banner()
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QSelect(wh, list, { it.nomi }, { wh = it }, placeholder = "Ombor tanlang")
            OTab.entries.forEach { t ->
                if (t == tab) QPrimaryButton(onClick = { tab = t }) { Text(t.title) } else QSecondaryButton(onClick = { tab = t }) { Text(t.title) }
            }
        }
        if (whs == null) { QLoading(); return@Column }
        val w = wh
        when {
            tab == OTab.Objects -> OmborObjects(c)
            w == null -> QHint("Bu kompaniyada markaziy ombor topilmadi (yoki ruxsat yo'q)")
            tab == OTab.Cmd -> OmborCommands(c, w)
            tab == OTab.Stock -> OmborStock(c, w)
            else -> OmborReport(c, w)
        }
    }
}

// ---------- commands ----------

@Composable
private fun OmborCommands(c: Ctx, w: Warehouse) {
    val cid = c.place.companyId
    val log = remember(cid, w.id) { mutableStateListOf<Entry>() }
    var input by remember(cid, w.id) { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var lastText by remember(cid, w.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val ls = rememberLazyListState()
    LaunchedEffect(log.size) { if (log.isNotEmpty()) ls.animateScrollToItem(log.size - 1) }

    fun run(body: JsonObject, echo: String?) {
        if (busy) return
        busy = true
        if (echo != null) log.add(Entry.User(echo))
        scope.launch {
            val r = c.repo.omborCall(body)
            val rep = parseOmborReply(r)
            Log.i("ombor tahlil status=${r.status} -> ${rep::class.simpleName}")
            log.add(Entry.Reply(rep)); busy = false
        }
    }
    fun send() {
        val t = input.trim(); if (t.isEmpty()) return
        val prev = log.lastOrNull()
        // The previous answer was a question ("qancha?", "qaysi material?"): the typed text completes the same command.
        val full = if ((prev as? Entry.Reply)?.reply is OmborReply.Ask && lastText.isNotBlank() && t.split(" ").size <= 4) "$lastText $t" else t
        lastText = full; input = ""
        run(omborText(cid, w.id, full), t)
    }
    fun confirm(p: OmborReply.Preview) {
        if (busy) return
        busy = true
        scope.launch {
            val r: ApiResult = c.repo.omborCall(omborConfirm(cid, w.id, p.token))
            val code = r.code ?: r.body?.let { (it as? JsonObject)?.get("code") }?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
            val ok = r.ok && ((r.body as? JsonObject)?.get("ok") as? kotlinx.serialization.json.JsonPrimitive)?.content != "false"
            log.add(Entry.Done(when {
                r.networkError -> Tx.offlineWrite
                ok -> "Saqlandi: ${if (p.tur == "chiqim" || p.tur == "rasxod") "chiqim" else "kirim"} ${p.nomi} ${omborFmt(p.miqdor)} ${p.birligi}"
                code == "QOLDIQ_YETMAYDI" -> "Qoldiq yetmaydi"
                r.status == 403 -> Tx.forbidden
                else -> "Saqlanmadi: ${code ?: "HTTP ${r.status}"}"
            }, ok))
            Log.i("ombor tasdiq status=${r.status} ok=$ok")
            busy = false
        }
    }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QHint("Yozing: «sement 10 qop keldi», «armatura 2 tonna chiqdi», «sement qoldig'i», «shu oy kirim chiqim hisoboti». Server tushunadi, siz tasdiqlaysiz.")
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = ls, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(log.size) { i ->
                when (val e = log[i]) {
                    is Entry.User -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Text(e.text, color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.background(MaterialTheme.colorScheme.primary, MaterialTheme.shapes.medium).padding(10.dp))
                    }
                    is Entry.Done -> Text(e.text, color = if (e.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                    is Entry.Reply -> ReplyView(e.reply, i == log.lastIndex && !busy, onVariant = { v -> run(omborText(cid, w.id, lastText, v.tanlov), v.label) }, onConfirm = ::confirm,
                        onEdited = { p, nm, q, u, party, note -> run(omborEdited(cid, w.id, p.tur, nm, u, q, party, note), "Tuzatildi: $nm $q $u") })
                }
            }
            if (busy) item { QHint("Tekshirilmoqda...") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QInput(input, { input = it }, label = "Buyruq", modifier = Modifier.weight(1f), singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }))
            QPrimaryButton(onClick = { send() }, enabled = !busy && input.isNotBlank()) { Text("Yuborish") }
        }
    }
}

@Composable
private fun ReplyView(
    r: OmborReply, active: Boolean, onVariant: (OmborReply.Variant) -> Unit, onConfirm: (OmborReply.Preview) -> Unit,
    onEdited: (OmborReply.Preview, String, Double, String, String, String) -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when (r) {
            is OmborReply.Fail -> Text(r.text, color = MaterialTheme.colorScheme.error)
            is OmborReply.Info -> { Text(r.title, fontWeight = FontWeight.SemiBold); r.lines.forEach { Text(it) } }
            is OmborReply.Ask -> {
                Text(r.text, fontWeight = FontWeight.Medium)
                if (r.variants.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    r.variants.forEach { v -> QSecondaryButton(onClick = { onVariant(v) }, enabled = active) { Text(v.label, maxLines = 1) } }
                }
            }
            is OmborReply.Preview -> PreviewCard(r, active, onConfirm, onEdited)
        }
    }
}

@Composable
private fun PreviewCard(p: OmborReply.Preview, active: Boolean, onConfirm: (OmborReply.Preview) -> Unit, onEdited: (OmborReply.Preview, String, Double, String, String, String) -> Unit) {
    val issue = p.tur == "chiqim" || p.tur == "rasxod"
    var nm by remember(p.token) { mutableStateOf(p.nomi) }
    var q by remember(p.token) { mutableStateOf(p.miqdor?.let { omborFmt(it) } ?: "") }
    var u by remember(p.token) { mutableStateOf(p.birligi) }
    var party by remember(p.token) { mutableStateOf(p.kontragent) }
    var note by remember(p.token) { mutableStateOf(p.izoh) }
    Text(if (issue) "Chiqim (tasdiqlang)" else "Kirim (tasdiqlang)", fontWeight = FontWeight.Bold)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        QInput(nm, { nm = it }, label = "Material", singleLine = true, modifier = Modifier.width(300.dp), enabled = active)
        QInput(q, { q = it }, label = "Miqdor", singleLine = true, modifier = Modifier.width(120.dp), enabled = active)
        QInput(u, { u = it }, label = "Birlik", singleLine = true, modifier = Modifier.width(100.dp), enabled = active)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        QInput(party, { party = it }, label = if (issue) "Qabul qiluvchi" else "Yetkazuvchi", singleLine = true, modifier = Modifier.width(300.dp), enabled = active)
        QInput(note, { note = it }, label = "Izoh", singleLine = true, modifier = Modifier.width(220.dp), enabled = active)
    }
    if (p.obyekt.isNotBlank()) Text("Obyekt: ${p.obyekt}")
    if (p.before != null || p.after != null) Text("Qoldiq: ${omborFmt(p.before)} → ${omborFmt(p.after)}")
    if (p.priceAsk) QHint("Narx kiritilmagan: narxsiz saqlanadi (keyin qo'yish mumkin)")
    p.warnings.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
    val edited = nm != p.nomi || q != (p.miqdor?.let { omborFmt(it) } ?: "") || u != p.birligi || party != p.kontragent || note != p.izoh
    val qv = parseVolume(q)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (edited) QPrimaryButton(onClick = { onEdited(p, nm, qv ?: 0.0, u, party, note) }, enabled = active && nm.isNotBlank() && qv != null && qv > 0) { Text("Qayta tekshirish") }
        else QPrimaryButton(onClick = { onConfirm(p) }, enabled = active && p.miqdor != null && p.nomi.isNotBlank()) { Text("Tasdiqlash") }
    }
}

// ---------- stock on a date ----------

@Composable
private fun OmborStock(c: Ctx, w: Warehouse) {
    var date by remember { mutableStateOf("") }
    var applied by remember { mutableStateOf<String?>(null) }
    var q by remember { mutableStateOf("") }
    val st = load(w.id, "${applied}|${c.tick}") { c.repo.stock(c.place.companyId, w.id, applied) }
    val bad = date.isNotBlank() && runCatching { LocalDate.parse(date) }.isFailure
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QInput(date, { date = it }, label = "Sana (YYYY-MM-DD), bo'sh = bugun", singleLine = true, isError = bad, modifier = Modifier.width(260.dp))
            QPrimaryButton(onClick = { applied = date.ifBlank { null } }, enabled = !bad) { Text("Ko'rsatish") }
            QInput(q, { q = it }, label = "Material qidirish", singleLine = true, modifier = Modifier.width(260.dp))
        }
        if (st == null) { QLoading(); return@Column }
        st.Banner()
        val rows = st.valueOrNull().orEmpty().filter { q.isBlank() || uz.anncorp.smeta.feature.ombor.matchesQuery(it.nomi, q) }
        QHint("${w.nomi}: ${applied ?: "bugungi"} qoldiq, ${rows.size} ta material")
        QTable(
            rows, listOf(
                QCol("Material", 420.dp, sort = { it.nomi.lowercase() }) { it.nomi },
                QCol("Birlik", 80.dp, sort = { it.birligi }) { it.birligi },
                QCol("Qoldiq", 130.dp, true, { it.qoldiq }) { omborFmt(it.qoldiq) },
                QCol("Kirim", 130.dp, true, { it.kirim }) { omborFmt(it.kirim) },
                QCol("Chiqim", 130.dp, true, { it.chiqim }) { omborFmt(it.chiqim) },
                QCol("Oxirgi harakat", 130.dp, sort = { it.oxirgi }) { it.oxirgi?.take(10) ?: "" },
            ),
        )
    }
}

// ---------- period report ----------

@Composable
private fun OmborReport(c: Ctx, w: Warehouse) {
    val today = LocalDate.now()
    var dan by remember { mutableStateOf(today.withDayOfMonth(1).toString()) }
    var gacha by remember { mutableStateOf(today.toString()) }
    var q by remember { mutableStateOf("") }
    var op by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<Pair<List<MoveRow>, List<String>>?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun go(off: Int) {
        busy = true; err = null; offset = off
        scope.launch {
            val r = c.repo.report(c.place.companyId, w.id, dan.ifBlank { null }, gacha.ifBlank { null }, q.ifBlank { null }, op, off)
            val parsed = if (r.ok) parseMoves(r.body) else null
            if (parsed != null) state = parsed else err = if (r.networkError) Tx.offlineWrite else "Hisobot olinmadi: ${r.code ?: "HTTP ${r.status}"}"
            Log.i("ombor hisobot status=${r.status}")
            busy = false
        }
    }
    val okDates = runCatching { if (dan.isNotBlank()) LocalDate.parse(dan); if (gacha.isNotBlank()) LocalDate.parse(gacha); true }.getOrDefault(false)
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            QInput(dan, { dan = it }, label = "Dan", singleLine = true, modifier = Modifier.width(150.dp))
            QInput(gacha, { gacha = it }, label = "Gacha", singleLine = true, modifier = Modifier.width(150.dp))
            QInput(q, { q = it }, label = "Material", singleLine = true, modifier = Modifier.width(200.dp))
            QSelect(op, listOf(null, "prixod", "rasxod"), { when (it) { "prixod" -> "Faqat kirim"; "rasxod" -> "Faqat chiqim"; else -> "Kirim va chiqim" } }, { op = it }, placeholder = "Kirim va chiqim")
            QPrimaryButton(onClick = { go(0) }, enabled = okDates && !busy) { Text("Ko'rsatish") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            QGhostButton(onClick = { dan = today.toString(); gacha = today.toString() }) { Text("Bugun") }
            QGhostButton(onClick = { dan = today.minusDays(6).toString(); gacha = today.toString() }) { Text("7 kun") }
            QGhostButton(onClick = { dan = today.withDayOfMonth(1).toString(); gacha = today.toString() }) { Text("Shu oy") }
            QGhostButton(onClick = { val m = today.minusMonths(1); dan = m.withDayOfMonth(1).toString(); gacha = m.withDayOfMonth(m.lengthOfMonth()).toString() }) { Text("O'tgan oy") }
            QGhostButton(onClick = { dan = today.withDayOfYear(1).toString(); gacha = today.toString() }) { Text("Shu yil") }
        }
        err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (busy) QLoading()
        val s = state
        if (s != null) {
            Column { s.second.forEach { Text(it) } }
            QHint("${s.first.size} qator ko'rsatilmoqda (${offset + 1}-${offset + s.first.size})")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QSecondaryButton(onClick = { go((offset - 500).coerceAtLeast(0)) }, enabled = offset > 0 && !busy) { Text("Oldingi 500") }
                QSecondaryButton(onClick = { go(offset + 500) }, enabled = s.first.size >= 500 && !busy) { Text("Keyingi 500") }
            }
            QTable(
                s.first, listOf(
                    QCol("Sana", 100.dp, sort = { it.sana }) { it.sana.take(10) },
                    QCol("Amal", 70.dp, sort = { it.op }) { it.op },
                    QCol("Material", 340.dp, sort = { it.nomi.lowercase() }) { it.nomi },
                    QCol("Birlik", 70.dp) { it.birligi },
                    QCol("Miqdor", 110.dp, true, { it.miqdor }) { omborFmt(it.miqdor) },
                    QCol("Kontragent", 220.dp, sort = { it.kontragent }) { it.kontragent ?: "" },
                    QCol("Obyekt", 200.dp, sort = { it.obyekt }) { it.obyekt ?: "" },
                    QCol("Narx (QQS siz)", 130.dp, true, { it.narx }) { money(it.narx) },
                    QCol("Summa QQS siz", 140.dp, true, { it.summa }) { money(it.summa) },
                    QCol("Summa QQS bilan", 150.dp, true, { it.summaQqs }) { money(it.summaQqs) },
                ),
            )
        }
    }
}

// ---------- stock per object (offline-capable) ----------

@Composable
private fun OmborObjects(c: Ctx) {
    val cid = c.place.companyId
    val st = load(cid, c.tick) { c.sv.read("ombor:$cid", { c.sv.api.bff("/api/sb", "POST", objectStockRequest(cid)) }) { b -> parseSb(b)?.let { parseObjectStock(it.rows) } } }
    var q by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QInput(q, { q = it }, label = "Material qidirish", singleLine = true, modifier = Modifier.width(360.dp))
        if (st == null) { QLoading(); return@Column }
        st.Banner()
        val names = c.objects.associate { it.id to it.nom }
        val rows: List<StockRow> = filterStock(st.valueOrNull().orEmpty(), OmborScope.AllObjects, q)
        QHint("${rows.size} ta qator")
        QTable(
            rows, listOf(
                QCol("Obyekt", 300.dp, sort = { (it.obyektId?.let { id -> names[id] } ?: "").lowercase() }) { it.obyektId?.let { id -> names[id] } ?: "#${it.obyektId}" },
                QCol("Material", 420.dp, sort = { it.nomi.lowercase() }) { it.nomi },
                QCol("Qoldiq", 130.dp, true, { it.qoldiq }) { "${formatQty(it.qoldiq)} ${it.birligi}" },
                QCol("Oxirgi", 110.dp, sort = { it.oxirgi }) { it.oxirgi?.take(10) ?: "" },
            ),
        )
    }
}
