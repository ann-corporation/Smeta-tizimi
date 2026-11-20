package uz.anncorp.qurai.desktop

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * What the user left open in the Loyiha > Shartnoma > Obyekt tree and the chosen context (Kontekst), remembered per company in %APPDATA%\QURAI\tree.properties
 * (view state only: no ids of real data leave the machine). The demo never writes it.
 */
object TreePrefs {
    private val file = java.io.File(AppPaths.root, "tree.properties")
    private val p = java.util.Properties().apply { runCatching { file.inputStream().use { load(it) } } }
    private fun save() { runCatching { file.outputStream().use { p.store(it, null) } } }

    fun expanded(cid: Long): Set<String>? = uz.anncorp.smeta.core.data.decodeKeys(p.getProperty("exp.$cid"))
    fun setExpanded(cid: Long, keys: Set<String>?) {
        val v = uz.anncorp.smeta.core.data.encodeKeys(keys)
        if (v == null) p.remove("exp.$cid") else p.setProperty("exp.$cid", v); save()
    }
    fun scope(cid: Long): uz.anncorp.smeta.core.data.WorkScope {
        fun id(k: String) = p.getProperty("$k.$cid")?.toLongOrNull()
        return uz.anncorp.smeta.core.data.WorkScope(id("sl"), id("ss"), id("so"))
    }
    fun setScope(cid: Long, s: uz.anncorp.smeta.core.data.WorkScope) {
        fun put(k: String, v: Long?) { if (v == null) p.remove("$k.$cid") else p.setProperty("$k.$cid", v.toString()) }
        put("sl", s.loyihaId); put("ss", s.shartnomaId); put("so", s.obyektId); save()
    }
}

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
