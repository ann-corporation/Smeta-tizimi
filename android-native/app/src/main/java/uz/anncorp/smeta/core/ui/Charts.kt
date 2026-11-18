package uz.anncorp.smeta.core.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.formatPercent

/** Series colours used by every chart so the same thing always has the same colour: fact = green, F-2 = blue, warning = amber, problem = red. */
object ChartColors {
    val fact @Composable get() = MaterialTheme.colorScheme.secondary
    val f2 @Composable get() = MaterialTheme.colorScheme.primary
    val warn @Composable get() = MaterialTheme.colorScheme.tertiary
    val bad @Composable get() = MaterialTheme.colorScheme.error
    val track @Composable get() = MaterialTheme.colorScheme.surfaceContainerHighest
}

/** Shimmering placeholder block (skeleton loader). */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 16.dp, shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(8.dp)) {
    val t = rememberInfiniteTransition(label = "skeleton")
    val x by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart), label = "x")
    val base = MaterialTheme.colorScheme.surfaceContainerHigh
    val hi = MaterialTheme.colorScheme.surfaceContainerHighest
    Box(modifier.height(height).clip(shape).background(Brush.horizontalGradient(listOf(base, hi, base), startX = -300f + 1200f * x, endX = 300f + 1200f * x)))
}

/** A card-shaped skeleton with [lines] text lines. */
@Composable
fun SkeletonCard(modifier: Modifier = Modifier, lines: Int = 3) {
    WorkCard(modifier) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Skeleton(Modifier.fillMaxWidth(0.4f), 12.dp)
            repeat(lines) { i -> Skeleton(Modifier.fillMaxWidth(if (i == lines - 1) 0.6f else 1f), 14.dp) }
        }
    }
}

@Composable
fun SkeletonList(count: Int = 5, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { repeat(count) { SkeletonCard() } }
}

/** Round "illustration": soft concentric discs behind a large icon. Used by the empty states. */
@Composable
fun Illustration(icon: ImageVector, modifier: Modifier = Modifier, tint: Color = MaterialTheme.colorScheme.primary) {
    Box(modifier.size(112.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(112.dp).clip(CircleShape).background(tint.copy(alpha = 0.08f)))
        Box(Modifier.size(80.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)))
        Icon(icon, null, tint = tint, modifier = Modifier.size(40.dp))
    }
}

/** Empty / error state: illustration, title, one-line explanation and an optional action (retry). */
@Composable
fun EmptyState(icon: ImageVector, title: String, body: String? = null, actionLabel: String? = null, tint: Color = MaterialTheme.colorScheme.primary, onAction: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Illustration(icon, tint = tint)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground, textAlign = TextAlign.Center)
        if (body != null) { Spacer(Modifier.height(6.dp)); Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center) }
        if (actionLabel != null && onAction != null) { Spacer(Modifier.height(14.dp)); androidx.compose.material3.Button(onClick = onAction, modifier = Modifier.height(TouchTarget)) { Text(actionLabel) } }
    }
}

/** The «?» next to a term: opens a short plain-language explanation. */
@Composable
fun InfoTip(title: String, body: String, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }, modifier = modifier.size(40.dp)) {
        Icon(Icons.Outlined.HelpOutline, contentDescription = stringResource(R.string.p5_info_cd, title), tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
    if (open) AlertDialog(
        onDismissRequest = { open = false },
        title = { Text(title) }, text = { Text(body, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = { TextButton(onClick = { open = false }, modifier = Modifier.height(TouchTarget)) { Text(stringResource(R.string.p5_got_it)) } },
    )
}

/** Label + value line with an optional «?» explaining the term. */
@Composable
fun TermLabel(label: String, tipTitle: String, tipBody: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InfoTip(tipTitle, tipBody, Modifier.size(32.dp))
    }
}

/** Horizontal progress bar with the percent on the right. null = unknown (empty bar + dash). Values above 100 fill the bar and turn amber. */
@Composable
fun PercentBar(label: String, percent: Double?, color: Color, modifier: Modifier = Modifier, barHeight: Dp = 8.dp) {
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f), maxLines = 2)
            Text(formatPercent(percent), style = MaterialTheme.typography.labelLarge, color = if ((percent ?: 0.0) > 100.0) ChartColors.warn else color)
        }
        Spacer(Modifier.height(4.dp))
        val track = ChartColors.track
        val fill = if ((percent ?: 0.0) > 100.0) ChartColors.warn else color
        val f = ((percent ?: 0.0) / 100.0).coerceIn(0.0, 1.0).toFloat()
        Canvas(Modifier.fillMaxWidth().height(barHeight).semantics { contentDescription = formatPercent(percent) }) {
            drawRoundRect(track, size = size, cornerRadius = CornerRadius(size.height / 2))
            if (f > 0f) drawRoundRect(fill, size = Size(size.width * f, size.height), cornerRadius = CornerRadius(size.height / 2))
        }
    }
}

/**
 * One row's volume as a stacked bar: accepted in F-2, done but not yet accepted, still open. [VolumeSplit] fractions are of the
 * estimate volume; over-estimate work is flagged by the amber outline.
 */
@Composable
fun StackedVolumeBar(f2: Float, factOnly: Float, open: Float, over: Boolean, modifier: Modifier = Modifier, barHeight: Dp = 12.dp) {
    val cF2 = ChartColors.f2; val cFact = ChartColors.fact; val cOpen = ChartColors.track; val warn = ChartColors.warn
    Canvas(modifier.fillMaxWidth().height(barHeight)) {
        val r = CornerRadius(size.height / 2)
        drawRoundRect(cOpen, size = size, cornerRadius = r)
        val w = size.width
        val a = w * f2; val b = w * factOnly
        if (a > 0f) drawRoundRect(cF2, size = Size(a + (if (b > 0f) r.x else 0f), size.height), cornerRadius = r)
        if (b > 0f) drawRoundRect(cFact, topLeft = Offset(a, 0f), size = Size(b, size.height), cornerRadius = if (open <= 0.001f) r else CornerRadius(0f))
        if (over) drawRoundRect(warn, size = size, cornerRadius = r, style = Stroke(width = 3f))
    }
}

@Composable
fun LegendDot(color: Color, text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Two concentric rings: outer = fact %, inner = F-2 %. Unknown ring stays empty. Centre text is the fact %. */
@Composable
fun RingGauge(outer: Double?, inner: Double?, outerColor: Color, innerColor: Color, size: Dp = 132.dp, modifier: Modifier = Modifier, centre: String? = null) {
    val track = ChartColors.track
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = this.size.minDimension * 0.11f
            fun ring(inset: Float, pct: Double?, c: Color) {
                val d = this.size.minDimension - inset * 2
                val tl = Offset(inset, inset)
                drawArc(track, 0f, 360f, false, tl, Size(d, d), style = Stroke(stroke))
                val sweep = (((pct ?: 0.0) / 100.0).coerceIn(0.0, 1.0) * 360.0).toFloat()
                if (sweep > 0f) drawArc(c, -90f, sweep, false, tl, Size(d, d), style = Stroke(stroke, cap = StrokeCap.Round))
            }
            ring(stroke / 2, outer, outerColor)
            ring(stroke * 1.9f, inner, innerColor)
        }
        Text(centre ?: formatPercent(outer), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

data class DonutSlice(val value: Float, val color: Color, val label: String)

/** Donut of the given non-negative parts (already server numbers; only their proportions are drawn). Empty / all-zero draws an empty ring. */
@Composable
fun DonutChart(slices: List<DonutSlice>, size: Dp = 132.dp, modifier: Modifier = Modifier, centre: String? = null) {
    val track = ChartColors.track
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = this.size.minDimension * 0.16f
            val d = this.size.minDimension - stroke
            val tl = Offset(stroke / 2, stroke / 2)
            drawArc(track, 0f, 360f, false, tl, Size(d, d), style = Stroke(stroke))
            val total = slices.sumOf { it.value.coerceAtLeast(0f).toDouble() }.toFloat()
            if (total > 0f) {
                var start = -90f
                slices.forEach { s ->
                    val sweep = s.value.coerceAtLeast(0f) / total * 360f
                    if (sweep > 0f) drawArc(s.color, start, (sweep - 1.5f).coerceAtLeast(0.5f), false, tl, Size(d, d), style = Stroke(stroke))
                    start += sweep
                }
            }
        }
        if (centre != null) Text(centre, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
    }
}

data class BarGroup(val label: String, val values: List<Double?>)

/**
 * Grouped bar chart (one group per label, one bar per series). Heights are drawn from the server numbers relative to the largest
 * value; null (unknown) draws a short grey stub, never a zero-height bar. Labels run along the bottom.
 */
@Composable
fun GroupedBarChart(groups: List<BarGroup>, colors: List<Color>, modifier: Modifier = Modifier, chartHeight: Dp = 150.dp) {
    val max = groups.flatMap { it.values }.filterNotNull().maxOrNull()?.takeIf { it > 0.0 } ?: 1.0
    val stub = ChartColors.track
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().height(chartHeight)) {
            val n = groups.size.coerceAtLeast(1)
            val groupW = size.width / n
            val series = colors.size.coerceAtLeast(1)
            val barW = (groupW * 0.72f / series).coerceAtMost(26f)
            groups.forEachIndexed { gi, g ->
                val startX = gi * groupW + (groupW - barW * series) / 2
                g.values.forEachIndexed { si, v ->
                    val h = if (v == null) 6f else ((v.coerceAtLeast(0.0) / max).toFloat() * size.height).coerceAtLeast(3f)
                    drawRoundRect(
                        if (v == null) stub else colors[si.coerceAtMost(colors.lastIndex)],
                        topLeft = Offset(startX + si * barW, size.height - h), size = Size(barW - 3f, h), cornerRadius = CornerRadius(4f),
                    )
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth()) { groups.forEach { Text(it.label, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, maxLines = 1) } }
    }
}
