package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The packet becomes the same RZ -> BL -> RS/MAT/OB tree the web shows, in web order, with collapse / search context. */
class SmetaTreeTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun packet() = parsePaket(json.parseToJsonElement(checkNotNull(javaClass.classLoader!!.getResourceAsStream("demo/paket.json")).bufferedReader().readText()))!!
    private val nodes get() = packet().nodes

    @Test fun treeKeepsHierarchyAndWebOrder() {
        val n = nodes
        assertEquals(16, n.size)
        assertEquals(listOf(1001L, 1002, 1003, 1011, 1012, 1013, 1004, 1014, 1005, 1006, 1007, 1015, 1016, 1008, 1009, 1010), n.map { it.id })
        assertEquals(n.indices.toList(), n.map { it.ord })                       // ord IS the depth-first position
        assertEquals(listOf(0, 1, 1, 2, 2, 2, 1, 2, 1, 0, 1, 2, 2, 1, 1, 1), n.map { it.depth })
        assertEquals("rz", n[0].tur); assertEquals("bl", n[1].tur); assertEquals("rs", n[3].tur); assertEquals("mat", n[4].tur)
        assertEquals(1003L, n[3].parentId); assertNull(n[0].parentId)
        assertTrue(n[0].hasChildren && n[2].hasChildren); assertFalse(n[1].hasChildren)   // 1002 has no resources
        assertEquals("ЧЕЛ", n[3].kat); assertEquals(15.08, n[3].norma!!, 0.0); assertEquals("чел-ч", n[3].birlik)
        assertEquals(36.1, n[2].faktHajm, 0.0)
        assertEquals(8, packet().rows.size)                                       // fact-entry rows are still only the works
    }

    @Test fun collapsedByDefaultThenExpand() {
        val n = nodes
        assertEquals(listOf(1001L, 1006L), visibleNodes(n, emptySet(), "").map { it.id })          // sections collapsed
        assertEquals(listOf(1001L, 1002, 1003, 1004, 1005, 1006), visibleNodes(n, setOf(1001L), "").map { it.id })   // works, resources still closed
        val withRes = visibleNodes(n, setOf(1001L, 1003L), "").map { it.id }
        assertTrue(listOf(1003L, 1011L, 1012L, 1013L, 1004L) == withRes.subList(2, 7))
        assertEquals(16, visibleNodes(n, expandableIds(n), "").size)                                // expand all
    }

    @Test fun searchKeepsTheParentPath() {
        val n = nodes
        // A material deep in the tree: shown together with its work and its section, though everything is collapsed.
        assertEquals(listOf(1001L, 1003L, 1012L), visibleNodes(n, emptySet(), "d12").map { it.id })
        // By code; case-insensitive name; no hit.
        assertEquals(listOf(1006L, 1009L), visibleNodes(n, emptySet(), "321-03").map { it.id })
        assertEquals(listOf(1001L, 1004L), visibleNodes(n, emptySet(), "бетонирование").map { it.id })
        assertTrue(visibleNodes(n, emptySet(), "zzzz").isEmpty())
        // A matched, expanded work also shows its resources.
        val open = visibleNodes(n, setOf(1007L), "кладка").map { it.id }
        assertEquals(listOf(1006L, 1007L, 1015L, 1016L), open)
    }

    @Test fun rollupsAreServerRowAmountsPerSection() {
        val r = rollups(nodes)
        assertEquals(4, r.getValue(1001L).blCount); assertEquals(4, r.getValue(1006L).blCount)
        assertEquals(1, r.getValue(1001L).unpriced)                    // 1005 has no price
        assertEquals(1, r.getValue(1002L).blCount)                    // a work rolls up to itself, not from its resources
        assertNull(r[1011L])                                          // resources carry no roll-up
        assertEquals(49.64, r.getValue(1001L).factPercent!!, 0.01)     // (26.16M + 353.78M) / (78.3M + 350.8M + 336.2M), server row amounts
    }

    @Test fun fallbackBuildsSectionsFromRowSectionNames() {
        val rows = packet().rows.map { it.copy(bolim = if (it.qatorId <= 1005) "Фундамент" else "Стены") }
        val f = fallbackNodes(rows)
        assertEquals(10, f.size)                                      // 2 virtual sections + 8 works
        assertEquals(listOf("rz", "bl", "bl", "bl", "bl", "rz", "bl", "bl", "bl", "bl"), f.map { it.tur })
        assertEquals(2, visibleNodes(f, emptySet(), "").size)
        assertTrue(f[0].id < 0 && f[1].parentId == f[0].id)
        assertEquals(1002L, f[1].id); assertEquals(rows.first { it.qatorId == 1002L }.smetaHajm, f[1].hajm)
    }

    @Test fun bigObjectStaysLinear() {
        // 26 000 works under 100 sections: flatten + roll-ups are single passes.
        val big = buildList {
            var ord = 0
            repeat(100) { s ->
                add(uz.anncorp.smeta.core.db.NodeEntity(1, 100000L + s, null, ord++, 0, "rz", null, null, "S$s", null, null, null, null, null, 0.0, 0.0, 0.0, 0.0, 0.0, true))
                repeat(260) { b -> add(uz.anncorp.smeta.core.db.NodeEntity(1, s * 1000L + b, 100000L + s, ord++, 1, "bl", null, "K$b", "W$b", "m", 1.0, 1.0, 10.0, null, 0.5, 5.0, 0.0, 0.0, 0.0, false)) }
            }
        }
        val t0 = System.nanoTime()
        assertEquals(100, visibleNodes(big, emptySet(), "").size)
        assertEquals(26100, visibleNodes(big, expandableIds(big), "").size)
        assertTrue(visibleNodes(big, emptySet(), "W5 ").size > 0)
        assertEquals(50.0, rollups(big).getValue(100000L).factPercent!!, 1e-9)
        assertTrue("took ${(System.nanoTime() - t0) / 1_000_000} ms", (System.nanoTime() - t0) / 1_000_000 < 3000)
    }
}
