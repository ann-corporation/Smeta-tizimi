package uz.anncorp.smeta.feature.ombor

/*
 * Smart material search: tolerant to Latin / Cyrillic spelling, common transliteration variants and typos.
 * Pure Kotlin (no android.*, no java.* beyond the stdlib) so it moves into the shared module unchanged.
 * The server's own variant matcher (branch claude/ombor-tayyor) is the later source of truth for synonyms; this client side only has to be
 * forgiving while typing a few letters and works offline on the cached stock list.
 */

/**
 * [searchKey] folded further so that spellings people mix up meet: `w`=`v`, `q`=`k`, lone `c`=`s`, `h`/`kh`=`x`, doubled letters collapse
 * ("sement", "cement", "tsement" -> same stem). Digits stay as they are.
 */
fun fuzzyKey(s: String): String {
    val k = searchKey(s)
    val sb = StringBuilder()
    var i = 0
    while (i < k.length) {
        val c = k[i]
        val next = k.getOrNull(i + 1)
        val out: String = when {
            c == 'c' && next == 'h' -> { i++; "ch" }
            c == 's' && next == 'h' -> { i++; "sh" }
            c == 'k' && next == 'h' -> { i++; "x" }
            c == 't' && next == 's' -> { i++; "s" }
            c == 'h' -> "x"
            c == 'c' -> "s"
            c == 'w' -> "v"
            c == 'q' -> "k"
            else -> c.toString()
        }
        if (out.length == 1 && sb.isNotEmpty() && sb.last() == out[0] && out[0].isLetter()) { i++; continue }
        sb.append(out)
        i++
    }
    return sb.toString()
}

/** Optimal-string-alignment distance (insert, delete, replace, swap of neighbours), bounded by [limit] (returns limit + 1 when above). */
fun editDistance(a: String, b: String, limit: Int): Int {
    if (kotlin.math.abs(a.length - b.length) > limit) return limit + 1
    val d = Array(a.length + 1) { IntArray(b.length + 1) }
    for (i in 0..a.length) d[i][0] = i
    for (j in 0..b.length) d[0][j] = j
    for (i in 1..a.length) for (j in 1..b.length) {
        val cost = if (a[i - 1] == b[j - 1]) 0 else 1
        var v = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) v = minOf(v, d[i - 2][j - 2] + 1)
        d[i][j] = v
    }
    return d[a.length][b.length]
}

/** How many typos a query token of this length may contain: short tokens must be exact, long ones may be a little off. */
fun allowedTypos(tokenLength: Int): Int = when { tokenLength <= 3 -> 0; tokenLength <= 6 -> 1; else -> 2 }

/** 0 = exact / substring, 1..n = typos used, null = no match for this token. */
internal fun tokenScore(token: String, key: String, words: List<String>): Int? {
    if (key.contains(token)) return 0
    val max = allowedTypos(token.length)
    if (max == 0) return null
    var best = max + 1
    for (w in words) {
        best = minOf(best, editDistance(token, w, max), editDistance(token, w.take(token.length), max))
        if (best == 0) break
    }
    return best.takeIf { it <= max }
}

/** Score of [name] for [query]: null when some token does not match (AND), 0 for a clean match, higher = more typos. Blank query = 0. */
fun fuzzyScore(name: String, query: String): Int? {
    val tokens = fuzzyKey(query).split(' ').filter { it.isNotEmpty() }
    if (tokens.isEmpty()) return 0
    val key = fuzzyKey(name)
    val words = key.split(' ').filter { it.isNotEmpty() }
    var total = 0
    for (t in tokens) total += tokenScore(t, key, words) ?: return null
    return total
}
