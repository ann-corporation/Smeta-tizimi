package uz.anncorp.smeta.core.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.core.data.ThemeMode

// The single source of the look is the website's Firuza token set, kept in :shared (QuraiTokens) and used by the Windows app too.
private fun c(v: Long) = Color(v)

private fun scheme(p: QuraiPalette, dark: Boolean): ColorScheme {
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

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(QuraiTokens.RADIUS_XS.dp), small = RoundedCornerShape(QuraiTokens.RADIUS_SM.dp),
    medium = RoundedCornerShape(QuraiTokens.RADIUS_MD.dp), large = RoundedCornerShape(QuraiTokens.RADIUS_LG.dp),
)

@Composable
fun isDarkFor(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.DARK -> true
    ThemeMode.LIGHT -> false
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}

@Composable
fun QuraiTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme(if (dark) QuraiTokens.dark else QuraiTokens.light, dark), shapes = AppShapes, content = content)
}
