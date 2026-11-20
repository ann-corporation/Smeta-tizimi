@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QCard
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QHint
import uz.anncorp.qurai.ui.components.QKv
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QPageHead
import uz.anncorp.qurai.ui.components.QSumBlock
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.screens.QFilterOption
import uz.anncorp.qurai.ui.screens.QObjectRow
import uz.anncorp.qurai.ui.screens.QObjectTree
import uz.anncorp.qurai.ui.screens.QScopePanel
import uz.anncorp.qurai.ui.screens.QScopeTexts
import uz.anncorp.qurai.ui.screens.QTreeFilterTexts
import uz.anncorp.qurai.ui.screens.QTreeFilters
import uz.anncorp.qurai.ui.screens.QTreeGroup
import uz.anncorp.qurai.ui.screens.QTreeLeaf
import uz.anncorp.qurai.ui.screens.QTreeRow
import uz.anncorp.qurai.ui.screens.QTreeTexts
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.GroupRow
import uz.anncorp.smeta.core.data.HierarchySource
import uz.anncorp.smeta.core.data.LeafRow
import uz.anncorp.smeta.core.data.Loaded
import uz.anncorp.smeta.core.data.NONE_ID
import uz.anncorp.smeta.core.data.ObjectLeaf
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.TreeFilter
import uz.anncorp.smeta.core.data.TreeRow
import uz.anncorp.smeta.core.data.WorkScope
import uz.anncorp.smeta.core.data.allGroupKeys
import uz.anncorp.smeta.core.data.buildObjectTree
import uz.anncorp.smeta.core.data.flattenTree
import uz.anncorp.smeta.core.data.formatPercent
import uz.anncorp.smeta.core.data.groupOf
import uz.anncorp.smeta.core.data.loyihaOptions
import uz.anncorp.smeta.core.data.normalizeScope
import uz.anncorp.smeta.core.data.objectLeaf
import uz.anncorp.smeta.core.data.scopedLeaves
import uz.anncorp.smeta.core.data.shartnomaOptions
import uz.anncorp.smeta.core.data.toggleKey
import uz.anncorp.smeta.feature.common.Obj

// ---------- texts (the SAME resources as Android: values/values-ru/values-en strings_ierarxiya.xml) ----------

private fun tx(key: String, fallback: String) = I18n.s(key, fallback)
private fun fmt(key: String, fallback: String, n: Int) = String.format(tx(key, fallback), n)

internal fun treeTexts() = QTreeTexts(
    colObject = tx("ier_obyekt", "Obyekt"), colQqs = "QQS bilan", colMarkup = "Ustamali", colPlain = "Ustamasiz", colFact = "Fakt %", colF2 = "F-2 %", empty = tx("ier_empty", "Obyekt topilmadi"),
    rowsLabel = { "$it qator" }, unpricedLabel = { "$it ta narxsiz" },
)

internal fun filterTexts() = QTreeFilterTexts(
    search = tx("ier_search", "Obyekt, shartnoma yoki loyiha"), loyiha = tx("ier_loyiha", "Loyiha"), shartnoma = tx("ier_shartnoma", "Shartnoma"), status = tx("ier_status", "Holat"),
    all = tx("ier_all", "Hammasi"), expandAll = tx("ier_expand_all", "Hammasini yoyish"), collapseAll = tx("ier_collapse_all", "Yig'ish"),
)

internal fun scopeTexts() = QScopeTexts(tx("ier_context", "Kontekst"), tx("ier_loyiha", "Loyiha"), tx("ier_shartnoma", "Shartnoma"), tx("ier_obyekt", "Obyekt"), tx("ier_all", "Hammasi"), tx("ier_context_clear", "Tozalash"))

internal fun holatLabel(h: String): String = when (h) {
    "faol" -> tx("ier_h_faol", "Faol"); "tuxtatilgan" -> tx("ier_h_tuxtatilgan", "To'xtatilgan"); "yakunlangan" -> tx("ier_h_yakunlangan", "Yakunlangan"); "bekor" -> tx("ier_h_bekor", "Bekor qilingan"); else -> h
}

private fun String?.orNull() = this?.takeIf { it.isNotBlank() }

internal fun toQ(rows: List<TreeRow>, selectedId: Long?): List<QTreeRow> = rows.map { r ->
    when (r) {
        is GroupRow -> QTreeGroup(
            r.key, r.depth, r.level,
            r.title ?: if (r.level == 0) tx("ier_no_loyiha", "Loyihasiz") else tx("ier_no_shartnoma", "Shartnomasiz"),
            r.holat.orNull()?.let(::holatLabel), fmt("ier_count", "Obyekt: %1\$d", r.objects), r.open,
            r.agg.qqsBilan?.let(::money), r.agg.ustamali?.let(::money), r.agg.ustamasiz?.let(::money),
            if (r.agg.partial) fmt("ier_partial", "Summa yo'q: %1\$d", r.agg.missing) else null,
        )
        is LeafRow -> r.leaf.let { l ->
            QTreeLeaf(r.key, r.depth, QObjectRow(l.id, l.name, l.type, l.rows, l.unpriced, l.qqsBilan?.let(::money), l.ustamali?.let(::money), l.ustamasiz?.let(::money), l.factPct?.let { formatPercent(it) }, l.f2Pct?.let { formatPercent(it) }), l.id == selectedId)
        }
    }
}

/** Objects as tree leaves: the server estimate package when known, otherwise only the direct amount (never a guessed QQS / markup). */
internal fun leavesOf(objects: List<Obj>, money: Map<Long, ObjectMoney>): List<ObjectLeaf> =
    objects.map { o -> objectLeaf(o.id, o.nom, o.tur, o.rows, o.unpriced, money[o.id], o.total) }

/** Context (loyiha / shartnoma / obyekt) switcher body; used by the shell dialog. */
@Composable
fun ScopeBody(leaves: List<ObjectLeaf>, hier: HierarchySource?, scope: WorkScope, onScope: (WorkScope) -> Unit) {
    val noL = tx("ier_no_loyiha", "Loyihasiz"); val noS = tx("ier_no_shartnoma", "Shartnomasiz")
    val lOpts = loyihaOptions(leaves, hier).map { QFilterOption(it.id, it.title ?: noL) }
    val sOpts = shartnomaOptions(leaves, hier, scope.loyihaId).map { QFilterOption(it.id, it.title ?: noS) }
    val oOpts = scopedLeaves(leaves, hier, scope).map { QFilterOption(it.id, it.name) }
    fun set(s: WorkScope) = onScope(normalizeScope(s, leaves, hier))
    QScopePanel(
        lOpts.firstOrNull { it.id == scope.loyihaId }, lOpts, { set(scope.copy(loyihaId = it.id, shartnomaId = null)) },
        sOpts.firstOrNull { it.id == scope.shartnomaId }, sOpts, { set(scope.copy(shartnomaId = it.id)) },
        oOpts.firstOrNull { it.id == scope.obyektId }, oOpts, { set(scope.copy(obyektId = it.id)) },
        { onScope(WorkScope()) }, texts = scopeTexts(),
    )
}

// ============================ Obyektlar: Loyiha > Shartnoma > Obyekt ============================

@Composable
fun ObjectsScreen(c: Ctx, onGo: (Mod) -> Unit, onSelect: (Obj) -> Unit) {
    val mny = load(c.place.companyId, c.tick) { c.repo.money(c.place.companyId) }
    val m = mny.valueOrNull().orEmpty()
    val cid = c.place.companyId
    var query by remember(cid) { mutableStateOf("") }
    var holat by remember(cid) { mutableStateOf<String?>(null) }
    var expanded by remember(cid) { mutableStateOf(TreePrefs.expanded(cid)) }
    var detail by remember(cid) { mutableStateOf(false) }
    val leaves = remember(c.objects, m) { leavesOf(c.objects, m) }
    val scope = c.scope
    val filter = TreeFilter(query, scope.loyihaId, scope.shartnomaId, holat)
    val tree = remember(leaves, c.hier, filter) { buildObjectTree(leaves, c.hier, filter) }
    val rows = remember(tree, expanded, filter) { flattenTree(tree, expanded, forceOpen = query.isNotBlank()) }
    fun setExpanded(v: Set<String>?) { expanded = v; if (!c.sv.demo) TreePrefs.setExpanded(cid, v) }

    val noL = tx("ier_no_loyiha", "Loyihasiz"); val noS = tx("ier_no_shartnoma", "Shartnomasiz")
    val lOpts = loyihaOptions(leaves, c.hier).map { QFilterOption(it.id, it.title ?: noL) }
    val sOpts = shartnomaOptions(leaves, c.hier, scope.loyihaId).map { QFilterOption(it.id, it.title ?: noS) }
    val statuses = c.hier?.loyihalar?.mapNotNull { it.holat.orNull() }?.distinct().orEmpty()
    val stOpts = statuses.mapIndexed { i, s -> QFilterOption(i.toLong(), holatLabel(s)) }
    val wide = Q.layout.wide
    val big = Q.layout.widthDp >= 1500f
    val treeW = if (big) 940.dp else 540.dp

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QPageHead(tx("nav_objects", "Obyektlar"), desc = fmt("ier_count", "Obyekt: %1\$d", tree.leafCount))
        mny?.Banner()
        if (c.hier == null && c.hierLoaded) QNote(tx("ier_flat_note", "Loyiha va shartnoma ma'lumoti o'qilmadi: oddiy ro'yxat"), tone = QTone.Info)
        if (detail && !wide) {
            c.obj?.let { o -> QButton("← " + tx("ier_obyekt", "Obyekt"), { detail = false }, kind = QButtonKind.Ghost); ObjectCardPane(c, o, m, onGo, Modifier.weight(1f)) }
            return@Column
        }
        Row(Modifier.fillMaxSize().weight(1f), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.then(if (wide) Modifier.width(treeW) else Modifier.weight(1f)).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                QTreeFilters(
                    query, { query = it },
                    lOpts.firstOrNull { it.id == scope.loyihaId }, lOpts, { c.setScope(normalizeScope(scope.copy(loyihaId = it.id, shartnomaId = null), leaves, c.hier)) },
                    sOpts.firstOrNull { it.id == scope.shartnomaId }, sOpts, { c.setScope(normalizeScope(scope.copy(shartnomaId = it.id), leaves, c.hier)) },
                    stOpts.firstOrNull { statuses.getOrNull(it.id?.toInt() ?: -1) == holat }, stOpts, { holat = it.id?.toInt()?.let { i -> statuses.getOrNull(i) } },
                    onExpandAll = { setExpanded(allGroupKeys(tree)) }, onCollapseAll = { setExpanded(emptySet()) },
                    texts = filterTexts(), showStructureFilters = c.hier != null,
                )
                QObjectTree(
                    toQ(rows, c.obj?.id), { key -> setExpanded(toggleKey(expanded, tree, key)) },
                    { id -> c.objects.firstOrNull { it.id == id }?.let { onSelect(it); if (!wide) detail = true } }, Modifier.weight(1f),
                    compact = !big, texts = treeTexts(),
                )
            }
            if (wide) {
                val o = c.obj
                if (o == null) Box(Modifier.weight(1f).fillMaxHeight()) { QHint(tx("ier_pick_hint", "Obyektni tanlang: kartasi shu yerda ochiladi")) }
                else ObjectCardPane(c, o, m, onGo, Modifier.weight(1f).fillMaxHeight())
            }
        }
    }
}

/** Right pane of the two-pane layout: the object card (name, place in the hierarchy, estimate / fact / F-2 sums, progress, quick jumps). */
@Composable
fun ObjectCardPane(c: Ctx, o: Obj, money: Map<Long, ObjectMoney>, onGo: (Mod) -> Unit, modifier: Modifier = Modifier) {
    val mm = money[o.id]
    val (lid, sid) = c.hier?.let { groupOf(o.id, it) } ?: (null to null)
    val path = listOfNotNull(
        lid?.let { id -> c.hier?.loyihalar?.firstOrNull { it.id == id }?.nom?.takeIf { it.isNotBlank() } ?: "#$id" },
        sid?.let { id -> c.hier?.shartnomalar?.firstOrNull { it.id == id }?.let { s -> (s.raqam?.let { "№$it" } ?: "#${s.id}") + (s.nom?.let { " $it" } ?: "") } },
    ).joinToString(" › ")
    Column(modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        QCard(title = o.nom, sub = path.ifBlank { tx("ier_no_shartnoma", "Shartnomasiz") }) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    o.tur?.takeIf { it.isNotBlank() }?.let { QChip(it) }
                    o.rows?.let { QChip(fmt("ier_card_rows", "Qatorlar: %1\$d", it)) }
                    if ((o.unpriced ?: 0) > 0) QChip(fmt("ier_card_unpriced", "Narxsiz qatorlar: %1\$d", o.unpriced ?: 0), tone = QTone.Warn)
                }
                val sm = mm?.smeta
                QSumBlock(sm?.qqsBilan?.let(::money), sm?.ustamali?.let(::money), sm?.ustamasiz?.let(::money), caption = tx("ier_card_smeta", "Smeta"))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    QSumBlock(mm?.fakt?.qqsBilan?.let(::money), mm?.fakt?.ustamali?.let(::money), mm?.fakt?.ustamasiz?.let(::money), Modifier.weight(1f), caption = tx("ier_card_fakt", "Fakt"))
                    QSumBlock(mm?.f2?.qqsBilan?.let(::money), mm?.f2?.ustamali?.let(::money), mm?.f2?.ustamasiz?.let(::money), Modifier.weight(1f), caption = tx("ier_card_f2", "F-2"))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    QKv("Fakt %", mm?.factPct?.let { formatPercent(it) } ?: Tx.dash); QKv("F-2 %", mm?.f2Pct?.let { formatPercent(it) } ?: Tx.dash)
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    QButton(tx("ier_card_smeta", "Smeta"), { onGo(Mod.Smeta) }, kind = QButtonKind.Primary, icon = QIcons.Calculator)
                    QButton(tx("ier_card_f2", "F-2"), { onGo(Mod.F2) }, icon = QIcons.FileOutput)
                    QButton(tx("ier_card_fakt", "Fakt"), { onGo(Mod.Fakt) }, icon = QIcons.HardHat)
                    QButton("Nakopitelniy", { onGo(Mod.Nakop) }, icon = QIcons.FileOutput)
                    QButton("Hujjatlar", { onGo(Mod.Flow) }, icon = QIcons.FileStack)
                }
            }
        }
    }
}
