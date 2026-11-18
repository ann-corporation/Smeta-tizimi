package uz.anncorp.qurai.ui.nav

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QDialog
import uz.anncorp.qurai.ui.components.QDivider
import uz.anncorp.qurai.ui.components.QTabs
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/**
 * ONE navigation model for the website, Android and Windows: the 7 work places ("ish joylari") of the site's menu, same names and order
 * (frontend/src/lib/reestr/ishJoyi.ts ISH_JOYI_META) with their pages (`navBand` names). A platform passes the ids it implements
 * ([QNav.visible]); sections with nothing implemented are hidden, everything else is identical on both apps.
 */
data class QNavItem(val id: String, val title: String, val icon: ImageVector)
data class QNavSection(val id: String, val title: String, val icon: ImageVector, val items: List<QNavItem>)

object QNav {
    val sections: List<QNavSection> by lazy {
        listOf(
            QNavSection("bugun", "Bugun", QIcons.LayoutDashboard, listOf(
                QNavItem("bugun", "Bugun", QIcons.LayoutDashboard), QNavItem("bildirish", "Bildirishnomalar", QIcons.Bell),
            )),
            QNavSection("obyekt", "Obyekt", QIcons.Building2, listOf(
                QNavItem("obyektlar", "Obyektlar", QIcons.FolderKanban), QNavItem("smeta", "Smeta", QIcons.Calculator),
                QNavItem("narx", "Narx manbalari", QIcons.Tags), QNavItem("fakt", "Fakt kiritish", QIcons.HardHat),
                QNavItem("f2", "F2 va Nakopitelniy", QIcons.FileOutput), QNavItem("nakop", "Nakopitelniy va F3", QIcons.FileOutput),
                QNavItem("naryad", "Naryad", QIcons.ClipboardList), QNavItem("m29", "M-29 (material sarfi)", QIcons.Box),
            )),
            QNavSection("hujjatlar", "Hujjatlar", QIcons.FileStack, listOf(
                QNavItem("hujjat", "Hujjatlar", QIcons.FileStack), QNavItem("nazorat", "Texnik nazorat", QIcons.ShieldCheck),
            )),
            QNavSection("taminot", "Ta'minot", QIcons.Truck, listOf(
                QNavItem("ombor", "Ta'minot va sklad", QIcons.Box), QNavItem("zayavka", "Zayavkalar", QIcons.ClipboardList),
            )),
            QNavSection("moliya", "Moliya", QIcons.Briefcase, listOf(
                QNavItem("moliya", "Moliya va shartnomalar", QIcons.Briefcase), QNavItem("qarzdor", "Qarzdorlik", QIcons.CircleAlert),
            )),
            QNavSection("tomonlar", "Tomonlar", QIcons.Users, listOf(QNavItem("tomonlar", "Shartnomalar va tomonlar", QIcons.Users))),
            QNavSection("kompaniya", "Kompaniya", QIcons.Settings, listOf(QNavItem("sozlama", "Sozlamalar", QIcons.Settings))),
        )
    }

    /** The model filtered to what this platform / role / module can open; empty sections disappear, order never changes. */
    fun visible(ids: Set<String>): List<QNavSection> = sections.mapNotNull { s ->
        val items = s.items.filter { it.id in ids }
        if (items.isEmpty()) null else s.copy(items = items)
    }

    fun sectionOf(sections: List<QNavSection>, itemId: String): QNavSection? = sections.firstOrNull { s -> s.items.any { it.id == itemId } }
}

/** Desktop / tablet sidebar (`.fz-sidebar`, 264dp): header slot, section labels with their pages, footer slot. Ctrl+N hints are optional text. */
@Composable
fun QSidebar(
    sections: List<QNavSection>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier,
    badges: Map<String, Int> = emptyMap(), hints: Map<String, String> = emptyMap(), header: (@Composable () -> Unit)? = null, footer: (@Composable () -> Unit)? = null,
) {
    val c = Q.colors
    val line = c.border
    Column(
        modifier.width(QuraiTokens.SIDEBAR_OPEN.dp).fillMaxHeight().background(c.surface).drawBehind { drawLine(line, Offset(size.width, 0f), Offset(size.width, size.height), 1f) }
            .padding(QuraiTokens.SPACE_3.dp),
    ) {
        header?.invoke()
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            sections.forEach { s ->
                Text(s.title.uppercase(), Modifier.padding(start = 10.dp, top = QuraiTokens.SPACE_3.dp, bottom = 2.dp), style = Q.type.labelSmall, color = c.textMute)
                s.items.forEach { it -> SidebarItem(it, it.id == selected, badges[it.id] ?: 0, hints[it.id]) { onSelect(it.id) } }
            }
        }
        footer?.invoke()
    }
}

@Composable
private fun SidebarItem(item: QNavItem, sel: Boolean, badge: Int, hint: String?, onClick: () -> Unit) {
    val c = Q.colors
    Row(
        Modifier.fillMaxWidth().height(QuraiTokens.CONTROL_LG.dp).background(if (sel) c.accentSoft else Color.Transparent, Q.shape.small).clickable(onClick = onClick).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(item.icon, null, Modifier.size(18.dp), tint = if (sel) c.accentText else c.textDim)
        Text(item.title, Modifier.weight(1f), style = Q.type.bodyMedium, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, color = if (sel) c.accentText else c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (badge > 0) QChip(badge.toString(), tone = QTone.Accent)
        else if (hint != null) Text(hint, style = Q.type.labelSmall, color = c.textMute)
    }
}

/** Phone bottom navigation: the first sections of the SAME model (max [maxTabs]-1) plus "Yana" that opens every section. */
@Composable
fun QBottomNav(
    sections: List<QNavSection>, selectedSection: String?, onSection: (QNavSection) -> Unit, modifier: Modifier = Modifier,
    badges: Map<String, Int> = emptyMap(), maxTabs: Int = 5, onMore: (() -> Unit)? = null,
) {
    val c = Q.colors
    val needMore = sections.size > maxTabs
    val shown = if (needMore) sections.take(maxTabs - 1) else sections
    val line = c.border
    Row(modifier.fillMaxWidth().background(c.surface).drawBehind { drawLine(line, Offset(0f, 0f), Offset(size.width, 0f), 1f) }.heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        shown.forEach { s ->
            val sel = s.id == selectedSection
            val n = s.items.sumOf { badges[it.id] ?: 0 }
            BottomCell(s.title, s.icon, sel, n, Modifier.weight(1f)) { onSection(s) }
        }
        if (needMore) BottomCell("Yana", QIcons.Menu, selectedSection != null && shown.none { it.id == selectedSection }, 0, Modifier.weight(1f)) { onMore?.invoke() }
    }
}

@Composable
private fun BottomCell(title: String, icon: ImageVector, sel: Boolean, badge: Int, modifier: Modifier, onClick: () -> Unit) {
    val c = Q.colors
    Column(modifier.clickable(onClick = onClick).padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Box(Modifier.background(if (sel) c.accentSoft else Color.Transparent, Q.shape.large).padding(horizontal = 14.dp, vertical = 4.dp)) {
            Icon(icon, null, Modifier.size(20.dp), tint = if (sel) c.accentText else c.textDim)
            if (badge > 0) Box(Modifier.align(Alignment.TopEnd).size(8.dp).background(c.danger, Q.shape.large))
        }
        Text(title, style = Q.type.labelMedium, color = if (sel) c.accentText else c.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * The adaptive application frame both apps use: wide = sidebar + top bar + content (+ optional side panel such as Jarvis),
 * narrow = top bar + page tabs (when the section has several pages) + content + bottom nav; "Yana" opens a section picker.
 */
@Composable
fun QAppShell(
    sections: List<QNavSection>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier,
    badges: Map<String, Int> = emptyMap(), hints: Map<String, String> = emptyMap(), sidebarHeader: (@Composable () -> Unit)? = null, sidebarFooter: (@Composable () -> Unit)? = null,
    topBar: (@Composable () -> Unit)? = null, sidePanel: (@Composable () -> Unit)? = null, content: @Composable () -> Unit,
) {
    val section = QNav.sectionOf(sections, selected)
    if (Q.layout.wide) {
        Row(modifier.fillMaxSize()) {
            QSidebar(sections, selected, onSelect, badges = badges, hints = hints, header = sidebarHeader, footer = sidebarFooter)
            Column(Modifier.weight(1f).fillMaxHeight()) {
                topBar?.let { it(); QDivider() }
                Box(Modifier.weight(1f).fillMaxWidth()) { content() }
            }
            sidePanel?.invoke()
        }
    } else {
        var more by remember { mutableStateOf(false) }
        Column(modifier.fillMaxSize()) {
            topBar?.let { it(); QDivider() }
            if (section != null && section.items.size > 1) QTabs(section.items, section.items.first { it.id == selected }, { it.title }, { onSelect(it.id) }, Modifier.padding(horizontal = Q.layout.gutter))
            Box(Modifier.weight(1f).fillMaxWidth()) { content() }
            sidePanel?.invoke()
            QBottomNav(sections, section?.id, { onSelect(it.items.first().id) }, badges = badges, onMore = { more = true })
        }
        if (more) QDialog("Bo'limlar", { more = false }) {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                sections.forEach { s ->
                    Text(s.title.uppercase(), Modifier.padding(top = 8.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                    s.items.forEach { it -> SidebarItem(it, it.id == selected, badges[it.id] ?: 0, null) { more = false; onSelect(it.id) } }
                }
            }
        }
    }
}
