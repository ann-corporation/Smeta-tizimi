@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridState
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QKv
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.formatVolumeSigned
import uz.anncorp.smeta.feature.common.Obj
import uz.anncorp.smeta.feature.f2draft.*

/**
 * F-2 tayyorlash on Windows: the draft of ONE act as a data grid. Same server gateway and the same rules as the website page (/api/f2-buyruq):
 * edit volume / price inline (minus allowed), remove rows, then Saqlash (Ctrl+S) shows the server PREVIEW (old -> new, totals) and only
 * «Tasdiqlayman» writes. Texnadzor suggestions sit on the right with Qabul / Rad / Keyinroq. No sum is computed here.
 */
@Composable
fun F2DraftScreen(c: Ctx, o: Obj, act: F2Act, onBack: () -> Unit) {
    val repo = remember(c.sv.api) { F2DraftRepository(c.sv.api) }
    val tk = remember(c.sv.api) { TakliflarRepository(c.sv.api) }
    val scope = rememberCoroutineScope()
    var reload by remember { mutableStateOf(0) }
    var sheet by remember(act.id) { mutableStateOf<F2Out<DraftSheet>?>(null) }
    var edits by remember(act.id) { mutableStateOf(DraftEdits()) }
    var grid by remember(act.id) { mutableStateOf(GridState()) }
    var preview by remember(act.id) { mutableStateOf<DraftPreview?>(null) }
    var previewCall by remember(act.id) { mutableStateOf<kotlinx.serialization.json.JsonObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf<String?>(null) }
    var takliflar by remember(act.id) { mutableStateOf<List<Taklif>>(emptyList()) }
    var run by remember { mutableStateOf<TaklifRun?>(null) }
    var rad by remember { mutableStateOf<Pair<Long, String>?>(null) }
    var query by remember { mutableStateOf("") }
    val gridFocus = remember { FocusRequester() }
    val findFocus = remember { FocusRequester() }
    val rootFocus = remember { FocusRequester() }

    LaunchedEffect(act.id, reload, c.tick) {
        sheet = null
        sheet = repo.sheet(c.place.companyId, act.id)
        takliflar = runCatching { tk.list(c.place.companyId, act.id) }.getOrDefault(emptyList())
        runCatching { gridFocus.requestFocus() }
    }
    val data = (sheet as? F2Out.Ok)?.value
    val editable = data?.act?.editable == true
    val byRow = remember(data) { data?.rows?.associateBy { it.qatorId }.orEmpty() }
    val errs = edits.errors()
    val tkByRow = remember(takliflar) { takliflar.filter { it.qaror == "kutilmoqda" }.groupBy { it.qatorId } }

    fun resetEdits() { edits = DraftEdits(); preview = null; previewCall = null; error = null; run = null }
    fun fail(f: F2Out.Fail) { error = f2FailText(f); if (f.stale) { preview = null; run = null } }

    fun startPreview() {
        if (!editable || busy) return
        if (edits.isEmpty) { error = "O'zgarish yo'q"; return }
        edits.limitText()?.let { error = it; return }
        val list = edits.toEdits() ?: run { error = "Xato qiymatli katak bor: ${errs.values.first()}"; return }
        val body = editBody(c.place.companyId, act.id, data?.act?.versiya, list, edits.removed.toList())
        busy = true; error = null; done = null
        scope.launch {
            when (val r = repo.preview(body)) { is F2Out.Ok -> { preview = r.value; previewCall = body }; is F2Out.Fail -> fail(r) }
            busy = false
        }
    }
    fun confirm() {
        val token = preview?.token ?: return
        busy = true; error = null
        scope.launch {
            when (val r = repo.confirm(c.place.companyId, token)) {
                is F2Out.Ok -> {
                    val cur = run
                    if (cur != null) {
                        val next = cur.i + 1
                        if (next < cur.steps.size) {
                            when (val p = repo.preview(toolBody(c.place.companyId, cur.steps[next].nom, cur.steps[next].args))) {
                                is F2Out.Ok -> { run = cur.copy(i = next); preview = p.value }
                                is F2Out.Fail -> { fail(p); run = null; preview = null; reload++ }
                            }
                        } else {
                            val e = tk.decide(cur.taklif.id, "qabul")
                            run = null; preview = null; done = if (e == null) "F-2 yangilandi va qaror yozildi" else takliflarErrorText(e); reload++
                        }
                    } else { done = "Saqlandi: o'zgarishlar F-2 qoralamasiga yozildi"; resetEdits(); reload++ }
                }
                is F2Out.Fail -> fail(r)
            }
            busy = false
        }
    }
    fun cancelPreview() { if (busy) return; preview = null; run = null; error = null; runCatching { gridFocus.requestFocus() } }
    fun startQabul(x: Taklif) {
        val steps = qabulQadamlari(x, c.place.companyId, act.id, o.id, data?.act?.versiya, editable)
        busy = true; error = null
        scope.launch {
            if (steps.isEmpty()) { val e = tk.decide(x.id, "qabul"); done = if (e == null) "Qaror yozildi" else takliflarErrorText(e); reload++ }
            else when (val p = repo.preview(toolBody(c.place.companyId, steps[0].nom, steps[0].args))) { is F2Out.Ok -> { run = TaklifRun(x, steps, 0); preview = p.value }; is F2Out.Fail -> fail(p) }
            busy = false
        }
    }
    fun decide(x: Taklif, q: String, why: String? = null) { scope.launch { val e = tk.decide(x.id, q, why); if (e != null) error = takliflarErrorText(e) else { rad = null; reload++ } } }

    val cols = remember(editable, tkByRow) { draftCols(editable, tkByRow, { edits }, { errs }, { byRow }) }
    val exportRows: (List<DraftRow>) -> Unit = { r -> runCatching { saveAndOpen("F2-${act.raqam ?: act.id}.csv", uz.anncorp.qurai.ui.components.GridLogic.toCsv(r, cols, grid).toByteArray(Charsets.UTF_8)) } }

    Column(
        Modifier.fillMaxSize().onPreviewKeyEvent { e ->
            if (e.type != KeyEventType.KeyDown) false else when {
                e.isCtrlPressed && e.key == Key.S -> { startPreview(); true }
                e.isCtrlPressed && e.key == Key.Z && edits.count > 0 && preview == null -> { resetEdits(); true }
                e.key == Key.Escape && preview != null -> { cancelPreview(); true }
                else -> false
            }
        },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("F-2 tayyorlash: ${o.nom}" + (data?.act?.raqam?.let { " · akt $it" } ?: ""), style = Q.type.titleLarge, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
        CommandBar(
            listOf(Command("Orqaga", "Esc", QIcons.ArrowLeft) { onBack() }),
            listOf(
                Command("Saqlash — oldindan ko'rish", "Ctrl+S", QIcons.Check, enabled = editable && !edits.isEmpty && !busy, primary = true, loading = busy && preview == null) { startPreview() },
                Command("Qaytarish", "Ctrl+Z", enabled = !edits.isEmpty && preview == null) { resetEdits() },
            ),
            listOf(Command("Yangilash", "F5", QIcons.RefreshCw) { reload++ }),
        )
        if (!editable && data != null) QNote("Bu F-2 qoralama emas: faqat ko'rish mumkin (tahrir faqat qoralama / rad etilgan aktda).", tone = QTone.Info)
        done?.let { QNote(it, tone = QTone.Ok) }
        if (preview == null) error?.let { QNote(it, tone = QTone.Danger) }
        if (errs.isNotEmpty()) QNote("${errs.size} katakda xato: ${errs.values.first()}", tone = QTone.Warn)
        data?.total?.let { t -> Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) { QKv("QQS bilan", money(t.qqsBilan)); QKv("Ustamali (QQS siz)", money(t.ustamali)); QKv("Ustamasiz (QQS siz)", money(t.ustamasiz)) } }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (val s = sheet) {
                null -> QLoading()
                is F2Out.Fail -> QNote(f2FailText(s), tone = QTone.Danger)
                is F2Out.Ok -> SplitView(
                    master = {
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            QInput(query, { query = it; grid = uz.anncorp.qurai.ui.components.GridLogic.setQuery(grid, it) }, Modifier.fillMaxWidth().focusRequester(findFocus), placeholder = "Qidirish (Ctrl+F): kod, nom, hajm...", leading = QIcons.Search)
                            DataGrid(
                                s.value.rows, cols, key = { it.qatorId }, state = grid, onState = { grid = it }, modifier = Modifier.weight(1f).fillMaxWidth(), focus = gridFocus,
                                rowTone = { r -> if (r.qatorId in edits.removed) QTone.Danger else if (r.minus) QTone.Warn else null },
                                cellMark = { r, col -> if (errs.containsKey(r.qatorId) && edits.cells[r.qatorId]?.let { p -> (col.id == "hajm" && p.hajm != null) || (col.id == "narx" && p.narx != null) } == true) CellMark.Invalid
                                    else if (edits.cells[r.qatorId]?.let { p -> (col.id == "hajm" && p.hajm != null) || (col.id == "narx" && (p.narx != null || p.narxsiz == true)) } == true) CellMark.Changed else CellMark.None },
                                onEdit = if (editable) ({ r, col, text -> edits = edits.setCell(r, col.id, text); done = null }) else null,
                                onDelete = if (editable) ({ rows -> edits = if (rows.all { it.qatorId in edits.removed }) edits.restore(rows.map { it.qatorId }) else edits.remove(rows.map { it.qatorId }) }) else null,
                                actions = if (editable) listOf(
                                    GridAction("Narxsiz deb belgilash") { rows -> rows.forEach { edits = edits.markNarxsiz(it, true) } },
                                    GridAction("Qatorni qaytarish (olib tashlashni bekor)") { rows -> edits = edits.restore(rows.map { it.qatorId }) },
                                ) else emptyList(),
                                onFind = { runCatching { findFocus.requestFocus() } }, onExport = exportRows, showFilters = false,
                                empty = "Bu aktda qator yo'q",
                            )
                        }
                    },
                    detail = {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            val p = preview
                            if (p != null) PreviewCard(
                                run?.let { "Qadam ${it.i + 1}/${it.steps.size}: ${p.tavsif ?: it.steps[it.i].nom}" } ?: ("Tasdiqlash: " + (p.tavsif ?: "${edits.count} o'zgarish")),
                                p.rows.map { previewLine(it) }, totalsLines(p), p.warnings + p.failedSteps.map { "Server: $it" }, busy, error, ::confirm, ::cancelPreview,
                            ) else {
                                val sel = grid.active?.let { byRow[it as Long] }
                                if (sel != null) RowDetail(sel, edits, tkByRow[sel.qatorId].orEmpty())
                                else Text("Qatorni tanlang: tafsiloti va texnadzor taklifi shu yerda ko'rinadi.", style = Q.type.bodySmall, color = Q.colors.textMute)
                                if (takliflar.isNotEmpty()) TakliflarPanel(takliflar, editable, busy || preview != null, rad, { rad = it }, ::startQabul, ::decide)
                            }
                        }
                    },
                )
            }
        }
    }
}

/** One «Qabul» in progress: the write steps it implies, each previewed and confirmed in turn. */
data class TaklifRun(val taklif: Taklif, val steps: List<QabulQadam>, val i: Int)

private fun draftCols(
    editable: Boolean, tk: Map<Long, List<Taklif>>, edits: () -> DraftEdits, errs: () -> Map<Long, String>, rows: () -> Map<Long, DraftRow>,
): List<GridCol<DraftRow>> = listOf(
    GridCol("kod", "Kod", 96f, mono = true, sortKey = { it.kod }) { it.kod ?: "" },
    GridCol("nom", "Nomi", 210f, sortKey = { it.nom.lowercase() }) { it.nom },
    GridCol("birlik", "Birlik", 64f) { uz.anncorp.smeta.core.data.displayUnit(it.birlik) },
    GridCol("hajm", "Hajm", 90f, numeric = true, editable = editable, sortKey = { it.hajm }) { r -> edits().cells[r.qatorId]?.hajm ?: formatVolumeSigned(r.hajm).let { if (r.hajm == null) "" else it } },
    GridCol("narx", "Narx (QQS siz)", 120f, numeric = true, editable = editable, sortKey = { it.narx }) { r -> edits().cells[r.qatorId]?.let { p -> p.narx ?: if (p.narxsiz == true) "narxsiz" else null } ?: money(r.narx).let { if (r.narx == null) "" else it } },
    GridCol("summa", "Summa (server)", 130f, numeric = true, sortKey = { it.summa }) { r -> if (edits().cells[r.qatorId] != null) "…" else money(r.summa).let { if (r.summa == null) "" else it } },
    GridCol("holat", "Holat", 110f) { r -> when { r.qatorId in edits().removed -> "olib tashlanadi"; errs().containsKey(r.qatorId) -> "xato"; r.minus -> "minus"; r.narx == null -> "narxsiz"; else -> "" } },
    GridCol("tek", "Texnadzor", 120f) { r -> tk[r.qatorId]?.firstOrNull()?.let { t -> "● " + takBayroq(t) } ?: "" },
)

private fun takBayroq(t: Taklif) = when (t.bayroq) { "olib_tashlansin" -> "olib tashlansin"; "hajm_notogri" -> "hajm noto'g'ri"; "hujjat_kerak" -> "hujjat kerak"; "qabul" -> "qabul"; else -> if (t.qosh) "qo'shish" else "taklif" }

private fun fieldText(f: String, v: Double?): String = if (v == null) "—" else if (f == "hajm") formatVolumeSigned(v) else money(v)
private fun previewLine(r: PreviewRow): PreviewLine = PreviewLine(
    listOfNotNull(r.kod, r.nom).joinToString(" ").ifBlank { "#${r.qatorId}" },
    when { r.removed -> "olib tashlanadi"; r.added -> "yangi qator"; else -> r.changes.joinToString(", ") { "${it.field} ${fieldText(it.field, it.old)} → ${fieldText(it.field, it.new)}" } },
    if (r.removed) QTone.Danger else if (r.added) QTone.Ok else QTone.Accent,
)
private fun totalsLines(p: DraftPreview): List<PreviewLine> {
    fun one(name: String, f: (SumTriple) -> Double?) = PreviewLine(name, "${money(p.before?.let(f))} → ${money(p.after?.let(f))}   (farq ${money(p.diff?.let(f))})")
    return if (p.before == null && p.after == null) emptyList() else listOf(one("QQS bilan", { it.qqsBilan }), one("Ustamali (QQS siz)", { it.ustamali }), one("Ustamasiz (QQS siz)", { it.ustamasiz }))
}

@Composable
private fun RowDetail(r: DraftRow, e: DraftEdits, tk: List<Taklif>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(listOfNotNull(r.kod, r.nom).joinToString(" "), style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
        QKv("Birlik", uz.anncorp.smeta.core.data.displayUnit(r.birlik)); QKv("Hajm (saqlangan)", fieldText("hajm", r.hajm)); QKv("Narx (QQS siz)", fieldText("narx", r.narx)); QKv("Summa (server)", fieldText("summa", r.summa))
        if (r.minus) QNote("Minus qator: normaga keltirish. Hujjatda ishorasi bilan qoladi.", tone = QTone.Warn)
        if (r.izoh != null) QKv("Izoh", r.izoh!!)
        if (e.cells.containsKey(r.qatorId)) QNote("Saqlanmagan o'zgarish bor (Ctrl+S).", tone = QTone.Info)
        tk.forEach { t -> QNote("Texnadzor: ${takBayroq(t)}" + (t.taklifHajm?.let { " → ${formatVolumeSigned(it)}" } ?: "") + (t.izoh?.let { " · $it" } ?: ""), tone = QTone.Warn) }
    }
}

@Composable
private fun TakliflarPanel(
    list: List<Taklif>, editable: Boolean, locked: Boolean, rad: Pair<Long, String>?, setRad: (Pair<Long, String>?) -> Unit, onQabul: (Taklif) -> Unit, onDecide: (Taklif, String, String?) -> Unit,
) {
    val x = takliflarXulosa(list)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Texnadzor takliflari", style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
        Text("${x.jami} ta taklif, ${x.hal} tasi hal qilindi" + if (x.hujjatKutilmoqda > 0) " · hujjat kutilmoqda: ${x.hujjatKutilmoqda}" else "", style = Q.type.bodySmall, color = Q.colors.textDim)
        if (!editable) Text("F-2 qoralama emas: hajm o'zgartirib bo'lmaydi, faqat qaror yoziladi.", style = Q.type.bodySmall, color = Q.colors.textMute)
        list.forEach { t ->
            Column(Modifier.fillMaxWidth().padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text((t.nom ?: "#${t.qatorId}") + " · " + takBayroq(t) + if (t.eskirgan) " · eski versiya" else "", style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.Medium)
                if (t.taklifHajm != null) Text("Hajm: ${fieldText("hajm", t.joriyHajm)} → ${formatVolumeSigned(t.taklifHajm)} ${t.birlik ?: ""}", style = Q.type.bodySmall, color = Q.colors.textDim)
                t.izoh?.let { Text(it, style = Q.type.bodySmall, color = Q.colors.textDim) }
                if (t.qaror != "kutilmoqda") Text(when (t.qaror) { "qabul" -> "Qabul qilindi"; "rad" -> "Rad etildi" + (t.qarorSabab?.let { ": $it" } ?: ""); else -> "Keyinroq" }, style = Q.type.labelSmall, color = if (t.qaror == "qabul") Q.colors.ok else Q.colors.textMute)
                else Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    QButton("Qabul", { onQabul(t) }, kind = QButtonKind.Primary, enabled = !locked, icon = QIcons.Check)
                    QButton("Rad", { setRad(t.id to "") }, enabled = !locked)
                    QButton("Keyinroq", { onDecide(t, "keyinroq", null) }, kind = QButtonKind.Ghost, enabled = !locked)
                }
                if (rad?.first == t.id) Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    QInput(rad.second, { setRad(t.id to it) }, placeholder = "Rad etish sababi (tekshiruvchi ko'radi)")
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        QButton("Rad etish", { onDecide(t, "rad", rad.second) }, kind = QButtonKind.Danger, enabled = rad.second.trim().length >= 3)
                        QButton("Bekor", { setRad(null) }, kind = QButtonKind.Ghost)
                    }
                }
            }
        }
    }
}
