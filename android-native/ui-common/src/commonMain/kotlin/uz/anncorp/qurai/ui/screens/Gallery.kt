package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QAdaptiveList
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QCol
import uz.anncorp.qurai.ui.components.QFilterBar
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QPageHead
import uz.anncorp.qurai.ui.components.QSearchField
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QSumBlock
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.nav.QAppShell
import uz.anncorp.qurai.ui.nav.QNav
import uz.anncorp.qurai.ui.theme.Q

/**
 * Design-system showcase with SAMPLE data (no network, no real numbers): the shared screens in the shared shell. Used by
 * `:desktop:run --args=--gallery=<page>` and by tests to compare the apps with the website side by side.
 * Pages: login, objects, ombor, f2, jarvis.
 */
@Composable
fun QGallery(page: String) {
    if (page == "login") { QLoginScreen("", {}, "", {}, false, null, {}, texts = QLoginTexts(version = "v0.2.2")); return }
    var item by remember { mutableStateOf(when (page) { "ombor" -> "ombor"; "f2" -> "f2"; else -> "obyektlar" }) }
    val ids = setOf("bugun", "bildirish", "obyektlar", "smeta", "narx", "fakt", "f2", "nakop", "hujjat", "ombor", "moliya", "sozlama")
    QAppShell(
        QNav.visible(ids), item, { item = it }, badges = mapOf("bildirish" to 3),
        topBar = {
            Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QSelect("NEW TIMES PTO", listOf("NEW TIMES PTO"), { it }, {}, minWidth = 140, modifier = Modifier.weight(1f, fill = false))
                Box(Modifier.weight(1f))
                QButton(if (Q.layout.wide) "Jarvis (Ctrl+K)" else "", {}, icon = QIcons.Sparkles)
            }
        },
    ) {
        Column(Modifier.fillMaxSize().padding(Q.layout.gutter), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (page) {
                "jarvis" -> JarvisSample()
                "ombor" -> OmborSample()
                "f2" -> F2Sample()
                else -> ObjectsSample()
            }
        }
    }
}

private val sampleObjects = listOf(
    QObjectRow(1, "Navoiy bog'i - 1-bosqich", "Obyekt", 1240, 18, "12 480 000 000", "11 150 000 000", "9 840 000 000", "62,4%", "48,0%"),
    QObjectRow(2, "Stella - 2-halqa", "Obyekt", 880, 0, "3 905 200 000", "3 520 000 000", "3 110 000 000", "31,0%", "20,5%"),
    QObjectRow(3, "10 kV liniya", "Elektr", 214, 3, "1 120 000 000", "1 010 000 000", "902 000 000", "88,0%", "74,2%"),
)

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.ObjectsSample() {
    QPageHead("Obyektlar", desc = "${sampleObjects.size} ta obyekt")
    QSearchField("", {}, Modifier.width(360.dp))
    QObjectList(sampleObjects, {}, Modifier.weight(1f), selectedId = 1)
}

private data class Mat(val nomi: String, val birlik: String, val qoldiq: String, val kirim: String, val chiqim: String, val oxirgi: String)

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.OmborSample() {
    val rows = listOf(
        Mat("Sement M400", "qop", "1 250", "3 400", "2 150", "2026-11-17"), Mat("Armatura 12 mm", "tonna", "12,5", "30", "17,5", "2026-11-16"),
        Mat("Qum", "m3", "86", "400", "314", "2026-11-15"), Mat("G'isht qizil", "dona", "18 400", "60 000", "41 600", "2026-11-12"),
    )
    QPageHead("Ombor", desc = "Markaziy ombor: bugungi qoldiq")
    QNote("Narx kiritilmagan qatorlar narxsiz saqlanadi (keyin qo'yish mumkin)", tone = QTone.Warn)
    QAdaptiveList(
        rows, listOf(
            QCol("Material", 420.dp, sort = { it.nomi }) { it.nomi }, QCol("Birlik", 80.dp) { it.birlik }, QCol("Qoldiq", 130.dp, true) { it.qoldiq },
            QCol("Kirim", 130.dp, true) { it.kirim }, QCol("Chiqim", 130.dp, true) { it.chiqim }, QCol("Oxirgi harakat", 130.dp) { it.oxirgi },
        ), Modifier.weight(1f), titleCol = 0, subCols = listOf(1, 5), metaCol = 2,
    )
}

private data class Akt(val oy: String, val raqam: String, val holat: String, val qator: String, val jami: String)

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.F2Sample() {
    var f by remember { mutableStateOf("Hammasi") }
    val rows = listOf(Akt("2026-09", "F2-014", "Tasdiqlangan", "212", "1 840 000 000"), Akt("2026-10", "F2-015", "Tekshirilgan", "240", "2 110 000 000"), Akt("2026-11", "F2-016", "Qoralama", "98", "640 000 000"))
    QPageHead("F2 va Nakopitelniy", desc = "Navoiy bog'i - 1-bosqich")
    QSumBlock("4 590 000 000", "4 098 000 000", "3 610 000 000", Modifier.fillMaxWidth(), caption = "Obyekt jami")
    QFilterBar(listOf("Hammasi", "Qoralama", "Tekshirilgan", "Tasdiqlangan"), f, { it }, { f = it })
    QAdaptiveList(
        rows.filter { f == "Hammasi" || it.holat == f }, listOf(
            QCol("Oy", 90.dp, sort = { it.oy }) { it.oy }, QCol("Raqam", 140.dp, sort = { it.raqam }) { it.raqam }, QCol("Holat", 150.dp) { it.holat },
            QCol("Qator", 80.dp, true) { it.qator }, QCol("Jami (QQS bilan)", 170.dp, true) { it.jami },
        ), Modifier.weight(1f), titleCol = 1, subCols = listOf(0, 2), metaCol = 4,
    )
}

@Composable
private fun JarvisSample() {
    var input by remember { mutableStateOf("") }
    val md = "**Sement M400** bo'yicha qoldiq:\n\n| Ombor | Qoldiq | Birlik |\n|---|---:|---|\n| Markaziy | 1 250 | qop |\n| Navoiy bog'i | 310 | qop |\n\n- Bugun **kirim**: 400 qop\n- Chiqim: 150 qop\n\n1. Buyurtma bering\n2. `F-2` ga qo'shing"
    QJarvisChat(
        listOf(QBubble.Mine("sement qoldig'i"), QBubble.Jarvis(md)), false, input, { input = it }, { input = "" },
        scope = "Obyekt: Navoiy bog'i", quick = listOf("Pul holati" to "x", "Bugun" to "y"),
        chats = emptyList(), onToggleChats = {}, onNewChat = {},
    )
}
