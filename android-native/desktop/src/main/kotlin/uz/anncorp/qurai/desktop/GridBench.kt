package uz.anncorp.qurai.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.withFrameNanos
import uz.anncorp.qurai.ui.components.GridCol
import uz.anncorp.qurai.ui.components.GridLogic
import uz.anncorp.qurai.ui.components.GridState

/**
 * `--gridbench[=rows]`: the data grid with synthetic rows (default 10 000) that scrolls itself row by row (keyboard-like, one row per frame, then
 * big jumps) and writes frame-time numbers to `%TEMP%\qurai-gridbench.txt`. Also times sort / filter on the same rows. Synthetic data only.
 */
private data class BRow(val id: Int, val kod: String, val nom: String, val birlik: String, val hajm: Double, val narx: Double, val summa: Double, val izoh: String)

@Composable
fun GridBench(n: Int, onDone: () -> Unit) {
    val rows = remember(n) { List(n) { i -> BRow(i, "C310-%05d".format(i), "Material nomi ${i * 7 % 997} turi ${i % 13}", listOf("m3", "m2", "t", "kg")[i % 4], (i % 500) / 4.0 - 20, 1000.0 + i % 9000, (i % 500) * 100.0, "") } }
    val cols = remember {
        listOf(
            GridCol<BRow>("kod", "Kod", 100f, mono = true, sortKey = { it.kod }) { it.kod }, GridCol("nom", "Nomi", 260f, sortKey = { it.nom }) { it.nom },
            GridCol("b", "Birlik", 60f) { it.birlik }, GridCol("h", "Hajm", 90f, numeric = true, sortKey = { it.hajm }) { "%.3f".format(it.hajm) },
            GridCol("n", "Narx", 100f, numeric = true, sortKey = { it.narx }) { "%.2f".format(it.narx) }, GridCol("s", "Summa", 120f, numeric = true, sortKey = { it.summa }) { "%.2f".format(it.summa) },
        )
    }
    var st by remember { mutableStateOf(GridState()) }
    LaunchedEffect(Unit) {
        val out = StringBuilder("rows=$n\n")
        fun time(name: String, f: () -> Unit) { f(); val t0 = System.nanoTime(); repeat(5) { f() }; out.append("$name: ${(System.nanoTime() - t0) / 5 / 1_000_000.0} ms (avg of 5)\n") }
        time("sort by nom") { GridLogic.view(rows, cols, GridLogic.toggleSort(GridState(), "nom", false)) }
        time("sort by hajm desc x2") { GridLogic.view(rows, cols, GridLogic.toggleSort(GridLogic.toggleSort(GridState(), "hajm", false), "hajm", false)) }
        time("quick filter 'turi 7'") { GridLogic.view(rows, cols, GridLogic.setQuery(GridState(), "turi 7")) }
        time("TSV copy of all rows") { GridLogic.toTsv(rows, cols, GridState()) }
        // warm up compose, then scroll
        repeat(60) { withFrameNanos { } }
        val keys = rows.map { it.id as Any }
        val frames = ArrayList<Double>()
        var last = withFrameNanos { it }
        var s = GridLogic.click(GridState(), keys, 0, false, false)
        for (i in 0 until 1500) {
            s = GridLogic.move(s, keys, if (i < 1000) 1 else 40, false); st = s
            val now = withFrameNanos { it }; frames += (now - last) / 1_000_000.0; last = now
        }
        fun stats(name: String, f: List<Double>) { val s = f.sorted(); out.append("$name frames=${f.size} avg=${"%.2f".format(f.average())} ms p50=${"%.2f".format(s[s.size / 2])} p95=${"%.2f".format(s[(s.size * 0.95).toInt()])} p99=${"%.2f".format(s[(s.size * 0.99).toInt()])} max=${"%.2f".format(s.last())} ms; >16.7ms: ${f.count { it > 16.7 }} (${"%.1f".format(100.0 * f.count { it > 16.7 } / f.size)} %)\n") }
        stats("scroll 1 row/frame (arrow key held)", frames.take(1000)); stats("scroll 40 rows/frame (PageDown-like, extreme)", frames.drop(1000))
        java.io.File(System.getProperty("java.io.tmpdir"), "qurai-gridbench.txt").writeText(out.toString())
        onDone()
    }
    Box(Modifier.fillMaxSize().padding(8.dp)) { DataGrid(rows, cols, key = { it.id }, state = st, onState = { st = it }, modifier = Modifier.fillMaxSize()) }
}
