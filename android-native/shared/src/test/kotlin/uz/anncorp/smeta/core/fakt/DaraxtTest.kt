package uz.anncorp.smeta.core.fakt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Behaviour tests of the Daraxt tab logic (rules copied from SmetaTree / utils.ts / smetaTreeFiltr.ts: flatten by expansion, ancestors kept by search, % formula). */
class DaraxtTest {
    private fun q(id: Long, tur: String, ota: Long?, nom: String, kod: String? = null, hajm: Double? = null, qosh: Boolean = false, zamena: Boolean = false) =
        T2Qator(id = id, otaId = ota, tur = tur, nom = nom, kod = kod, hajm = hajm, qoshimcha = qosh, zamena = zamena)
    private val rows = listOf(
        q(1, "rz", null, "Bo‘lim A"), q(2, "bl", 1, "Beton quyish", "K-1", 10.0), q(3, "mat", 2, "Beton B25", null, 10.0), q(4, "rz", 1, "Ichki"), q(5, "bl", 4, "Qo‘shimcha ish", "K-9", 5.0, qosh = true),
        q(6, "bl", null, "Bo‘limsiz ish", null, 4.0, zamena = true),
    )
    private fun st(id: Long, smeta: Double?, fakt: Double?, f2: Double?, summa: Double? = null) = JurnalHolat(qatorId = id, smetaHajm = smeta, faktHajm = fakt, f2Hajm = f2, f2MumkinHajm = if (fakt != null && f2 != null) maxOf(0.0, fakt - f2) else null, smetaSumma = summa, faktSumma = summa?.let { it / 2 })
    private val states = listOf(st(2, 10.0, 6.0, 2.0, 1000.0), st(3, 10.0, 0.0, 0.0, 500.0), st(5, 5.0, 5.0, 5.0, 200.0), st(6, 4.0, 5.0, 0.0))
    private val tree = daraxtQur(rows, states)

    @Test fun structureAndSectionMoneyIsTheSumOfDescendants() {
        assertEquals(listOf("Bo‘lim A", "Bo‘limsiz ish"), tree.map { it.nom })
        val a = tree[0]; assertEquals(listOf("Beton quyish", "Ichki"), a.children.map { it.nom }); assertNull(a.smetaHajm)
        assertEquals(1200.0, a.smeta!!, 0.0); assertEquals(600.0, a.stFakt!!, 0.0); assertNull(tree[1].smeta)
    }

    @Test fun flattenFollowsExpansion() {
        assertEquals(listOf("Bo‘lim A", "Bo‘limsiz ish"), daraxtTekis(tree, emptySet()).map { it.node.nom })
        val t = daraxtTekis(tree, setOf(1L, 2L)); assertEquals(listOf("Bo‘lim A", "Beton quyish", "Beton B25", "Ichki", "Bo‘limsiz ish"), t.map { it.node.nom }); assertEquals(listOf(0, 1, 2, 1, 0), t.map { it.depth })
        assertEquals(setOf(1L, 2L, 4L), daraxtBolaliKalitlar(tree))
    }

    @Test fun searchKeepsAncestorsAndFiltersGroups() {
        val s = daraxtSuz(tree, "b25", TezFiltr.Hammasi); assertEquals(listOf("Bo‘lim A"), s.map { it.nom }); assertEquals("Beton quyish", s[0].children.single().nom); assertEquals("Beton B25", s[0].children[0].children.single().nom)
        assertEquals(listOf("K-9"), daraxtTekis(daraxtSuz(tree, "k-9", TezFiltr.Hammasi), daraxtBolaliKalitlar(tree)).mapNotNull { it.node.kod })
        val q = daraxtSuz(tree, "", TezFiltr.Qosh); assertEquals(listOf("Qo‘shimcha ish"), daraxtTekis(q, daraxtBolaliKalitlar(q)).filter { !it.hasChildren }.map { it.node.nom })
        assertEquals(listOf("Bo‘limsiz ish"), daraxtSuz(tree, "", TezFiltr.Zamena).map { it.nom })
        assertTrue(daraxtSuz(tree, "yo‘q-bunday", TezFiltr.Hammasi).isEmpty())
    }

    @Test fun badgesAndCompletion() {
        val c = daraxtTezSoni(tree); assertEquals(3, c[TezFiltr.Bl]); assertEquals(1, c[TezFiltr.Mat]); assertEquals(1, c[TezFiltr.Qosh]); assertEquals(1, c[TezFiltr.Zamena]); assertEquals(2, c[TezFiltr.F2]); assertEquals(2, c[TezFiltr.Asl])
        assertEquals(60, daraxtFoizi(tree[0].children[0])); assertEquals(125, daraxtFoizi(tree[1])); assertNull(daraxtFoizi(tree[0]))
        val o = daraxtOlchov(10.0, 6.0, 2.0)!!; assertEquals(0.2, o.f2Ulush, 1e-9); assertEquals(0.4, o.faktUlush, 1e-9); assertEquals(60, o.foiz); assertFalse(o.oshdi); assertTrue(daraxtOlchov(4.0, 5.0, 0.0)!!.oshdi); assertNull(daraxtOlchov(null, 1.0, 1.0))
    }

    @Test fun writeRules() {
        assertTrue(daraxtFaktKiritiladi("bl") && daraxtFaktKiritiladi("mat") && daraxtFaktKiritiladi("ob")); assertFalse(daraxtFaktKiritiladi("rs")); assertFalse(daraxtFaktKiritiladi("rz"))
        val p = faktBelgilaV2Payload(2, 3, 7, 6.0, 8.0, "2026-11-19", "op", "x")
        assertEquals("\"fakt_belgila_v2\"", p["amal"].toString()); assertEquals("6.0", p["expected_fakt_hajm"].toString()); assertEquals("8.0", p["yangi_fakt_hajm"].toString())
    }
}
