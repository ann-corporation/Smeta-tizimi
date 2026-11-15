package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NodeSumsTest {
    private fun p(s: String) = parseNodeSums(Json.parseToJsonElement(s))

    @Test fun parsesThreeFormsAndKeepsNullAndMinus() {
        val r = p("""{"ok":true,"ustama":"bor","tugunlar":[[7,[1120.5,1000,900],[null,null,50],[-12.5,-11,-10]]]}""")!!
        assertTrue(r.hasMarkup)
        val n = r.nodes[7L]!!
        assertEquals(Forms(1120.5, 1000.0, 900.0), n.smeta)
        assertEquals(Forms(null, null, 50.0), n.fakt)          // unknown stays null, never 0
        assertEquals(-12.5, n.f2.qqsBilan!!, 0.0)               // minus keeps its sign
        assertTrue(n.smeta.complete); assertFalse(n.fakt.complete)
    }

    @Test fun noMarkupObjectCarriesOnlyPlainSums() {
        val r = p("""{"ok":true,"ustama":"yoq","sabab":"USTAMA_YOQ","tugunlar":[[1,[null,null,500],[null,null,null],[null,null,null]]]}""")!!
        assertFalse(r.hasMarkup)
        assertNull(r.nodes[1L]!!.smeta.qqsBilan)
        assertEquals(500.0, r.nodes[1L]!!.smeta.ustamasiz!!, 0.0)
    }

    @Test fun wrongShapesAreRejectedWholeOrSkipped() {
        assertNull(p("""{"ok":false}""")); assertNull(p("""{"ok":true}""")); assertNull(p("[]"))
        assertEquals(1, p("""{"ok":true,"ustama":"bor","tugunlar":[[2,[1,2,3],[],[]],["x"],"junk"]}""")!!.nodes.size)
    }
}