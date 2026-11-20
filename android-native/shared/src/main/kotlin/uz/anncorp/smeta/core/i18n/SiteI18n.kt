package uz.anncorp.smeta.core.i18n

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * The website's texts and translations for the native apps. Same rule as the site (`frontend/src/i18n/til.ts`): the key IS the Uzbek Latin text,
 * `t("Saqlash", Lang.Ru)` -> the Russian string, a missing translation falls back to the Uzbek text, `{name}` placeholders are filled.
 * The dictionaries are GENERATED from the site (`frontend/scripts/site-i18n.mjs` -> `resources/site-i18n/{ru,en}.json`) and a site test
 * fails when they drift, so a screen that uses these keys shows exactly the site's wording.
 */
enum class Lang(val code: String) { Uz("uz"), Ru("ru"), En("en") }

object SiteI18n {
    private const val AOSR_CYR = "АОСР"            // АОСР
    private val aosrLatin = Regex("(?<![A-Za-z])AOSR(?![A-Za-z])")
    private val placeholder = Regex("\\{(\\w+)\\}")
    private val json = Json

    private val dict: Map<Lang, Map<String, String>> by lazy {
        mapOf(Lang.Ru to load("ru"), Lang.En to load("en"))
    }

    private fun load(code: String): Map<String, String> {
        val text = SiteI18n::class.java.getResourceAsStream("/site-i18n/$code.json")?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: return emptyMap()
        val o: JsonObject = json.parseToJsonElement(text).jsonObject
        return o.mapValues { (_, v) -> (v as JsonPrimitive).content }
    }

    /** True when [key] has a translation in [lang] (the Uzbek text is its own translation). */
    fun has(key: String, lang: Lang): Boolean = lang == Lang.Uz || dict[lang]?.containsKey(key) == true

    fun t(key: String, lang: Lang, params: Map<String, Any> = emptyMap()): String {
        var s: String = when (lang) {
            Lang.Uz -> if (key.contains(AOSR_CYR)) key.replace(AOSR_CYR, "AOSR") else key
            else -> dict[lang]?.get(key) ?: when (lang) {
                Lang.Ru -> if (key.contains("AOSR")) key.replace(aosrLatin, AOSR_CYR) else key
                else -> if (key.contains(AOSR_CYR)) key.replace(AOSR_CYR, "AOSR") else key
            }
        }
        if (lang == Lang.En && s.contains(AOSR_CYR)) s = s.replace(AOSR_CYR, "AOSR")
        return if (params.isEmpty()) s else placeholder.replace(s) { m -> params[m.groupValues[1]]?.toString() ?: m.value }
    }

    fun t(key: String, code: String?, params: Map<String, Any> = emptyMap()): String = t(key, Lang.entries.firstOrNull { it.code == code } ?: Lang.Uz, params)
}
