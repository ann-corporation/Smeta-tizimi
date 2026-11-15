package uz.anncorp.smeta.core.data

import java.math.BigDecimal
import java.math.RoundingMode

/** Uzbek number style: groups of three separated by a non-breaking space, comma as the decimal mark. */
private const val NBSP = ' '

private fun group(intPart: String): String {
    val sb = StringBuilder()
    intPart.forEachIndexed { i, c ->
        if (i > 0 && (intPart.length - i) % 3 == 0) sb.append(NBSP)
        sb.append(c)
    }
    return sb.toString()
}

/** «1 234 567,89». Null (unknown) is shown as an em dash, never as 0. */
fun formatMoney(v: Double?, decimals: Int = 2): String {
    if (v == null || v.isNaN() || v.isInfinite()) return "—"
    val bd = BigDecimal.valueOf(v).setScale(decimals, RoundingMode.HALF_UP)
    val neg = bd.signum() < 0
    val plain = bd.abs().toPlainString()
    val dot = plain.indexOf('.')
    val i = if (dot < 0) plain else plain.substring(0, dot)
    val f = if (dot < 0) "" else plain.substring(dot + 1)
    return (if (neg) "-" else "") + group(i) + if (f.isEmpty()) "" else ",$f"
}

/** Money without kopecks for big headline figures. */
fun formatMoneyShort(v: Double?): String = formatMoney(v, 0)

/** Volume: up to [VOLUME_DECIMALS] decimals, trailing zeros trimmed, comma decimal mark. */
fun formatVolume(v: Double?): String {
    if (v == null || v.isNaN() || v.isInfinite()) return "—"
    val bd = BigDecimal.valueOf(v).setScale(VOLUME_DECIMALS, RoundingMode.HALF_UP).stripTrailingZeros()
    val s = (if (bd.scale() < 0) bd.setScale(0) else bd).abs().toPlainString()
    val dot = s.indexOf('.')
    val i = if (dot < 0) s else s.substring(0, dot)
    val f = if (dot < 0) "" else s.substring(dot + 1)
    return (if (bd.signum() < 0) "-" else "") + group(i) + if (f.isEmpty()) "" else ",$f"
}

const val VOLUME_DECIMALS = 3

/**
 * Parses what a person types on a decimal keypad: «12,5», «12.5», «1 234,567», «,5». Anything ambiguous or
 * non-numeric is null. The result is rounded HALF_UP to [VOLUME_DECIMALS] places (the server stores volumes
 * with the same precision, so what is shown is what is sent).
 */
fun parseVolume(input: String): Double? {
    val t = input.trim().replace(" ", "").replace(" ", "").replace(',', '.')
    if (t.isEmpty() || t == ".") return null
    // Exactly one separator at most, digits elsewhere. No signs, no exponent.
    if (!Regex("^\\d*\\.?\\d*$").matches(t)) return null
    val bd = runCatching { BigDecimal(if (t.startsWith(".")) "0$t" else t) }.getOrNull() ?: return null
    return bd.setScale(VOLUME_DECIMALS, RoundingMode.HALF_UP).toDouble()
}

/** Percent 0..n with one decimal in Uzbek style, or null when the base is unknown/zero. */
fun percentOf(part: Double?, whole: Double?): Double? {
    if (part == null || whole == null || whole <= 0.0) return null
    return part / whole * 100.0
}

fun formatPercent(p: Double?): String {
    if (p == null) return "—"
    val bd = BigDecimal.valueOf(p).setScale(1, RoundingMode.HALF_UP)
    return bd.toPlainString().replace('.', ',') + "%"
}

const val VAT_RATE = 0.12

/** Net (QQS-free) amount -> amount with QQS (12 %). */
fun withVat(net: Double?): Double? = net?.let { BigDecimal.valueOf(it).multiply(BigDecimal.valueOf(1.0 + VAT_RATE)).setScale(2, RoundingMode.HALF_UP).toDouble() }
