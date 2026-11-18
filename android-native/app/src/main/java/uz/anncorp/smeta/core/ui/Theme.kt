package uz.anncorp.smeta.core.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import uz.anncorp.smeta.core.data.ThemeMode

// The look itself lives in :ui-common (uz.anncorp.qurai.ui.theme.QuraiTheme: website Firuza tokens, shared with the Windows app).
// Only the platform bit stays here: resolving the user's theme preference against the system setting.
@Composable
fun isDarkFor(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.DARK -> true
    ThemeMode.LIGHT -> false
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}