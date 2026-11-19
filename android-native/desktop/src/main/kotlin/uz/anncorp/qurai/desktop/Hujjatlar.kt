@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridLogic
import uz.anncorp.qurai.ui.components.GridState
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.safeFileName
import uz.anncorp.smeta.feature.common.DocRow
import uz.anncorp.smeta.feature.common.docPath
import uz.anncorp.smeta.feature.hujjat.DocFilter
import uz.anncorp.smeta.feature.hujjat.docTypes
import uz.anncorp.smeta.feature.hujjat.isSpreadsheet
import uz.anncorp.smeta.feature.hujjat.sizeText
import uz.anncorp.smeta.feature.hujjat.uniqueFileName
import java.io.File

/**
 * Hujjatlar (registry of an object) as a data grid, like the site's list: filter bar (type chips, text, only ready), multi-select,
 * «Ochish» (Enter / double-click) downloads and opens, «Excelda ochish» for spreadsheets, «Papkaga yuklab olish» saves the selected
 * files into a folder the user chooses (names never overwrite). The registry itself is the server's (GET /api/hujjat-royxat).
 */
@Composable
fun DocsGridPanel(c: Ctx, docs: List<DocRow>, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf(DocFilter()) }
    var grid by remember { mutableStateOf(GridState(sort = listOf(uz.anncorp.qurai.ui.components.SortKey("upd", false)))) }
    var msg by remember { mutableStateOf<Pair<String, QTone>?>(null) }
    var busy by remember { mutableStateOf(false) }
    val find = remember { FocusRequester() }
    val gridFocus = remember { FocusRequester() }
    val cols = remember {
        listOf(
            GridCol<DocRow>("name", "Fayl", 380f, sortKey = { it.name.lowercase() }) { it.name },
            GridCol("type", "Turi", 110f, sortKey = { it.type }) { it.type },
            GridCol("size", "Hajmi", 90f, numeric = true, sortKey = { it.size }) { sizeText(it.size) },
            GridCol("upd", "Yangilangan", 150f, sortKey = { it.updated }) { formatIsoStamp(it.updated) },
            GridCol("ready", "Tayyor", 80f) { if (it.ready) "ha" else "yo'q" },
        )
    }
    val shown = remember(docs, filter) { filter.apply(docs) }
    val keyOf: (DocRow) -> Any = { it.id }
    fun picked(): List<DocRow> { val s = grid.selected; val r = shown.filter { it.id in s }; return r.ifEmpty { shown.filter { it.id == grid.active } } }

    suspend fun fetch(d: DocRow) = c.sv.api.bffBytes(docPath(d.id), DOC_MAX_BYTES)
    fun err(status: Int, code: String?) = if (status == 0) Tx.offlineWrite else "Yuklab bo'lmadi: ${code ?: status}"
    fun open(d: DocRow) { scope.launch { busy = true; msg = null; val r = fetch(d); if (r.ok && r.bytes != null) saveAndOpen(r.filename ?: d.name, r.bytes!!) else msg = err(r.status, r.code) to QTone.Danger; busy = false } }
    fun toFolder() {
        val list = picked(); if (list.isEmpty() || busy) return
        val dir = pickFolder("Hujjatlarni saqlash papkasi") ?: return
        scope.launch {
            busy = true; msg = null
            val taken = (dir.list() ?: emptyArray()).map { it.lowercase() }.toMutableSet(); var ok = 0; var bad: String? = null
            for (d in list) {
                val r = fetch(d)
                if (r.ok && r.bytes != null) { File(dir, uniqueFileName(safeFileName(r.filename ?: d.name, "hujjat"), taken)).writeBytes(r.bytes!!); ok++ } else bad = err(r.status, r.code)
            }
            msg = ("$ok / ${list.size} fayl saqlandi: ${dir.absolutePath}" + (bad?.let { " \u00B7 $it" } ?: "")) to (if (bad == null) QTone.Ok else QTone.Warn)
            busy = false
        }
    }
    val csv: (List<DocRow>) -> Unit = { rows -> saveAndOpen("hujjatlar.csv", GridLogic.toCsv(rows, cols, grid).toByteArray(Charsets.UTF_8)) }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            QButton("Hammasi (${docs.size})", { filter = filter.copy(type = null) }, kind = if (filter.type == null) QButtonKind.Primary else QButtonKind.Secondary)
            docTypes(docs).forEach { (t, n) -> QButton("$t ($n)", { filter = filter.copy(type = if (filter.type == t) null else t) }, kind = if (filter.type == t) QButtonKind.Primary else QButtonKind.Secondary) }
            QButton("Faqat tayyor", { filter = filter.copy(readyOnly = !filter.readyOnly) }, kind = if (filter.readyOnly) QButtonKind.Primary else QButtonKind.Secondary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            QInput(filter.query, { filter = filter.copy(query = it) }, Modifier.weight(1f).focusRequester(find), placeholder = "Qidirish (Ctrl+F): fayl nomi, turi", leading = QIcons.Search)
        }
        CommandBar(
            listOf(
                Command("Ochish", "Enter", null, enabled = !busy && picked().size == 1, primary = true, loading = busy) { picked().firstOrNull()?.let(::open) },
                Command("Excelda ochish", null, enabled = !busy && picked().size == 1 && isSpreadsheet(picked().first().name)) { picked().firstOrNull()?.let(::open) },
            ),
            listOf(Command("Papkaga yuklab olish", null, QIcons.Download, enabled = !busy && picked().isNotEmpty()) { toFolder() }),
        )
        msg?.let { QNote(it.first, tone = it.second) }
        DataGrid(
            shown, cols, key = keyOf, state = grid, onState = { grid = it }, modifier = Modifier.fillMaxWidth().weight(1f), focus = gridFocus,
            rowTone = { if (!it.ready) QTone.Warn else null }, onOpen = ::open, onFind = { runCatching { find.requestFocus() } }, onExport = csv,
            actions = listOf(GridAction("Papkaga yuklab olish") { toFolder() }), empty = if (filter.active) "Filtrga mos hujjat yo'q" else "Hujjat yo'q",
        )
    }
}
