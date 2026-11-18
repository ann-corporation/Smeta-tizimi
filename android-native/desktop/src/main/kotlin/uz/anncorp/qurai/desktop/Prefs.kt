package uz.anncorp.qurai.desktop

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Small per-user choices of the Windows app (kept in %APPDATA%\QURAI): the colour theme (theme.txt, dark like the site by default) and the language (lang.txt: uz | ru). */
object DesktopPrefs {
    private val file = java.io.File(AppPaths.root, "theme.txt")
    private val langFile = java.io.File(AppPaths.root, "lang.txt")
    var dark by mutableStateOf(runCatching { file.readText().trim() != "light" }.getOrDefault(true))
        private set
    fun chooseDark(v: Boolean) { dark = v; runCatching { file.writeText(if (v) "dark" else "light") } }

    var lang by mutableStateOf(runCatching { langFile.readText().trim().takeIf { it in I18n.languages } }.getOrNull() ?: "uz")
        private set
    fun chooseLang(v: String) { if (v !in I18n.languages) return; lang = v; runCatching { langFile.writeText(v) } }
}
