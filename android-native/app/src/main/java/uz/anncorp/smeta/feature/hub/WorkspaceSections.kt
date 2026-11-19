package uz.anncorp.smeta.feature.hub

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.open
import uz.anncorp.smeta.core.data.Workspace
import uz.anncorp.smeta.core.data.WsAction
import uz.anncorp.smeta.core.data.WsSection
import uz.anncorp.smeta.core.data.WsSectionType
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.ui.TouchTarget

/** The sections of a workspace this build can draw. Anything else is skipped (forward compatible); a LIST/KPI without a known feed becomes an "open" card. */
internal fun renderable(ws: Workspace): List<WsSection> = ws.sections.filter { s ->
    when (s.type) {
        WsSectionType.ACTIONS -> s.actionIds.any { ws.action(it)?.open() != null }
        WsSectionType.TEXT -> !s.text.isNullOrBlank()
        WsSectionType.LIST, WsSectionType.KPI -> true
    }
}

/**
 * Generic section renderers for the server-driven workspace: action grids (big touch buttons in field mode), lists, KPI cards and text.
 * Feeds the app already has locally: `obyektlar.oxirgi` and field "today's works by place" (objects = places). Everything else opens its screen.
 */
internal fun LazyGridScope.workspaceItems(ws: Workspace, places: List<ObyektEntity>, onAction: (WsAction) -> Unit, onObject: (Long) -> Unit, kpi: uz.anncorp.smeta.core.data.RahbarKpi? = null) {
    val span = GridItemSpan(2)
    renderable(ws).forEach { s ->
        val key = "ws:${s.id}"
        val feedList = s.type == WsSectionType.LIST && (s.source == "obyektlar.oxirgi" || (s.groupByPlace && s.source == "bugun.ishlar")) && places.isNotEmpty()
        val asCard = (s.type == WsSectionType.LIST && !feedList) || (s.type == WsSectionType.KPI && kpi == null)
        item(key = "$key:h", span = { span }) { SectionHeader(s, ws, onAction, showOpen = !asCard) }
        when (s.type) {
            WsSectionType.ACTIONS -> {
                val list = s.actionIds.mapNotNull { ws.action(it) }.filter { it.open() != null }
                items(list, key = { "$key:${it.id}" }, span = { if (s.big && list.size == 1) span else GridItemSpan(1) }) { a -> ActionButton(a, s.big, ws.primaryAction == a.id, onAction) }
            }
            WsSectionType.TEXT -> item(key = "$key:t", span = { span }) { Text(s.text.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            WsSectionType.LIST, WsSectionType.KPI -> {
                val feed = (s.source == "obyektlar.oxirgi" || (s.groupByPlace && s.source == "bugun.ishlar")) && s.type == WsSectionType.LIST
                if (s.type == WsSectionType.KPI && kpi != null) item(key = "$key:k", span = { span }) { KpiCard(kpi, ws.action(s.openAction.orEmpty()), onAction) }
                else if (feed && places.isNotEmpty()) items(places.take(6), key = { "$key:o${it.id}" }, span = { span }) { PlaceRow(it) { onObject(it.id) } }
                else item(key = "$key:c", span = { span }) { OpenCard(s, ws.action(s.openAction.orEmpty()), onAction) }
            }
        }
    }
}

@Composable
private fun SectionHeader(s: WsSection, ws: Workspace, onAction: (WsAction) -> Unit, showOpen: Boolean = true) {
    val open = ws.action(s.openAction.orEmpty())?.takeIf { it.open() != null }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(s.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        if (showOpen && open != null && s.type != WsSectionType.ACTIONS) TextButton(onClick = { onAction(open) }) { Text(stringResource(R.string.ws_open)) }
    }
}

/** Field mode (`big`): one thumb-sized button, large icon and text - works with gloves; also the primary action is highlighted. */
@Composable
private fun ActionButton(a: WsAction, big: Boolean, primary: Boolean, onAction: (WsAction) -> Unit) {
    Surface(
        color = if (primary) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().heightIn(min = if (big) 112.dp else 72.dp).clickable { onAction(a) },
    ) {
        Column(Modifier.padding(14.dp)) {
            Icon(iconFor(a.icon), null, tint = if (primary) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.primary, modifier = Modifier.size(if (big) 34.dp else 24.dp))
            Spacer(Modifier.size(if (big) 10.dp else 6.dp))
            Text(actionTitle(a), style = if (big) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleSmall, color = if (primary) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** One name for the same thing on every screen (QA 2026-11-18: «Fakt yozish / Fakt kiritish / Fakt»): the shared module names win over the server's free text. */
@Composable
private fun actionTitle(a: WsAction): String = when {
    !a.target.native -> a.title
    a.target.code == "fakt" -> stringResource(R.string.mod_fact)
    a.target.code == "foto" -> stringResource(R.string.mod_photo)
    else -> a.title
}

/** Module codes the workspace already draws as quick-action buttons: the module grid below does not repeat them (QA: Fakt / Foto showed three times). */
internal fun shownAsActions(ws: Workspace?): Set<String> = ws?.let { w ->
    renderable(w).filter { it.type == WsSectionType.ACTIONS }.flatMap { it.actionIds }.mapNotNull { w.action(it) }.filter { it.target.native && it.open() != null }.map { it.target.code }.toSet()
}.orEmpty()

@Composable
private fun PlaceRow(o: ObyektEntity, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Home, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(10.dp))
            Text(o.nom, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun OpenCard(s: WsSection, open: WsAction?, onAction: (WsAction) -> Unit) {
    val go = open?.takeIf { it.open() != null }
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).then(if (go != null) Modifier.clickable { onAction(go) } else Modifier),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.ws_open), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (go != null) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
        }
    }
}

/** Boss-panel preview on the hub: fact / F-2 completion, receivable, paid, problems and approvals waiting. Tap opens the full panel. */
@Composable
private fun KpiCard(k: uz.anncorp.smeta.core.data.RahbarKpi, open: WsAction?, onAction: (WsAction) -> Unit) {
    val go = open?.takeIf { it.open() != null }
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().then(if (go != null) Modifier.clickable { onAction(go) } else Modifier),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
                KpiCell(stringResource(R.string.p1_card_fakt), uz.anncorp.smeta.core.data.formatPercent(k.factPercent), Modifier.weight(1f))
                KpiCell(stringResource(R.string.p1_card_f2_short), uz.anncorp.smeta.core.data.formatPercent(k.f2Percent), Modifier.weight(1f))
                KpiCell(stringResource(R.string.hub_kpi_objects), k.objects.toString(), Modifier.weight(1f))
            }
            Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
                KpiCell(stringResource(R.string.hub_kpi_receivable), uz.anncorp.smeta.core.data.formatMoneyShort(k.receivable), Modifier.weight(1f))
                KpiCell(stringResource(R.string.hub_kpi_paid), uz.anncorp.smeta.core.data.formatMoneyShort(k.paid), Modifier.weight(1f))
            }
            Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
                KpiCell(stringResource(R.string.hub_kpi_problems), k.problems.toString(), Modifier.weight(1f), warn = k.problems > 0)
                KpiCell(stringResource(R.string.hub_kpi_approvals), k.approvals.toString(), Modifier.weight(1f), warn = k.approvals > 0)
            }
        }
    }
}

@Composable
private fun KpiCell(label: String, value: String, modifier: Modifier = Modifier, warn: Boolean = false) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, style = MaterialTheme.typography.titleMedium, color = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}