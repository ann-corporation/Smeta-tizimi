package uz.anncorp.smeta.core.fakt

/*
 * Port of frontend/src/lib/formula/number-formula.ts (same grammar, same errors, same limits). No eval: numbers, + - * / ( ) and the
 * names given in the context (SMETA, FAKT, QOLDIQ, F2_MUMKIN). Only turns text into a number; accounting rules are not touched.
 * Parity: the test file ports the site's number-formula.test.ts and fakt-jurnal.formula.test.ts fixtures.
 */

enum class FormulaError { SYNTAX, UNKNOWN_NAME, MISSING_VALUE, DIVIDE_BY_ZERO, INVALID_NUMBER, TOO_COMPLEX }

sealed interface FormulaResult {
    val formula: Boolean
    data class Ok(val value: Double, override val formula: Boolean) : FormulaResult
    data class Err(val error: FormulaError, override val formula: Boolean) : FormulaResult
}

typealias FormulaContext = Map<String, Double?>

private const val MAX_TOKENS = 160
private val plainNumber = Regex("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$")

/** JS `number()` of the site: trim, drop spaces / NBSP, comma -> dot; empty or non-finite -> null. */
private fun number(value: String): Double? {
    val n = value.trim().replace(Regex("[\\s\\u00A0]"), "").replaceFirst(',', '.')
    if (n.isEmpty() || !plainNumber.matches(n)) return null
    return n.toDouble().takeIf { it.isFinite() }
}

private fun bad(e: FormulaError): FormulaResult = FormulaResult.Err(e, true)
private fun good(v: Double): FormulaResult = if (v.isFinite()) FormulaResult.Ok(v, true) else bad(FormulaError.INVALID_NUMBER)

private enum class K { Number, Name, Op, LParen, RParen, End }
private data class Token(val kind: K, val text: String)

private val numberToken = Regex("^(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)")
private val nameToken = Regex("^[A-Za-z_][A-Za-z0-9_]*")

/** null = bad character (SYNTAX); empty list marker for TOO_COMPLEX is signalled by [tooComplex]. */
private class Lexed(val tokens: List<Token>?, val tooComplex: Boolean = false)

private fun lex(source: String): Lexed {
    val out = ArrayList<Token>(); var i = 0
    while (i < source.length) {
        val c = source[i]
        if (c.isWhitespace()) { i++; continue }
        val slice = source.substring(i)
        val n = numberToken.find(slice)
        if (n != null) { out += Token(K.Number, n.value); i += n.value.length; continue }
        val name = nameToken.find(slice)
        if (name != null) { out += Token(K.Name, name.value); i += name.value.length; continue }
        when (c) {
            '+', '-', '*', '/' -> { out += Token(K.Op, c.toString()); i++ }
            '(' -> { out += Token(K.LParen, "("); i++ }
            ')' -> { out += Token(K.RParen, ")"); i++ }
            else -> return Lexed(null)
        }
    }
    return if (out.size > MAX_TOKENS) Lexed(null, tooComplex = true) else Lexed(out + Token(K.End, ""))
}

private class Parser(private val all: List<Token>, context: FormulaContext) {
    private var at = 0
    private var depth = 0
    private val names = HashMap<String, Double?>().also { m -> context.forEach { (k, v) -> m[k.uppercase()] = v } }
    private val token get() = all[at]
    private fun take(kind: K? = null, text: String? = null): Token? { val t = token; if ((kind != null && t.kind != kind) || (text != null && t.text != text)) return null; at++; return t }

    fun read(): FormulaResult { val v = expression(); return if (v is FormulaResult.Ok && token.kind != K.End) bad(FormulaError.SYNTAX) else v }

    private fun expression(): FormulaResult {
        var left = term()
        while (left is FormulaResult.Ok && token.kind == K.Op && (token.text == "+" || token.text == "-")) {
            val op = take(K.Op)!!.text; val right = term(); if (right !is FormulaResult.Ok) return right
            left = good(if (op == "+") left.value + right.value else left.value - right.value)
        }
        return left
    }

    private fun term(): FormulaResult {
        var left = factor()
        while (left is FormulaResult.Ok && token.kind == K.Op && (token.text == "*" || token.text == "/")) {
            val op = take(K.Op)!!.text; val right = factor(); if (right !is FormulaResult.Ok) return right
            if (op == "/" && right.value == 0.0) return bad(FormulaError.DIVIDE_BY_ZERO)
            left = good(if (op == "*") left.value * right.value else left.value / right.value)
        }
        return left
    }

    private fun factor(): FormulaResult {
        if (take(K.Op, "+") != null) return factor()
        if (take(K.Op, "-") != null) { val x = factor(); return if (x is FormulaResult.Ok) good(-x.value) else x }
        val n = take(K.Number); if (n != null) { val v = number(n.text); return if (v == null) bad(FormulaError.INVALID_NUMBER) else good(v) }
        val name = take(K.Name)
        if (name != null) {
            if (token.kind == K.LParen) return bad(FormulaError.UNKNOWN_NAME)   // no function calls
            val key = name.text.uppercase()
            if (!names.containsKey(key)) return bad(FormulaError.UNKNOWN_NAME)
            val v = names[key]
            if (v == null || !v.isFinite()) return bad(FormulaError.MISSING_VALUE)
            return good(v)
        }
        if (take(K.LParen) != null) {
            if (++depth > 24) return bad(FormulaError.TOO_COMPLEX)
            val x = expression(); depth--
            if (x !is FormulaResult.Ok) return x
            return if (take(K.RParen) == null) bad(FormulaError.SYNTAX) else x
        }
        return bad(FormulaError.SYNTAX)
    }
}

/** Text starting with `=` is a formula (context names allowed); otherwise a plain number. Empty text -> INVALID_NUMBER (the caller treats it as NULL). */
fun numberFormula(source: String, context: FormulaContext = emptyMap()): FormulaResult {
    val text = source.trim()
    if (text.isEmpty()) return FormulaResult.Err(FormulaError.INVALID_NUMBER, false)
    if (!text.startsWith("=")) { val v = number(text); return if (v == null) FormulaResult.Err(FormulaError.INVALID_NUMBER, false) else FormulaResult.Ok(v, false) }
    val lexed = lex(text.substring(1))
    if (lexed.tooComplex) return bad(FormulaError.TOO_COMPLEX)
    return lexed.tokens?.let { Parser(it, context).read() } ?: bad(FormulaError.SYNTAX)
}

fun formulaMi(source: String): Boolean = source.trim().startsWith("=")

/** Texts under the cell (Uzbek, translated through the site dictionary by the screen). */
val FORMULA_ERROR_UZ: Map<FormulaError, String> = mapOf(
    FormulaError.SYNTAX to "Formula yozilishi no‘to‘g‘ri",
    FormulaError.UNKNOWN_NAME to "Noma’lum nom (SMETA, FAKT, QOLDIQ, F2_MUMKIN)",
    FormulaError.MISSING_VALUE to "Formula uchun kerakli qiymat noma’lum",
    FormulaError.DIVIDE_BY_ZERO to "0 ga bo‘lish mumkin emas",
    FormulaError.INVALID_NUMBER to "Son yoki formula kiriting",
    FormulaError.TOO_COMPLEX to "Formula juda murakkab",
)
