package uz.anncorp.qurai.ui.theme

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.anncorp.smeta.core.ui.QuraiPalette
import uz.anncorp.smeta.core.ui.QuraiTokens

/**
 * The website's "Firuza" look for Android AND Windows. Colours/radii/spacing come from [QuraiTokens] (mirror of firuza.css),
 * type sizes mirror the site (body 13/18, table 13/18, card title 15/22, page title 19/24, label 12, chip 11).
 * Extra semantic colours that Material has no slot for (ok, warn, info, soft fills, kategoriya colours) live in [QColors].
 */
@Immutable
class QColors(val p: QuraiPalette, val dark: Boolean) {
    private fun c(v: Long) = Color(v)
    val bg = c(p.bg); val surface = c(p.surface); val surface2 = c(p.surface2); val surface3 = c(p.surface3)
    val border = c(p.border); val borderStrong = c(p.borderStrong)
    val text = c(p.text); val textDim = c(p.textDim); val textMute = c(p.textMute)
    val accent = c(p.accent); val accentText = c(p.accentText); val onAccent = c(p.onAccent); val accentSoft = c(p.accentSoft)
    val info = c(p.info); val ok = c(p.ok); val warn = c(p.warn); val danger = c(p.danger); val dangerSoft = c(p.dangerSoft)
    val okSoft = c(p.ok).copy(alpha = 0.14f); val warnSoft = c(p.warn).copy(alpha = 0.14f); val infoSoft = c(p.info).copy(alpha = 0.14f)
    val katChel = c(p.katChel); val katMash = c(p.katMash); val katMat = c(p.katMat); val katOb = c(p.katOb)
}

/** Layout class: the SAME screens adapt. Wide (>= 840dp, Windows / tablet) = sidebar + tables; narrow (phone) = bottom nav + lists. */
@Immutable
data class QLayout(val widthDp: Float) {
    val wide: Boolean get() = widthDp >= WIDE_MIN
    val compact: Boolean get() = !wide
    /** Control height: site --control-md (32) on a pointer device, the 44dp touch target on the phone (site mobil.css does the same). */
    val control: Dp get() = if (wide) QuraiTokens.CONTROL_MD.dp else 44.dp
    val controlLg: Dp get() = if (wide) QuraiTokens.CONTROL_LG.dp else 48.dp
    val rowHeight: Dp get() = if (wide) QuraiTokens.ROW_DENSE.dp else 48.dp
    val gutter: Dp get() = if (wide) QuraiTokens.SPACE_4.dp else QuraiTokens.SPACE_3.dp
    companion object { const val WIDE_MIN = 840f }
}

val LocalQColors = compositionLocalOf { QColors(QuraiTokens.dark, true) }
val LocalQLayout = compositionLocalOf { QLayout(1280f) }

object Q {
    val colors: QColors @Composable @ReadOnlyComposable get() = LocalQColors.current
    val layout: QLayout @Composable @ReadOnlyComposable get() = LocalQLayout.current
    val shape: androidx.compose.material3.Shapes @Composable @ReadOnlyComposable get() = MaterialTheme.shapes
    val type: Typography @Composable @ReadOnlyComposable get() = MaterialTheme.typography
}

private fun scheme(p: QuraiPalette, dark: Boolean): ColorScheme {
    fun c(v: Long) = Color(v)
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = c(p.accent), onPrimary = c(p.onAccent), primaryContainer = c(p.surface3), onPrimaryContainer = c(p.accentText),
        secondary = c(p.ok), onSecondary = c(p.onAccent), secondaryContainer = c(p.surface3), onSecondaryContainer = c(p.text),
        tertiary = c(p.warn), error = c(p.danger), onError = c(p.onAccent), errorContainer = c(p.dangerSoft).copy(alpha = 0.22f), onErrorContainer = c(p.danger),
        background = c(p.bg), onBackground = c(p.text), surface = c(p.bg), onSurface = c(p.text),
        surfaceVariant = c(p.surface2), onSurfaceVariant = c(p.textDim),
        surfaceContainerLowest = c(p.bg), surfaceContainerLow = c(p.surface), surfaceContainer = c(p.surface), surfaceContainerHigh = c(p.surface2), surfaceContainerHighest = c(p.surface3),
        outline = c(p.borderStrong), outlineVariant = c(p.border),
    )
}

private val QShapes = Shapes(
    extraSmall = RoundedCornerShape(QuraiTokens.RADIUS_XS.dp), small = RoundedCornerShape(QuraiTokens.RADIUS_SM.dp),
    medium = RoundedCornerShape(QuraiTokens.RADIUS_MD.dp), large = RoundedCornerShape(QuraiTokens.RADIUS_LG.dp),
)

/** The site font stack ("IBM Plex Sans", system-ui, Segoe UI ...). The platform sans is used: it is what the site falls back to too. */
val QFontSans: FontFamily = FontFamily.SansSerif
val QFontMono: FontFamily = FontFamily.Monospace

private fun ts(size: Int, line: Int, w: FontWeight = FontWeight.Normal) =
    TextStyle(fontFamily = QFontSans, fontSize = size.sp, lineHeight = line.sp, fontWeight = w)

private val QType = Typography(
    displaySmall = ts(26, 32, FontWeight.SemiBold),
    headlineMedium = ts(22, 28, FontWeight.SemiBold),
    headlineSmall = ts(19, 24, FontWeight.SemiBold),     // .fz-pagehead__title
    titleLarge = ts(19, 24, FontWeight.SemiBold),
    titleMedium = ts(15, 22, FontWeight.SemiBold),       // .fz-card__title
    titleSmall = ts(13, 18, FontWeight.SemiBold),
    bodyLarge = ts(14, 20),
    bodyMedium = ts(13, 18),                              // body and tables
    bodySmall = ts(12, 16),
    labelLarge = ts(13, 18, FontWeight.Medium),
    labelMedium = ts(12, 16, FontWeight.Medium),
    labelSmall = ts(11, 16, FontWeight.SemiBold),        // chips
)

/**
 * App root theme. [dark] true = site default (`:root`), false = `data-mavzu="ganch"`. Measures the window once and publishes [QLayout]
 * so every Q component and shared screen adapts the same way on the phone and on the desktop.
 */
@Composable
fun QuraiTheme(dark: Boolean = true, content: @Composable () -> Unit) {
    val p = if (dark) QuraiTokens.dark else QuraiTokens.light
    val colors = QColors(p, dark)
    MaterialTheme(colorScheme = scheme(p, dark), shapes = QShapes, typography = QType) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalQColors provides colors, LocalQLayout provides QLayout(maxWidth.value)) {
                // Without a Surface the default content colour is black on the dark page.
                Surface(color = colors.bg, contentColor = colors.text, modifier = Modifier.fillMaxSize(), content = content)
            }
        }
    }
}
