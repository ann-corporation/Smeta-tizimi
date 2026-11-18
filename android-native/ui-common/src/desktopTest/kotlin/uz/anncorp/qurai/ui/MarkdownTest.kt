package uz.anncorp.qurai.ui

import uz.anncorp.qurai.ui.markdown.MdBlock
import uz.anncorp.qurai.ui.markdown.mdPlain
import uz.anncorp.qurai.ui.markdown.parseMarkdown
import uz.anncorp.qurai.ui.nav.QNav
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MarkdownTest {
    @Test fun boldMarkersDisappear() {
        assertEquals("Jami qoldiq: 5 ta", mdPlain("Jami **qoldiq**: 5 ta"))
        assertEquals("a * b", mdPlain("a * b"))
        assertEquals("ochilmagan **belgi", mdPlain("ochilmagan **belgi"))
        assertEquals("kod va link", mdPlain("`kod` va [link](https://qurai.uz)"))
    }

    @Test fun listsHeadingsCode() {
        val b = parseMarkdown("## Sarlavha\n- bir\n- **ikki**\n\n1. a\n2. b\n\n```\nx = 1\n```\nmatn")
        assertTrue(b[0] is MdBlock.Heading && (b[0] as MdBlock.Heading).level == 2)
        assertEquals(listOf("bir", "**ikki**"), (b[1] as MdBlock.Bullets).items)
        assertEquals(2, (b[2] as MdBlock.Numbered).items.size)
        assertEquals("x = 1", (b[3] as MdBlock.Code).text)
        assertEquals("matn", (b[4] as MdBlock.Para).text)
    }

    @Test fun tableWithNumericColumn() {
        val b = parseMarkdown("| Nom | Qoldiq |\n|---|---:|\n| Sement | 1 250,5 |\n| Armatura | 300 |")
        val t = b.single() as MdBlock.Table
        assertEquals(listOf("Nom", "Qoldiq"), t.header)
        assertEquals(2, t.rows.size)
        assertEquals(listOf(false, true), t.numeric)
    }

    @Test fun navModelMatchesWebWorkPlaces() {
        assertEquals(listOf("Bugun", "Obyekt", "Hujjatlar", "Ta‘minot", "Moliya", "Tomonlar", "Kompaniya"), QNav.sections.map { it.title })
        val v = QNav.visible(setOf("ombor", "obyektlar"))
        assertEquals(listOf("obyekt", "taminot"), v.map { it.id })
    }
}
