package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class SectionsAndPluralsTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(name: String) = checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/$name")) { name }.bufferedReader().readText()

    @Test fun packetRowsCarryTheirSection() {
        val rows = parsePaket(json.parseToJsonElement(res("paket.json")))!!.rows
        assertEquals(8, rows.size)
        assertEquals("Фундамент", rows.first { it.qatorId == 1002L }.bolim)
        assertEquals("Стены", rows.first { it.qatorId == 1007L }.bolim)
        assertEquals(setOf("Фундамент", "Стены"), rows.mapNotNull { it.bolim }.toSet())
    }

    @Test fun packetWithoutHierarchyStillParses() {
        val raw = res("paket.json").replace(Regex("\"ota_id\":\\[[^\\]]*\\],"), "")
        val rows = parsePaket(json.parseToJsonElement(raw))!!.rows
        assertEquals(8, rows.size); assertTrue(rows.all { it.bolim == null })
    }

    @Test fun holatFallbackHasNoSection() {
        val rows = parseHolatRows(5, parseSb(json.parseToJsonElement("""{"ok":true,"qatorlar":[{"qator_id":1,"tur":"bl","nom":"x"}]}"""))!!.rows)
        assertNull(rows.single().bolim)
    }

    // ---- plurals: every count string exists in uz/ru/en with the quantities the language needs, and carries its number ----
    private val resDir = File("src/main/res")
    private fun plurals(dir: String): Map<String, Map<String, String>> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(resDir, "$dir/plurals.xml"))
        val out = LinkedHashMap<String, Map<String, String>>()
        val ps = doc.getElementsByTagName("plurals")
        for (i in 0 until ps.length) {
            val p = ps.item(i); val items = (p as org.w3c.dom.Element).getElementsByTagName("item")
            out[p.getAttribute("name")] = (0 until items.length).associate { (items.item(it) as org.w3c.dom.Element).getAttribute("quantity") to items.item(it).textContent }
        }
        return out
    }

    @Test fun everyPluralExistsInAllThreeLanguagesWithTheRightForms() {
        val uz = plurals("values"); val ru = plurals("values-ru"); val en = plurals("values-en")
        assertTrue(uz.isNotEmpty())
        assertEquals(uz.keys, ru.keys); assertEquals(uz.keys, en.keys)
        for ((name, forms) in uz) assertEquals("uz $name", setOf("one", "other"), forms.keys)
        for ((name, forms) in en) assertEquals("en $name", setOf("one", "other"), forms.keys)
        for ((name, forms) in ru) assertEquals("ru $name", setOf("one", "few", "many", "other"), forms.keys)
    }

    @Test fun everyFormKeepsItsPlaceholdersAndNoLiteralOneRows() {
        for (dir in listOf("values", "values-ru", "values-en")) {
            for ((name, forms) in plurals(dir)) for ((q, text) in forms) {
                assertTrue("$dir/$name/$q has no number", text.contains("%1\$d"))
                val args = Regex("%\\d\\$[ds]").findAll(text).map { it.value }.toSet()
                assertEquals("$dir/$name/$q arguments", plurals("values").getValue(name).getValue("other").let { Regex("%\\d\\$[ds]").findAll(it).map { m -> m.value }.toSet() }, args)
            }
        }
        val en = plurals("values-en")
        assertEquals("%1\$d row", en.getValue("p1_rows").getValue("one")); assertEquals("%1\$d rows", en.getValue("p1_rows").getValue("other"))
    }

    @Test fun countedStringsAreNoLongerPlainStrings() {
        for (dir in listOf("values", "values-ru", "values-en")) {
            val text = File(resDir, "$dir/strings.xml").readText()
            for (n in listOf("p1_rows", "p1_unpriced", "p1_banner_offline", "p1_banner_sending", "p1_banner_failed", "p1_draft_bar", "p1_exceeding_n", "p1_outbox_lines", "p1_warn_unpriced", "p1_card_unpriced_warn")) {
                assertTrue("$dir still has string $n", !text.contains("name=\"$n\""))
            }
        }
    }

    @Test fun everyNewStringExistsInAllLanguages() {
        fun names(dir: String) = Regex("<string name=\"([a-z0-9_]+)\"").findAll(File(resDir, "$dir/strings_p2.xml").readText()).map { it.groupValues[1] }.toSet()
        assertTrue(names("values").size > 60)
        assertEquals(names("values"), names("values-ru")); assertEquals(names("values"), names("values-en"))
    }
}
