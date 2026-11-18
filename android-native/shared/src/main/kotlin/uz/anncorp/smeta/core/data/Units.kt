package uz.anncorp.smeta.core.data

/**
 * ONE spelling of a measurement unit on every screen (QA 2026-11-18: «m3» on the warehouse report vs «м3» on the fact screen).
 * The house style is the estimate's own: Cyrillic, no superscripts («м3», «м2», «кг», «т», «шт»). DISPLAY only: the raw unit still travels
 * to the server unchanged (stock identity is name + unit), so call this where the text is drawn, never where a request is built.
 */
fun displayUnit(raw: String?): String {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return ""
    return UNIT_ALIASES[fold(s)] ?: s
}

/** Lower-case, superscripts to digits, no dots / spaces, Latin look-alikes folded to Cyrillic: «m3», «м3», «М³» and «куб.м» meet in one key. */
private fun fold(s: String): String {
    val key = s.lowercase().replace("³", "3").replace("²", "2").replace(".", "").replace(" ", "")
    return buildString { key.forEach { append(LATIN_TO_CYR[it] ?: it) } }
}

private val LATIN_TO_CYR = mapOf('a' to 'а', 'c' to 'с', 'e' to 'е', 'k' to 'к', 'm' to 'м', 'o' to 'о', 'p' to 'р', 't' to 'т', 'x' to 'х', 'y' to 'у', 'h' to 'н', 'b' to 'в')

private val UNIT_ALIASES: Map<String, String> = buildMap {
    fun unit(canon: String, vararg aliases: String) { aliases.forEach { this[fold(it)] = canon } }
    unit("м3", "м3", "куб", "кубм", "кубометр", "kub", "mkub", "m3")
    unit("м2", "м2", "кв", "квм", "kvm", "m2", "кв.м")
    unit("м", "м", "метр", "metr")
    unit("пм", "пм", "погм", "погонныйметр", "pm")
    unit("кг", "кг", "kg", "килограмм")
    unit("т", "т", "тн", "тонна", "tonna", "tn")
    unit("шт", "шт", "штука", "dona", "sht", "дона")
    unit("л", "л", "литр", "litr")
    unit("компл", "компл", "комплект", "komplekt")
}
