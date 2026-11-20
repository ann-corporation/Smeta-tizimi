package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QDialog
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QDivider
import uz.anncorp.qurai.ui.components.QEmpty
import uz.anncorp.qurai.ui.components.QError
import uz.anncorp.qurai.ui.components.QListRow
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QTabs
import uz.anncorp.qurai.ui.theme.Q

/** One drive entry as plain display values (a folder or a file). */
data class QDiskRow(val key: String, val folder: Boolean, val name: String, val sub: String? = null, val meta: String? = null)

enum class QDiskState { Loading, Ready, Failed }

/** Tab ids are the app's own; labels arrive already translated (Mening diskim / Kompaniya diski / Ulashilgan / Savat). */
data class QDiskTab(val id: String, val label: String)

/** Tabs + list in one piece (Windows). Android draws the tabs itself because its fifth tab ("Aylanish") has its own body. */
@Composable
fun QDiskBrowser(
    tabs: List<QDiskTab>, selected: String, onTab: (String) -> Unit, rows: List<QDiskRow>, state: QDiskState, onRow: (QDiskRow) -> Unit,
    modifier: Modifier = Modifier, crumbs: String? = null, onUp: (() -> Unit)? = null, upLabel: String = "Orqaga", emptyText: String = "Bo'sh", errorText: String = "Yuklanmadi",
    onRetry: (() -> Unit)? = null, contentPadding: androidx.compose.foundation.layout.PaddingValues = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp),
) {
    Column(modifier.fillMaxSize()) {
        QDiskTabs(tabs, selected, onTab)
        QDiskList(rows, state, onRow, Modifier.fillMaxSize(), crumbs, onUp, upLabel, emptyText, errorText, onRetry, contentPadding)
    }
}

/**
 * The Disk tabs. Compact (10dp side padding) and the selected tab is scrolled into view, so on a 360dp phone the active tab is never cut off at the edge
 * (QA 0.1.19: the row was clipped on the right); the rest scrolls horizontally.
 */
@Composable
fun QDiskTabs(tabs: List<QDiskTab>, selected: String, onTab: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = Q.colors
    val scroll = rememberScrollState()
    val index = tabs.indexOfFirst { it.id == selected }.coerceAtLeast(0)
    LaunchedEffect(index, tabs.size) { scroll.animateScrollTo(if (index == 0) 0 else (scroll.maxValue * index) / (tabs.size - 1).coerceAtLeast(1)) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
            tabs.forEach { t ->
                val sel = t.id == selected
                Column(Modifier.clickable { onTab(t.id) }.heightIn(min = Q.layout.control), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(t.label, Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = Q.type.labelLarge, color = if (sel) c.accentText else c.textDim, maxLines = 1)
                    Box(Modifier.height(2.dp).fillMaxWidth().background(if (sel) c.accent else Color.Transparent))
                }
            }
        }
        QDivider()
    }
}

/** Texts of the file card; the host passes translated ones (defaults are Uzbek). */
data class QDiskFileLabels(
    val open: String = "Ochish", val download: String = "Yuklab olish", val system: String = "Tizimda ochish", val versions: String = "Versiyalar", val current: String = "joriy",
    val close: String = "Yopish", val loading: String = "Yuklanmoqda...", val versionsFailed: String = "Versiyalarni yuklab bo'lmadi", val busy: String = "Tayyorlanmoqda...",
    val rename: String = "Nomini o'zgartirish", val move: String = "Ko'chirish", val trash: String = "Savatga", val restore: String = "Savatdan qaytarish",
)

/** What the card may do with the file (null = the button is not shown: system document, shared with me, read-only). */
data class QDiskFileActions(val onRename: (() -> Unit)? = null, val onMove: (() -> Unit)? = null, val onTrash: (() -> Unit)? = null, val onRestore: (() -> Unit)? = null)

data class QDiskVersionRow(val number: Int, val text: String, val current: Boolean)

/**
 * The card of ONE file for both apps: name + details, "Ochish" (view), "Yuklab olish" (download), "Tizimda ochish" (only when the file is a system document
 * with a known source) and its versions - each one downloadable. Everything else (what the buttons do, translated texts) is the host's.
 */
@Composable
fun QDiskFileDialog(
    name: String, meta: String?, versions: List<QDiskVersionRow>?, versionsFailed: Boolean, busy: Boolean, notice: String?, noticeOk: Boolean, labels: QDiskFileLabels,
    onOpen: () -> Unit, onDownload: () -> Unit, onVersion: (Int) -> Unit, onSystem: (() -> Unit)?, onClose: () -> Unit, actions: QDiskFileActions = QDiskFileActions(),
) {
    QDialog(name, onClose, buttons = { QButton(labels.close, onClose, kind = QButtonKind.Ghost) }) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!meta.isNullOrBlank()) Text(meta, style = Q.type.bodySmall, color = Q.colors.textMute)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QButton(labels.open, onOpen, kind = QButtonKind.Primary, enabled = !busy)
                QButton(labels.download, onDownload, enabled = !busy)
            }
            if (onSystem != null) QButton(labels.system, onSystem, kind = QButtonKind.Secondary, enabled = !busy)
            if (actions.onRename != null || actions.onMove != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                actions.onRename?.let { QButton(labels.rename, it, enabled = !busy) }
                actions.onMove?.let { QButton(labels.move, it, enabled = !busy) }
            }
            if (actions.onTrash != null) QButton(labels.trash, actions.onTrash, kind = QButtonKind.Danger, enabled = !busy)
            if (actions.onRestore != null) QButton(labels.restore, actions.onRestore, kind = QButtonKind.Primary, enabled = !busy)
            if (busy) Text(labels.busy, style = Q.type.bodySmall, color = Q.colors.textMute)
            if (notice != null) QNote(notice, tone = if (noticeOk) QTone.Ok else QTone.Danger)
            Text(labels.versions, style = Q.type.labelMedium, color = Q.colors.textDim)
            when {
                versionsFailed -> Text(labels.versionsFailed, style = Q.type.bodySmall, color = Q.colors.textMute)
                versions == null -> Text(labels.loading, style = Q.type.bodySmall, color = Q.colors.textMute)
                else -> Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
                    versions.forEach { v ->
                        QListRow(title = "v${v.number}" + if (v.current) "  (${labels.current})" else "", sub = v.text, onClick = { onVersion(v.number) }, modifier = Modifier.padding(0.dp))
                    }
                }
            }
        }
    }
}
/**
 * "Disk" list for BOTH apps: a breadcrumb with "up" for folders and the rows. Data and navigation are the host's (Android view model / desktop
 * module); this composable only draws. Folder rows open [onRow] like files so the host decides.
 */
@Composable
fun QDiskList(
    rows: List<QDiskRow>, state: QDiskState, onRow: (QDiskRow) -> Unit, modifier: Modifier = Modifier, crumbs: String? = null, onUp: (() -> Unit)? = null,
    upLabel: String = "Orqaga", emptyText: String = "Bo'sh", errorText: String = "Yuklanmadi", onRetry: (() -> Unit)? = null,
    contentPadding: androidx.compose.foundation.layout.PaddingValues = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp),
) {
    Column(modifier) {
        if (crumbs != null && crumbs.isNotBlank()) Text(crumbs, Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 6.dp), style = Q.type.labelMedium, color = Q.colors.textDim, maxLines = 1)
        when (state) {
            QDiskState.Loading -> QLoading()
            QDiskState.Failed -> QError(errorText, onRetry = onRetry)
            QDiskState.Ready -> LazyColumn(Modifier.fillMaxSize(), contentPadding = contentPadding) {
                if (onUp != null) item(key = "up") { QListRow(title = "\u2190 $upLabel", onClick = onUp) }
                if (rows.isEmpty()) item(key = "empty") { QEmpty(emptyText, Modifier.padding(top = 24.dp)) }
                items(rows, key = { it.key }) { r ->
                    QListRow(title = (if (r.folder) "\u25B8 " else "") + r.name, sub = r.sub, meta = r.meta, onClick = { onRow(r) })
                }
            }
        }
    }
}


/** Texts of the Disk write controls; hosts pass translated ones. */
data class QDiskWriteLabels(
    val upload: String = "Yuklash", val newFolder: String = "Yangi papka", val renameFolder: String = "Papka nomi", val moveFolder: String = "Papkani ko'chirish", val deleteFolder: String = "Papkani o'chirish",
    val ok: String = "Saqlash", val cancel: String = "Bekor qilish", val name: String = "Nomi", val root: String = "Asosiy papka", val moveTitle: String = "Qayerga ko'chiriladi?",
    val sourceTitle: String = "Nimani yuklaymiz?", val camera: String = "Kamera", val gallery: String = "Galereya", val file: String = "Fayl",
)

/**
 * The write bar above the list of a drive tab: "Yuklash" (the host then asks camera / gallery / file), "Yangi papka", and, inside a folder, that folder's
 * rename / move / delete. Hidden in Ulashilgan and Savat (the host passes [visible] = false).
 */
@Composable
fun QDiskWriteBar(visible: Boolean, inFolder: Boolean, working: Boolean, labels: QDiskWriteLabels, onUpload: () -> Unit, onNewFolder: () -> Unit, onRenameFolder: () -> Unit, onMoveFolder: () -> Unit, onDeleteFolder: () -> Unit, modifier: Modifier = Modifier) {
    if (!visible) return
    Column(modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QButton(labels.upload, onUpload, kind = QButtonKind.Primary, enabled = !working, loading = working)
            QButton(labels.newFolder, onNewFolder, enabled = !working)
            if (inFolder) {
                QButton(labels.renameFolder, onRenameFolder, enabled = !working)
                QButton(labels.moveFolder, onMoveFolder, enabled = !working)
                QButton(labels.deleteFolder, onDeleteFolder, kind = QButtonKind.Danger, enabled = !working)
            }
        }
    }
}

/** One text field in a dialog (new folder, rename). The host validates; blank is never confirmed here. */
@Composable
fun QDiskNameDialog(title: String, initial: String, labels: QDiskWriteLabels, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var v by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(initial) }
    QDialog(title, onDismiss, confirm = labels.ok, onConfirm = { onConfirm(v) }, dismissText = labels.cancel, confirmEnabled = v.isNotBlank()) {
        uz.anncorp.qurai.ui.components.QInput(v, { v = it.take(120) }, Modifier.fillMaxWidth(), label = labels.name)
    }
}

/** A short list of choices in a dialog (move target, upload source). */
@Composable
fun QDiskChoiceDialog(title: String, options: List<Pair<Long, String>>, cancel: String, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    QDialog(title, onDismiss, buttons = { QButton(cancel, onDismiss, kind = QButtonKind.Ghost) }) {
        Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
            options.forEach { (id, label) -> QListRow(title = label, onClick = { onPick(id) }, modifier = Modifier.padding(0.dp)) }
        }
    }
}

/**
 * "Diskdan tanlash": the picker the apps open where a file is attached. It shows a drive (tabs + folders + files) and returns the tapped FILE through
 * [onRow]; folders are opened by the host exactly like in the Disk screen.
 */
@Composable
fun QDiskPickDialog(
    title: String, close: String, tabs: List<QDiskTab>, selected: String, onTab: (String) -> Unit, rows: List<QDiskRow>, state: QDiskState, onRow: (QDiskRow) -> Unit,
    crumbs: String?, onUp: (() -> Unit)?, upLabel: String, emptyText: String, errorText: String, onRetry: (() -> Unit)?, busyText: String? = null, onClose: () -> Unit,
) {
    QDialog(title, onClose, buttons = { QButton(close, onClose, kind = QButtonKind.Ghost) }) {
        Column(Modifier.fillMaxWidth().heightIn(min = 240.dp, max = 420.dp)) {
            if (busyText != null) Text(busyText, style = Q.type.bodySmall, color = Q.colors.textMute)
            QDiskBrowser(tabs, selected, onTab, rows, state, onRow, Modifier.fillMaxWidth().heightIn(min = 240.dp, max = 400.dp), crumbs, onUp, upLabel, emptyText, errorText, onRetry)
        }
    }
}