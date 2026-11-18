package uz.anncorp.qurai.desktop

import javax.xml.parsers.DocumentBuilderFactory

/**
 * Windows language support WITHOUT a second dictionary: the build copies the Android string resources (values / values-ru / values-en, see
 * desktop/build.gradle.kts `syncI18n`) into the app, and this object reads them. Two ways to ask:
 *  - [s] by resource key (`qa2_disk_mine`) - exact, for new texts;
 *  - [t] by the Uzbek text already in the code ("Sozlamalar") - looked up in the Uzbek table and answered from the chosen language; anything
 *    without a translation stays as written (never an empty or wrong text).
 * Reading [lang] inside a composable makes the screen follow a language change at once.
 */
object I18n {
    val languages = listOf("uz", "ru")
    val names = mapOf("uz" to "O'zbekcha", "ru" to "Русский")

    private val tables: Map<String, Map<String, String>> by lazy { listOf("uz", "ru", "en").associateWith { load(it) } }
    private val uzToKey: Map<String, String> by lazy {
        val m = HashMap<String, String>()
        tables["uz"].orEmpty().forEach { (k, v) -> m.putIfAbsent(v, k) }
        m
    }

    /** Current language (a Compose state held by [DesktopPrefs]). */
    val lang: String get() = DesktopPrefs.lang

    fun s(key: String, fallback: String, language: String = lang): String = tables[language]?.get(key)?.takeIf { it.isNotBlank() } ?: tables["uz"]?.get(key) ?: fallback

    fun t(uz: String, language: String = lang): String {
        if (language == "uz") return uz
        val key = uzToKey[uz] ?: return uz
        return tables[language]?.get(key)?.takeIf { it.isNotBlank() } ?: uz
    }

    internal fun load(locale: String): Map<String, String> {
        val out = HashMap<String, String>()
        val index = I18n::class.java.getResourceAsStream("/i18n/index.txt")?.bufferedReader(Charsets.UTF_8)?.readLines().orEmpty()
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = false }
        for (name in index.filter { it.startsWith("$locale/") && it.endsWith(".xml") }) {
            val stream = I18n::class.java.getResourceAsStream("/i18n/$name") ?: continue
            runCatching {
                val doc = stream.use { factory.newDocumentBuilder().parse(it) }
                val nodes = doc.getElementsByTagName("string")
                for (i in 0 until nodes.length) {
                    val n = nodes.item(i)
                    val key = n.attributes?.getNamedItem("name")?.nodeValue ?: continue
                    out[key] = unescape(n.textContent.orEmpty())
                }
            }
        }
        return out
    }

    /** Android resource escapes: \' \" \n \\ and \uXXXX. */
    internal fun unescape(raw: String): String {
        val sb = StringBuilder(raw.length)
        var i = 0
        while (i < raw.length) {
            val c = raw[i]
            if (c == '\\' && i + 1 < raw.length) {
                when (val d = raw[i + 1]) {
                    'n' -> { sb.append('\n'); i += 2 }
                    'u' -> { val hex = raw.substring(i + 2, minOf(i + 6, raw.length)); val cp = if (hex.length == 4) hex.toIntOrNull(16) else null; if (cp != null) { sb.append(cp.toChar()); i += 6 } else { sb.append(d); i += 2 } }
                    else -> { sb.append(d); i += 2 }
                }
            } else { sb.append(c); i++ }
        }
        return sb.toString()
    }
}

/** Short call-site helper: translate an Uzbek literal into the chosen language. */
fun T(uz: String): String = I18n.t(uz)
