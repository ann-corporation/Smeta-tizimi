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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.formatMoneyShort
import uz.anncorp.smeta.feature.work.BannerState
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Minimum touch target for field use (gloves, sun): 56 dp. */
val TouchTarget = 56.dp

private val StampFormat = DateTimeFormatter.ofPattern("dd.MM HH:mm")
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
        !state.online && state.queued > 0 -> Triple(Icons.Filled.CloudOff, stringResource(R.string.p1_banner_offline, state.queued), MaterialTheme.colorScheme.tertiary)
        !state.online -> Triple(Icons.Filled.CloudOff, stringResource(R.string.p1_banner_offline_none), MaterialTheme.colorScheme.tertiary)
        state.failed > 0 -> Triple(Icons.Filled.ErrorOutline, stringResource(R.string.p1_banner_failed, state.failed), MaterialTheme.colorScheme.error)
        else -> Triple(Icons.Filled.Sync, stringResource(R.string.p1_banner_sending, state.queued), MaterialTheme.colorScheme.primary)
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
fun CenterMessage(icon: ImageVector?, title: String, body: String? = null, actionLabel: String? = null, modifier: Modifier = Modifier, onAction: (() -> Unit)? = null) {
    Column(modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        if (icon != null) { Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(40.dp).height(40.dp)); Spacer(Modifier.height(12.dp)) }
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
        if (body != null) { Spacer(Modifier.height(6.dp)); Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center) }
        if (actionLabel != null && onAction != null) { Spacer(Modifier.height(12.dp)); Button(onClick = onAction, modifier = Modifier.heightIn(min = TouchTarget)) { Text(actionLabel) } }
    }
}

@Composable
fun WorkCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    val colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
    val shape = RoundedCornerShape(16.dp)
    val border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    if (onClick != null) Card(onClick = onClick, modifier = modifier.fillMaxWidth(), colors = colors, shape = shape, border = border) { content() }
    else Card(modifier = modifier.fillMaxWidth(), colors = colors, shape = shape, border = border) { content() }
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

@Composable
fun TextActionRow(label: String, onClick: () -> Unit) { TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) } }

