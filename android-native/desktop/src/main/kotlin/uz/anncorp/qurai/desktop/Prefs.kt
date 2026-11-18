package uz.anncorp.qurai.desktop

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Small per-user choices of the Windows app (kept in %APPDATA%\QURAI\theme.txt): the colour theme, dark like the site by default. */
object DesktopPrefs {
    private val file = java.io.File(AppPaths.root, "theme.txt")
    var dark by mutableStateOf(runCatching { file.readText().trim() != "light" }.getOrDefault(true))
        private set
    fun chooseDark(v: Boolean) { dark = v; runCatching { file.writeText(if (v) "dark" else "light") } }
}