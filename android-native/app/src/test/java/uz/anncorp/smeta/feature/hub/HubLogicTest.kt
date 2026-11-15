package uz.anncorp.smeta.feature.hub

import org.junit.Assert.assertEquals
import org.junit.Test
import uz.anncorp.smeta.core.db.ObyektEntity

class HubLogicTest {
    private fun o(id: Long, nom: String) = ObyektEntity(id, 1, nom, null, null, null, null, null)
    private val all = listOf(o(1, "Korpus A"), o(2, "Maktab 12"), o(3, "Korpus B"))

    @Test fun objectSearchNeedsTwoCharsAndIgnoresCase() {
        assertEquals(emptyList<Long>(), matchObjects(all, "k").map { it.id })
        assertEquals(listOf(1L, 3L), matchObjects(all, "KORP").map { it.id })
        assertEquals(listOf(1L), matchObjects(all, "korpus", limit = 1).map { it.id })
    }

    @Test fun recentKeepsRecencyOrderAndDropsMissingObjects() {
        assertEquals(listOf(3L, 1L), resolveRecent(listOf(3, 99, 1), all).map { it.id })
    }
}