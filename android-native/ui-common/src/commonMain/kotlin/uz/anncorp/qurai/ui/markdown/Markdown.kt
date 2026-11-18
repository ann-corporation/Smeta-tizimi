package uz.anncorp.qurai.ui.markdown

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.theme.Q

/** Blocks the chat renderer understands (Jarvis answers): headings, paragraphs, bullet/numbered lists, tables, fenced code, quotes. */
sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Para(val text: String) : MdBlock
    data class Bullets(val items: List<String>) : MdBlock
    data class Numbered(val start: Int, val items: List<String>) : MdBlock
    data class Code(val text: String) : MdBlock
    data class Table(val header: List<String>, val rows: List<List<String>>, val numeric: List<Boolean>) : MdBlock
    data class Quote(val text: String) : MdBlock
    data object Rule : MdBlock
}

private val BULLET = Regex("""^\s*[-*+•]\s+(.*)$""")
private val NUMBERED = Regex("""^\s*(\d{1,3})[.)]\s+(.*)$""")
private val HEADING = Regex("""^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$""")
private val TABLE_SEP = Regex("""^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$""")
private val NUM_CELL = Regex("""^[\s  −+\-]?[\d\s  .,]+\s*(%|[\p{L}./]{0,6})?$""")

private fun splitRow(line: String): List<String> {
    var t = line.trim()
    if (t.startsWith("|")) t = t.substring(1)
    if (t.endsWith("|")) t = t.dropLast(1)
    return t.split("|").map { it.trim() }
}

/** Pure parser (no Compose): the same blocks on Android and Windows; unit tested. Unknown syntax degrades to a paragraph. */
fun parseMarkdown(src: String): List<MdBlock> {
    val lines = src.replace("\r\n", "\n").replace('\r', '\n').split("\n")
    val out = ArrayList<MdBlock>()
    var i = 0
    val para = StringBuilder()
    fun flush() { if (para.isNotBlank()) out += MdBlock.Para(para.toString().trim()); para.clear() }
    while (i < lines.size) {
        val line = lines[i]
        val trimmed = line.trim()
        when {
            trimmed.startsWith("```") -> {
                flush()
                val code = StringBuilder(); i++
                while (i < lines.size && !lines[i].trim().startsWith("```")) { code.append(lines[i]).append('\n'); i++ }
                out += MdBlock.Code(code.toString().trimEnd('\n'))
                i++
            }
            trimmed.isEmpty() -> { flush(); i++ }
            HEADING.matches(line) -> { flush(); val m = HEADING.find(line)!!; out += MdBlock.Heading(m.groupValues[1].length, m.groupValues[2]); i++ }
            trimmed.matches(Regex("""^(-{3,}|\*{3,}|_{3,})$""")) -> { flush(); out += MdBlock.Rule; i++ }
            trimmed.startsWith("|") && i + 1 < lines.size && TABLE_SEP.matches(lines[i + 1]) -> {
                flush()
                val header = splitRow(line); i += 2
                val rows = ArrayList<List<String>>()
                while (i < lines.size && lines[i].trim().startsWith("|")) { rows += splitRow(lines[i]).let { r -> List(header.size) { k -> r.getOrElse(k) { "" } } }; i++ }
                val numeric = header.indices.map { k -> rows.isNotEmpty() && rows.all { r -> r[k].isEmpty() || r[k] == "—" || NUM_CELL.matches(r[k]) } && rows.any { r -> r[k].any(Char::isDigit) } }
                out += MdBlock.Table(header, rows, numeric)
            }
            BULLET.matches(line) -> {
                flush(); val items = ArrayList<String>()
                while (i < lines.size && BULLET.matches(lines[i])) { items += BULLET.find(lines[i])!!.groupValues[1]; i++ }
                out += MdBlock.Bullets(items)
            }
            NUMBERED.matches(line) -> {
                flush(); val start = NUMBERED.find(line)!!.groupValues[1].toInt(); val items = ArrayList<String>()
                while (i < lines.size && NUMBERED.matches(lines[i])) { items += NUMBERED.find(lines[i])!!.groupValues[2]; i++ }
                out += MdBlock.Numbered(start, items)
            }
            trimmed.startsWith(">") -> {
                flush(); val q = StringBuilder()
                while (i < lines.size && lines[i].trim().startsWith(">")) { q.append(lines[i].trim().removePrefix(">").trim()).append(' '); i++ }
                out += MdBlock.Quote(q.toString().trim())
            }
            else -> { if (para.isNotEmpty()) para.append('\n'); para.append(line.trim()); i++ }
        }
    }
    flush()
    return out
}

/** Plain text of an inline run with the markers removed (used by tests and for copy). */
fun mdPlain(text: String): String = inlineSpans(text).joinToString("") { it.text }

internal enum class Mark { None, Bold, Italic, BoldItalic, Code, Link }
internal data class Span(val text: String, val mark: Mark)

/** Inline: `**bold**`, `__bold__`, `*italic*`, `_italic_`, `***both***`, `` `code` ``, `[text](url)`. Unclosed markers stay literal. */
internal fun inlineSpans(s: String): List<Span> {
    val out = ArrayList<Span>()
    val plain = StringBuilder()
    fun flush() { if (plain.isNotEmpty()) { out += Span(plain.toString(), Mark.None); plain.clear() } }
    var i = 0
    while (i < s.length) {
        val ch = s[i]
        fun tryClose(marker: String, mark: Mark): Boolean {
            if (!s.startsWith(marker, i)) return false
            val end = s.indexOf(marker, i + marker.length)
            if (end <= i + marker.length) return false
            val inner = s.substring(i + marker.length, end)
            if (inner.isBlank() || inner.first().isWhitespace() && marker.length == 1) return false
            flush(); out += Span(inner, mark); i = end + marker.length
            return true
        }
        when {
            ch == '`' && tryClose("`", Mark.Code) -> {}
            ch == '*' && tryClose("***", Mark.BoldItalic) -> {}
            ch == '*' && tryClose("**", Mark.Bold) -> {}
            ch == '_' && tryClose("__", Mark.Bold) -> {}
            ch == '*' && tryClose("*", Mark.Italic) -> {}
            ch == '_' && (i == 0 || !s[i - 1].isLetterOrDigit()) && tryClose("_", Mark.Italic) -> {}
            ch == '[' -> {
                val close = s.indexOf("](", i)
                val end = if (close > i) s.indexOf(')', close) else -1
                if (close > i && end > close) { flush(); out += Span(s.substring(i + 1, close), Mark.Link); i = end + 1 } else { plain.append(ch); i++ }
            }
            ch == '\\' && i + 1 < s.length && s[i + 1] in "*_`[]\\" -> { plain.append(s[i + 1]); i += 2 }
            else -> { plain.append(ch); i++ }
        }
    }
    flush()
    return out
}

@Composable
private fun inline(text: String, color: Color, linkColor: Color, codeBg: Color): AnnotatedString = remember(text, color, linkColor, codeBg) {
    buildAnnotatedString {
        inlineSpans(text).forEach { sp ->
            when (sp.mark) {
                Mark.None -> append(sp.text)
                Mark.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(sp.text) }
                Mark.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(sp.text) }
                Mark.BoldItalic -> withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)) { append(sp.text) }
                Mark.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBg)) { append(sp.text) }
                Mark.Link -> withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) { append(sp.text) }
            }
        }
    }
}

/**
 * ONE markdown renderer for Jarvis on Android and Windows: bold/italic/code/links, headings, bullet and numbered lists, tables
 * (numeric columns right-aligned, header like the site's tables), fenced code. Text is selectable.
 */
@Composable
fun QMarkdown(text: String, modifier: Modifier = Modifier, color: Color = Q.colors.text) {
    val c = Q.colors
    val blocks = remember(text) { parseMarkdown(text) }
    val link = c.accentText
    val codeBg = c.surface3
    SelectionContainer {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            blocks.forEach { b ->
                when (b) {
                    is MdBlock.Heading -> Text(inline(b.text, color, link, codeBg), style = if (b.level <= 2) Q.type.titleMedium else Q.type.titleSmall, color = color, fontWeight = FontWeight.SemiBold)
                    is MdBlock.Para -> Text(inline(b.text, color, link, codeBg), style = Q.type.bodyMedium, color = color)
                    is MdBlock.Bullets -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        b.items.forEach { Row { Text("•", Modifier.width(16.dp), color = c.textMute); Text(inline(it, color, link, codeBg), style = Q.type.bodyMedium, color = color) } }
                    }
                    is MdBlock.Numbered -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        b.items.forEachIndexed { k, it -> Row { Text("${b.start + k}.", Modifier.width(22.dp), color = c.textMute, style = Q.type.bodyMedium); Text(inline(it, color, link, codeBg), style = Q.type.bodyMedium, color = color) } }
                    }
                    is MdBlock.Code -> Text(b.text, Modifier.fillMaxWidth().background(c.surface3, Q.shape.small).horizontalScroll(rememberScrollState()).padding(8.dp), style = Q.type.bodySmall, fontFamily = FontFamily.Monospace, color = c.text)
                    is MdBlock.Quote -> Row(Modifier.fillMaxWidth()) {
                        Box(Modifier.width(3.dp).height(18.dp).background(c.accent)); Text(inline(b.text, c.textDim, link, codeBg), Modifier.padding(start = 8.dp), style = Q.type.bodyMedium, color = c.textDim)
                    }
                    MdBlock.Rule -> Box(Modifier.fillMaxWidth().height(1.dp).background(c.border))
                    is MdBlock.Table -> MdTable(b, link, codeBg)
                }
            }
        }
    }
}

@Composable
private fun MdTable(t: MdBlock.Table, link: Color, codeBg: Color) {
    val c = Q.colors
    val widths = t.header.indices.map { k -> (maxOf(mdPlain(t.header[k]).length, t.rows.maxOfOrNull { mdPlain(it[k]).length } ?: 0) * 7 + 18).coerceIn(64, 240).dp }
    Column(Modifier.border(BorderStroke(1.dp, c.border), Q.shape.small).horizontalScroll(rememberScrollState())) {
        Row(Modifier.background(c.surface3)) {
            t.header.forEachIndexed { k, h ->
                Text(inline(h, c.textDim, link, codeBg), Modifier.width(widths[k]).padding(horizontal = 8.dp, vertical = 5.dp), style = Q.type.labelMedium, color = c.textDim, textAlign = if (t.numeric[k]) TextAlign.End else TextAlign.Start, fontWeight = FontWeight.SemiBold)
            }
        }
        t.rows.forEach { r ->
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.border))
            Row {
                r.forEachIndexed { k, cell ->
                    Text(inline(cell, c.text, link, codeBg), Modifier.width(widths[k]).padding(horizontal = 8.dp, vertical = 5.dp), style = Q.type.bodySmall, color = c.text, textAlign = if (t.numeric[k]) TextAlign.End else TextAlign.Start)
                }
            }
        }
    }
}
