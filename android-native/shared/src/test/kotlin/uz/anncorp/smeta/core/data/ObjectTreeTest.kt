package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ObjectTreeTest {
    private val src = HierarchySource(
        loyihalar = listOf(HLoyiha(1, "Navoiy bog'", "faol"), HLoyiha(2, "Yo'l", "yakunlangan")),
        shartnomalar = listOf(HShartnoma(10, "Bino", "7", 1), HShartnoma(11, null, "8", 1), HShartnoma(20, "Asfalt", null, 2)),
        links = listOf(HLink(101, 10), HLink(102, 10), HLink(103, 11), HLink(201, 20), HLink(101, 20)),
        obyektLoyiha = mapOf(101L to 1L, 102L to 1L, 103L to 1L, 201L to 2L),
    )
    private fun leaf(id: Long, name: String, q: Double? = null, u: Double? = null, p: Double? = null) = ObjectLeaf(id, name, null, 3, 0, q, u, p)
    private val leaves = listOf(
        leaf(101, "Korpus A", 112.0, 100.0, 90.0), leaf(102, "Korpus B", 224.0, 200.0, 180.0), leaf(103, "Garaj", null, null, null),
        leaf(201, "Yo'l 1", 56.0, 50.0, 45.0), leaf(301, "Yolg'iz obyekt", 11.2, 10.0, 9.0),
    )

    @Test fun groupsByProjectThenContractAndKeepsOrphansLast() {
        val t = buildObjectTree(leaves, src)
        assertEquals(listOf("Navoiy bog'", "Yo'l", null), t.roots.map { it.title })
        val navoiy = t.roots[0]
        assertEquals(listOf("№7 Bino", "№8"), navoiy.contracts.map { it.title })
        assertEquals(listOf("Korpus A", "Korpus B"), navoiy.contracts[0].leaves.map { it.name })
        // an object without a project and contract is under the synthetic pair, never dropped
        val orphan = t.roots.last()
        assertNull(orphan.loyihaId); assertNull(orphan.contracts.single().shartnomaId)
        assertEquals(5, t.leafCount)
    }

    @Test fun objectInTwoContractsGoesToTheOneOfItsOwnProjectOnlyOnce() {
        // 101 is linked to 10 (project 1) and 20 (project 2); its own project is 1 -> counted once, under contract 10
        val t = buildObjectTree(leaves, src)
        assertEquals(1, t.roots.flatMap { it.contracts }.flatMap { it.leaves }.count { it.id == 101L })
        assertEquals(10L, groupOf(101, src).second)
    }

    @Test fun sumsAddKnownValuesAndNullNeverBecomesZero() {
        val t = buildObjectTree(leaves, src)
        val navoiy = t.roots[0]
        assertEquals(336.0, navoiy.agg.qqsBilan!!, 1e-9)
        assertEquals(1, navoiy.agg.missing); assertTrue(navoiy.agg.partial)
        val garajContract = navoiy.contracts[1]
        assertNull(garajContract.agg.qqsBilan); assertNull(garajContract.agg.ustamali); assertNull(garajContract.agg.ustamasiz)
        assertFalse(garajContract.agg.partial)
        assertEquals(1, garajContract.agg.total)
        assertNull(aggregate(emptyList()).qqsBilan)
    }

    @Test fun searchKeepsTheTreeAndOpensParents() {
        val t = buildObjectTree(leaves, src, TreeFilter(query = "korpus b"))
        assertEquals(1, t.roots.size); assertEquals(1, t.roots[0].contracts.size)
        assertEquals(listOf("Korpus B"), t.roots[0].contracts[0].leaves.map { it.name })
        // sums follow what is visible
        assertEquals(224.0, t.roots[0].agg.qqsBilan!!, 1e-9)
        val rows = flattenTree(t, emptySet(), forceOpen = true)
        assertEquals(3, rows.size); assertTrue(rows[0] is GroupRow && rows[1] is GroupRow && rows[2] is LeafRow)
    }

    @Test fun searchOnContractOrProjectTitleKeepsEverythingUnderIt() {
        val byContract = buildObjectTree(leaves, src, TreeFilter(query = "bino"))
        assertEquals(listOf("Korpus A", "Korpus B"), byContract.roots.single().contracts.single().leaves.map { it.name })
        val byProject = buildObjectTree(leaves, src, TreeFilter(query = "NAVOIY"))
        assertEquals(3, byProject.leafCount)
        assertEquals(0, buildObjectTree(leaves, src, TreeFilter(query = "zzz")).leafCount)
    }

    @Test fun searchIsApostropheInsensitive() {
        assertEquals(1, buildObjectTree(leaves, src, TreeFilter(query = "yolgiz")).leafCount)
    }

    @Test fun filtersByProjectContractAndStatus() {
        assertEquals(1, buildObjectTree(leaves, src, TreeFilter(loyihaId = 2)).leafCount)
        assertEquals(2, buildObjectTree(leaves, src, TreeFilter(shartnomaId = 10)).leafCount)
        assertEquals(1, buildObjectTree(leaves, src, TreeFilter(loyihaId = NONE_ID)).leafCount)
        assertEquals(1, buildObjectTree(leaves, src, TreeFilter(holat = "yakunlangan")).leafCount)
        assertEquals(3, buildObjectTree(leaves, src, TreeFilter(holat = "faol")).leafCount)
    }

    @Test fun withoutHierarchyTheListIsFlatAndSearchable() {
        val t = buildObjectTree(leaves, null, TreeFilter(query = "korpus"))
        assertEquals(listOf("Korpus A", "Korpus B"), t.flat!!.map { it.name })
        assertEquals(2, flattenTree(t, null).size)
    }

    @Test fun smallTreeOpensBigTreeStaysClosedAndStateIsRemembered() {
        val small = buildObjectTree(leaves, src)
        assertEquals(small.roots.sumOf { 1 + it.contracts.size } + 5, flattenTree(small, null).size)
        val many = (1L..30L).map { leaf(it, "Obyekt $it", 1.0, 1.0, 1.0) }
        val bigSrc = HierarchySource(listOf(HLoyiha(1, "P")), emptyList(), emptyList(), many.associate { it.id to 1L })
        val big = buildObjectTree(many, bigSrc)
        assertEquals(1, flattenTree(big, null).size)
        val s1 = toggleKey(null, big, "L:1")
        assertEquals(setOf("L:1"), s1)
        assertEquals(2, flattenTree(big, s1).size) // project + its synthetic contract group
        assertEquals(emptySet<String>(), toggleKey(s1, big, "L:1"))
        assertEquals(s1, decodeKeys(encodeKeys(s1)))
        assertEquals(emptySet<String>(), decodeKeys(encodeKeys(emptySet())))
        assertNull(decodeKeys(encodeKeys(null)))
    }

    @Test fun scopeNarrowsAndOffersOnlyPresentOptions() {
        assertEquals(listOf(101L, 102L, 103L), scopedLeaves(leaves, src, WorkScope(loyihaId = 1)).map { it.id })
        assertEquals(listOf(103L), scopedLeaves(leaves, src, WorkScope(shartnomaId = 11)).map { it.id })
        assertEquals(leaves, scopedLeaves(leaves, src, WorkScope()))
        assertEquals(listOf(1L, 2L, NONE_ID), loyihaOptions(leaves, src).map { it.id })
        assertEquals(listOf(10L, 11L), shartnomaOptions(leaves, src, 1).map { it.id })
        assertEquals("Navoiy bog'", scopeSummary(WorkScope(loyihaId = 1), src, leaves, "-", "-"))
        assertEquals("Navoiy bog' › №8 › Garaj", scopeSummary(WorkScope(1, 11, 103), src, leaves, "-", "-"))
        assertNull(scopeSummary(WorkScope(), src, leaves, "-", "-"))
    }

    @Test fun normalizeDropsWhatNoLongerFits() {
        // project 2 chosen while contract 11 (project 1) and object 103 were selected: both drop
        assertEquals(WorkScope(2, null, null), normalizeScope(WorkScope(2, 11, 103), leaves, src))
        // still fits: kept
        assertEquals(WorkScope(1, 11, 103), normalizeScope(WorkScope(1, 11, 103), leaves, src))
        // contract chosen without project: object of another contract drops
        assertEquals(WorkScope(null, 11, null), normalizeScope(WorkScope(null, 11, 201), leaves, src))
        assertEquals(WorkScope(), normalizeScope(WorkScope(), leaves, null))
    }

    @Test fun parsesTheFourServerReadsAndToleratesAFailedOne() {
        val j = Json.Default
        fun e(s: String) = j.parseToJsonElement(s)
        val loy = e("""{"ok":true,"qatorlar":[{"id":1,"nom":"P1","holat":"faol"}]}""")
        val sh = e("""{"ok":true,"qatorlar":[{"id":10,"nom":"S","raqam":"5","loyiha_id":1}]}""")
        val bog = e("""{"ok":true,"qatorlar":[{"obyekt_id":101,"shartnoma_id":10},{"obyekt_id":102,"shartnoma_id":99}]}""")
        val ob = e("""{"ok":true,"qatorlar":[{"id":101,"loyiha_id":1},{"id":102,"loyiha_id":null}]}""")
        val h = parseHierarchy(loy, sh, bog, ob)!!
        assertEquals(listOf(HLink(101, 10)), h.links) // links to unknown (inactive) contracts are dropped
        assertEquals(mapOf(101L to 1L), h.obyektLoyiha)
        // contracts unreadable -> projects still work
        val partial = parseHierarchy(loy, null, null, ob)!!
        assertTrue(partial.shartnomalar.isEmpty()); assertEquals(1, partial.loyihalar.size)
        assertNull(parseHierarchy(null, null, bog, ob))
        assertNull(parseHierarchy(e("""{"ok":false}"""), e("""{"ok":false}"""), null, null))
    }

    private class FakeApi(val answers: Map<String, ApiResult>) : BffApi {
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null)
        override suspend fun bff(path: String, method: String, body: kotlinx.serialization.json.JsonElement?, etag: String?): ApiResult {
            val table = (body as kotlinx.serialization.json.JsonObject)["jadval"]!!.str()!!
            return answers[table] ?: ApiResult(403, null, "PERMISSION_DENIED")
        }
    }

    @Test fun fetchFoldsTheReadsAndSurvivesADeniedOne() = kotlinx.coroutines.test.runTest {
        fun ok(s: String) = ApiResult(200, Json.parseToJsonElement(s))
        val api = FakeApi(mapOf(
            "t2_loyiha_royxat" to ok("""{"ok":true,"qatorlar":[{"id":1,"nom":"P"}]}"""),
            "t2_obyekt_jami" to ok("""{"ok":true,"qatorlar":[{"id":5,"loyiha_id":1}]}"""),
        ))
        val h = parseHierarchyBody(fetchHierarchy(api, 7).body)!!
        assertEquals(1, h.loyihalar.size); assertTrue(h.shartnomalar.isEmpty()); assertEquals(mapOf(5L to 1L), h.obyektLoyiha)
        // everything denied -> the denial is returned and nothing parses (the screens show the plain list)
        val denied = fetchHierarchy(FakeApi(emptyMap()), 7)
        assertEquals(403, denied.status); assertNull(parseHierarchyBody(denied.body))
        // offline beats a denial so the caller can use its offline copy
        val mixed = object : BffApi { var n = 0; override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): ApiResult = ApiResult(404, null); override suspend fun bff(path: String, method: String, body: kotlinx.serialization.json.JsonElement?, etag: String?) = if (n++ == 2) ApiResult(0, null) else ApiResult(403, null) }
        assertTrue(fetchHierarchy(mixed, 7).networkError)
    }

    @Test fun leafKeepsServerPackageAndFallsBackToDirectOnly() {
        val withPack = objectLeaf(1, "A", null, 1, 0, ObjectMoney(smeta = SumPack(112.0, 100.0, 90.0)), 5.0)
        assertEquals(112.0, withPack.qqsBilan!!, 1e-9); assertEquals(90.0, withPack.ustamasiz!!, 1e-9)
        val none = objectLeaf(2, "B", null, 1, 0, null, 7.0)
        assertNull(none.qqsBilan); assertNull(none.ustamali); assertEquals(7.0, none.ustamasiz!!, 1e-9)
        assertNotNull(none)
    }
}
