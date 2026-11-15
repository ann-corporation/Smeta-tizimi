package uz.anncorp.smeta.core.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import uz.anncorp.smeta.core.data.ThemeMode

// Tokens taken from the web app (frontend/src/index.css): --accent, --ok, --warn, --danger, --text, --text-dim.
// The window/status-bar background #0E1113 is the native chrome colour requested for the app.
private val Accent = Color(0xFF4F7BFF)
private val Danger = Color(0xFFFF5A5A)

private val Dark = darkColorScheme(
    primary = Accent, onPrimary = Color.White,
    primaryContainer = Color(0xFF1D2B55), onPrimaryContainer = Color(0xFFDCE4FF),
    secondary = Color(0xFF2ED3A0), onSecondary = Color(0xFF00382A),
    tertiary = Color(0xFFFFB020),
    error = Danger, onError = Color.White, errorContainer = Color(0xFF4A1E22), onErrorContainer = Color(0xFFFFDAD8),
    background = Color(0xFF0E1113), onBackground = Color(0xFFE6EAF2),
    surface = Color(0xFF0E1113), onSurface = Color(0xFFE6EAF2),
    surfaceVariant = Color(0xFF1B2130), onSurfaceVariant = Color(0xFF8B93A7),
    surfaceContainerLowest = Color(0xFF0B0E14), surfaceContainerLow = Color(0xFF131722), surfaceContainer = Color(0xFF161B27),
    surfaceContainerHigh = Color(0xFF1B2130), surfaceContainerHighest = Color(0xFF232A3B),
    outline = Color(0xFF3A4358), outlineVariant = Color(0xFF232A3B),
)

private val Light = lightColorScheme(
    primary = Color(0xFF3563E9), onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE4FF), onPrimaryContainer = Color(0xFF0B1C4D),
    secondary = Color(0xFF0E9F77), tertiary = Color(0xFFB57600),
    error = Color(0xFFD93A3A), errorContainer = Color(0xFFFFE1DF), onErrorContainer = Color(0xFF5A0F12),
    background = Color(0xFFF5F7FB), onBackground = Color(0xFF12151C),
    surface = Color(0xFFF5F7FB), onSurface = Color(0xFF12151C),
    surfaceVariant = Color(0xFFE6EAF2), onSurfaceVariant = Color(0xFF586074),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF0F3F9), surfaceContainer = Color(0xFFEAEEF6),
    surfaceContainerHigh = Color(0xFFE4E9F3), surfaceContainerHighest = Color(0xFFDDE3EF),
    outline = Color(0xFF9AA3B8), outlineVariant = Color(0xFFD5DBE8),
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(20.dp),
)

@Composable
fun isDarkFor(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.DARK -> true
    ThemeMode.LIGHT -> false
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}

@Composable
fun QuraiTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, shapes = AppShapes, content = content)
}
