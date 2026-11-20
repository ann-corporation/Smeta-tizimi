package uz.anncorp.smeta.feature.hujjat

import uz.anncorp.smeta.feature.common.DocRow

/*
 * Hujjatlar (document registry) list helpers shared by Windows and Android: the filter bar (type, text, only ready) and the file-name rule
 * for «papkaga yuklab olish» (several documents into one chosen folder never overwrite each other). Pure; the list itself is the server's
 * canonical registry (GET /api/hujjat-royxat), nothing is derived here.
 */
data class DocFilter(val type: String? = null, val query: String = "", val readyOnly: Boolean = false) {
    val active: Boolean get() = type != null || query.isNotBlank() || readyOnly
    fun apply(rows: List<DocRow>): List<DocRow> {
        val q = query.trim().lowercase()
        return rows.filter { (type == null || it.type == type) && (!readyOnly || it.ready) && (q.isEmpty() || it.name.lowercase().contains(q) || it.type.lowercase().contains(q)) }
    }
}

/** Distinct document types in the list, most frequent first (for the type chips). */
fun docTypes(rows: List<DocRow>): List<Pair<String, Int>> = rows.groupingBy { it.type }.eachCount().toList().sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })

/** [name] made unique against [taken] (case-insensitive, Windows file names): `a.xlsx`, `a (1).xlsx`, `a (2).xlsx`. The chosen name is added to [taken]. */
fun uniqueFileName(name: String, taken: MutableSet<String>): String {
    val dot = name.lastIndexOf('.')
    val base = if (dot > 0) name.substring(0, dot) else name
    val ext = if (dot > 0) name.substring(dot) else ""
    var n = name; var i = 1
    while (!taken.add(n.lowercase())) { n = "$base ($i)$ext"; i++ }
    return n
}

/** Files Excel opens directly (the «Excelda ochish» button is offered for these). */
fun isSpreadsheet(name: String): Boolean = name.lowercase().let { it.endsWith(".xlsx") || it.endsWith(".xls") || it.endsWith(".xlsm") || it.endsWith(".csv") }

fun sizeText(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${bytes / 1024} KB"
    else -> "%.1f MB".format(java.util.Locale.ROOT, bytes / 1048576.0)
}
