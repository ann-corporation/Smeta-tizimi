package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.layout.Column
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

@Composable
fun QDiskTabs(tabs: List<QDiskTab>, selected: String, onTab: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        QTabs(tabs, tabs.firstOrNull { it.id == selected } ?: tabs.first(), { it.label }, { onTab(it.id) })
        QDivider()
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
