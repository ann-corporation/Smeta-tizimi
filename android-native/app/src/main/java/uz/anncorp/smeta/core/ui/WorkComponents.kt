package uz.anncorp.smeta.core.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QCard
import uz.anncorp.smeta.core.data.MoneyDisplay
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.feature.work.BannerState
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Minimum touch target for field use (gloves, sun): 56 dp. */
val TouchTarget = 56.dp

private val StampFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
fun formatStamp(ms: Long?): String? = ms?.let { StampFormat.format(Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault())) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkTopBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    TopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.height(TouchTarget).width(TouchTarget)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.p1_back)) } },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background, titleContentColor = MaterialTheme.colorScheme.onBackground),
    )
}

/** Offline / queue status strip. Tap opens the outbox. */
@Composable
fun OutboxBanner(state: BannerState, onClick: () -> Unit, modifier: Modifier = Modifier) {
    if (!state.visible) return
    val (icon, text, color) = when {
        !state.online && state.queued > 0 -> Triple(Icons.Filled.CloudOff, pluralStringResource(R.plurals.p1_banner_offline, state.queued, state.queued), MaterialTheme.colorScheme.tertiary)
        !state.online -> Triple(Icons.Filled.CloudOff, stringResource(R.string.p1_banner_offline_none), MaterialTheme.colorScheme.tertiary)
        state.failed > 0 -> Triple(Icons.Filled.ErrorOutline, pluralStringResource(R.plurals.p1_banner_failed, state.failed, state.failed), MaterialTheme.colorScheme.error)
        else -> Triple(Icons.Filled.Sync, pluralStringResource(R.plurals.p1_banner_sending, state.queued, state.queued), MaterialTheme.colorScheme.primary)
    }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = color, modifier = Modifier.width(18.dp).height(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = color)
        }
    }
}

@Composable
fun UpdatedLine(ms: Long?, modifier: Modifier = Modifier) {
    val s = formatStamp(ms)
    Text(
        if (s == null) stringResource(R.string.p1_never_updated) else stringResource(R.string.p1_updated, s),
        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier,
    )
}

@Composable
fun CenterMessage(icon: ImageVector?, title: String, body: String? = null, actionLabel: String? = null, modifier: Modifier = Modifier, secondaryLabel: String? = null, onSecondary: (() -> Unit)? = null, onAction: (() -> Unit)? = null) {
    Column(modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) {
        if (icon != null) Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(36.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
        if (body != null) Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) QButton(actionLabel, onAction, kind = QButtonKind.Primary)
        if (secondaryLabel != null && onSecondary != null) QButton(secondaryLabel, onSecondary, kind = QButtonKind.Ghost)
    }
}

/** The website's `.fz-card` (shared QCard): surface, 1dp border, radius-md. */
@Composable
fun WorkCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    QCard(modifier.fillMaxWidth(), onClick = onClick, padding = PaddingValues(0.dp), content = content)
}
/** Money with the Uzbek grouping, em dash when unknown. */
@Composable
fun MoneyLine(label: String, value: Double?, emphasize: Boolean = false, color: Color = MaterialTheme.colorScheme.onSurface) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(
            if (emphasize) formatMoneyShort(value) else formatMoney(value),
            style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = color,
        )
    }
}

/**
 * Owner's money rule as one component: the amount WITHOUT markup and WITH markup (both QQS-free) are always both shown, and
 * [showVat] puts the QQS-inclusive figure first and largest (object value). Unknown is an em dash, never 0.
 */
@Composable
fun MoneyDual(d: MoneyDisplay, modifier: Modifier = Modifier, showVat: Boolean = false, hint: Boolean = false, short: Boolean = false) {
    val fmt: (Double?) -> String = if (short) ::formatMoneyShort else { v -> formatMoney(v) }
    Column(modifier) {
        if (showVat) {
            Text(stringResource(R.string.m_vat_incl), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(fmt(d.vatIncl), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(4.dp))
        }
        MoneyRow(stringResource(R.string.m_markup), fmt(d.withMarkup))
        MoneyRow(stringResource(R.string.m_plain), fmt(d.withoutMarkup))
        if (hint && !d.fromServer) {
            Text(stringResource(R.string.m_markup_unknown), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun MoneyRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 1.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
fun TextActionRow(label: String, onClick: () -> Unit) { TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) } }

