@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QCard
import uz.anncorp.qurai.ui.components.QError
import uz.anncorp.qurai.ui.components.QHint
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QPageHead
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.Loaded
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.notifKind

/**
 * Bosh sahifa (Bugun), the same content as the Android "Bugun" tab: what waits for approval, my F-2 / fakt drafts (field roles only),
 * unread notifications and the latest ones. Counters that could not be read show a dash, never 0.
 */
@Composable
fun TodayScreen(c: Ctx, onGo: (Mod) -> Unit) {
    val repo = remember(c.sv, c.sv.demo) { TodayRepository(c.sv.api) }
    val d = load(c.place.companyId, c.tick) {
        val x = repo.load(c.place.companyId, c.place.rol)
        if (x.approvals == null && x.unread == null && x.f2Drafts == null && x.faktDrafts == null) Loaded.Failed("TODAY") else Loaded.Fresh(x)
    }
    Page(I18n.s("ier_today_title", "Bosh sahifa"), c.place.nom.ifBlank { null }) {
        when (val v = d.valueOrNull()) {
            null -> if (d == null) QLoading() else QError(Tx.nodata)
            else -> Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Counter(I18n.s("p2_today_approvals", "Tasdiq kutayotgan hujjatlar"), v.approvals) { onGo(Mod.Flow) }
                    if (v.f2Drafts != null) Counter(I18n.s("p2_today_f2", "F-2 qoralamalari"), v.f2Drafts) { onGo(Mod.F2) }
                    if (v.faktDrafts != null) Counter(I18n.s("p2_today_fakt", "Fakt qoralamalari"), v.faktDrafts) { onGo(Mod.Fakt) }
                    Counter(I18n.s("p2_today_notes", "Oxirgi bildirishnomalar"), v.unread) { onGo(Mod.Notif) }
                }
                QCard(title = I18n.s("p2_today_notes", "Oxirgi bildirishnomalar")) {
                    if (v.notifications.isEmpty()) QHint(I18n.s("p2_today_notes_empty", "Bildirishnoma yo'q"))
                    else Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        v.notifications.forEach { n ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(if (n.oqildi) "" else "●", Modifier.widthIn(min = 14.dp), color = Q.colors.accent)
                                Text(notifKind(n.mavzu).label(), Modifier.weight(1f), style = Q.type.bodyMedium, color = if (n.oqildi) Q.colors.textDim else Q.colors.text)
                                n.yaratildi?.let { Text(formatIsoStamp(it), style = Q.type.labelSmall, color = Q.colors.textMute) }
                            }
                        }
                        QButton(I18n.s("ier_today_go", "Ochish"), { onGo(Mod.Notif) }, kind = QButtonKind.Ghost)
                    }
                }
            }
        }
    }
}

@Composable
private fun Counter(label: String, value: Int?, onClick: () -> Unit) {
    QCard(Modifier.widthIn(min = 220.dp, max = 300.dp), onClick = onClick) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value?.toString() ?: Tx.dash, style = Q.type.headlineMedium, color = if ((value ?: 0) > 0) Q.colors.accentText else Q.colors.textMute)
            Text(label, style = Q.type.bodySmall, color = Q.colors.textDim, maxLines = 2)
        }
    }
}
