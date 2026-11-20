package uz.anncorp.qurai.ui

import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridLogic
import uz.anncorp.qurai.ui.components.GridState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GridModelTest {
    private data class Row(val id: Int, val nom: String, val hajm: Double?)
    private val cols = listOf(
        GridCol<Row>("nom", "Nomi", sortKey = { it.nom.lowercase() }) { it.nom },
        GridCol<Row>("hajm", "Hajm", numeric = true, sortKey = { it.hajm }) { it.hajm?.toString() ?: "" },
    )
    private val rows = listOf(Row(1, "Beton", 10.0), Row(2, "armatura", -3.0), Row(3, "Kirpich", null), Row(4, "Beton M300", 10.0))
    private val keys get() = rows.map { it.id as Any }

    @Test fun sortCyclesAscDescOffAndNullsGoLast() {
        var s = GridLogic.toggleSort(GridState(), "hajm", false)
        assertEquals(listOf(2, 1, 4, 3), GridLogic.view(rows, cols, s).map { it.id })
        s = GridLogic.toggleSort(s, "hajm", false)
        assertEquals(listOf(1, 4, 2, 3), GridLogic.view(rows, cols, s).map { it.id }.let { it })
        s = GridLogic.toggleSort(s, "hajm", false)
        assertTrue(s.sort.isEmpty())
    }

    @Test fun shiftSortAddsSecondKey() {
        var s = GridLogic.toggleSort(GridState(), "hajm", false)
        s = GridLogic.toggleSort(s, "nom", true)
        assertEquals(listOf(2, 1, 4, 3), GridLogic.view(rows, cols, s).map { it.id })
        assertEquals(2, s.sort.size)
    }

    @Test fun quickAndColumnFiltersAreCaseInsensitive() {
        assertEquals(listOf(1, 4), GridLogic.view(rows, cols, GridLogic.setQuery(GridState(), "BETON")).map { it.id })
        val f = GridLogic.setFilter(GridState(), "nom", "m300")
        assertEquals(listOf(4), GridLogic.view(rows, cols, f).map { it.id })
        assertTrue(GridLogic.setFilter(f, "nom", " ").filters.isEmpty())
    }

    @Test fun selectionClickCtrlShiftAndKeyboard() {
        var s = GridLogic.click(GridState(), keys, 1, ctrl = false, shift = false)
        assertEquals(setOf<Any>(2), s.selected)
        s = GridLogic.click(s, keys, 3, ctrl = true, shift = false)
        assertEquals(setOf<Any>(2, 4), s.selected)
        s = GridLogic.click(s, keys, 3, ctrl = true, shift = false)
        assertEquals(setOf<Any>(2), s.selected)
        s = GridLogic.click(GridLogic.click(s, keys, 1, false, false), keys, 3, ctrl = false, shift = true)
        assertEquals(setOf<Any>(2, 3, 4), s.selected)
        s = GridLogic.move(GridLogic.click(GridState(), keys, 0, false, false), keys, 1, shift = false)
        assertEquals(2, s.active); assertEquals(setOf<Any>(2), s.selected)
        s = GridLogic.move(s, keys, 1, shift = true)
        assertEquals(setOf<Any>(2, 3), s.selected)
        assertEquals(4, GridLogic.move(s, keys, 1, false, toEnd = true).active)
        assertEquals(1, GridLogic.move(s, keys, -1, false, toEnd = true).active)
        assertEquals(1, GridLogic.move(GridState(), keys, 1, false).active)
    }

    @Test fun pruneDropsKeysThatDisappeared() {
        val s = GridLogic.prune(GridLogic.selectAll(GridState(), keys), listOf(1, 2))
        assertEquals(setOf<Any>(1, 2), s.selected)
    }

    @Test fun columnResizeMoveHideAndMinWidth() {
        var s = GridLogic.resize(GridState(), "nom", 120f, -500f)
        assertEquals(GridLogic.MIN_WIDTH, GridLogic.widthOf(cols[0], s))
        s = GridLogic.moveColumn(cols, s, "hajm", 0)
        assertEquals(listOf("hajm", "nom"), GridLogic.visible(cols, s).map { it.id })
        s = GridLogic.toggleHidden(s, "nom")
        assertEquals(listOf("hajm"), GridLogic.visible(cols, s).map { it.id })
    }

    @Test fun tsvAndCsvForExcel() {
        val tsv = GridLogic.toTsv(listOf(Row(9, "a\tb;c", 1.5)), cols, GridState())
        assertEquals("Nomi\tHajm\r\na b;c\t1.5", tsv)
        val csv = GridLogic.toCsv(listOf(Row(9, "a;\"b\"", 1.5)), cols, GridState())
        assertTrue(csv.startsWith("﻿Nomi;Hajm\r\n\"a;\"\"b\"\"\";1.5"))
    }
}
