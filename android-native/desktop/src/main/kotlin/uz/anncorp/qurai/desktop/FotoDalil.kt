@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
import uz.anncorp.smeta.core.i18n.SiteI18n
import uz.anncorp.smeta.feature.common.Obj
import uz.anncorp.smeta.feature.common.docPath
import uz.anncorp.smeta.feature.foto.FotoRazdel
import uz.anncorp.smeta.feature.foto.fotoGuruhla
import uz.anncorp.smeta.feature.foto.fotoIzohi
import uz.anncorp.smeta.feature.foto.fotoPath
import uz.anncorp.smeta.feature.foto.manbaNomi
import uz.anncorp.smeta.feature.foto.oyOraligi
import uz.anncorp.smeta.feature.foto.parseFotoRoyxat

/*
 * Foto-dalil on Windows = the site's FotoLenta page (frontend/src/admin/sahifalar/FotoLenta.tsx): the filters card (Oy, Razdel, Sana / Razdel bo'yicha), the upload card
 * (FotoDalil), the feed grouped by date or section with thumbnails and "Jami: n". Same texts (SiteI18n keys). Foto-hisobot (Excel / PDF, paid token) is NOT ported yet.
 */

@Composable
fun FotoScreen(c: Ctx) {
    val o: Obj = c.obj ?: run { uz.anncorp.qurai.ui.components.QHint("Yuqoridan obyektni tanlang"); return }
    val lang = DesktopPrefs.lang
    fun tx(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    var bump by remember { mutableStateOf(0) }
    var oy by remember(o.id) { mutableStateOf("") }
    var razdel by remember(o.id) { mutableStateOf<FotoRazdel?>(null) }
    var rejimSana by remember(o.id) { mutableStateOf(true) }
    val range = oyOraligi(oy)
    val data = load(o.id, "${c.tick}|$bump|$oy|${razdel?.razdelId}") {
        c.sv.read("foto:${o.id}:$oy:${razdel?.razdelId}", { c.sv.api.bff(fotoPath(c.place.companyId, o.id, razdel?.razdelId, range?.first, range?.second)) }, ::parseFotoRoyxat)
    }
    Page(tx("Foto-dalil"), tx("Obyekt fotolari: sana va razdel bo‘yicha lenta, foto-hisobot")) {
        Row(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
            QInput(oy, { oy = it }, Modifier.width(150.dp), label = tx("Oy"), placeholder = "YYYY-MM")
            val razdellar = data.valueOrNull()?.razdellar.orEmpty().filter { it.razdelId != null }
            QSelect(razdel, razdellar, { "${it.nom ?: ""} (${it.soni})" }, { razdel = it }, placeholder = tx("Hammasi"), minWidth = 200)
            if (razdel != null) QButton(tx("Hammasi"), { razdel = null }, kind = QButtonKind.Ghost)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                QButton(tx("Sana bo‘yicha"), { rejimSana = true }, kind = if (rejimSana) QButtonKind.Primary else QButtonKind.Secondary)
                QButton(tx("Razdel bo‘yicha"), { rejimSana = false }, kind = if (!rejimSana) QButtonKind.Primary else QButtonKind.Secondary)
            }
        }
        Column(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(12.dp)) { UploadBar(c, o.id) { bump++ } }
        if (data == null) { QLoading(); return@Page }
        data.Banner()
        val d = data.valueOrNull() ?: return@Page
        Text(tx("Jami") + ": " + d.jami, style = Q.type.bodySmall, color = Q.colors.textDim)
        val guruhlar = remember(d, rejimSana) { fotoGuruhla(d.fotolar, rejimSana) }
        if (guruhlar.isEmpty()) { Text(tx("Bu davrda foto yo‘q"), style = Q.type.bodySmall, color = Q.colors.textDim); return@Page }
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(guruhlar, key = { it.kalit }) { g ->
                Column(Modifier.fillMaxWidth().background(Q.colors.surface, Q.shape.medium).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${g.sarlavha} (${g.fotolar.size})", style = Q.type.titleSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        g.fotolar.forEach { f ->
                            Column(Modifier.width(156.dp)) {
                                Thumb(c, f.documentId)
                                Text((if (rejimSana) (f.razdelNom?.takeIf { it.isNotEmpty() } ?: "—") else f.sana) + " · " + manbaNomi(f.manbaTuri), style = Q.type.labelSmall, color = Q.colors.textDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                fotoIzohi(f).takeIf { it.isNotEmpty() }?.let { Text(it, style = Q.type.labelSmall, color = Q.colors.textMute, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A thumbnail: the same canonical download as every document (/api/hujjat-ol), decoded lazily; an unreadable file shows an empty frame, never an error page. */
@Composable
private fun Thumb(c: Ctx, documentId: Long) {
    val bmp by produceState<ImageBitmap?>(null, documentId) {
        value = runCatching {
            val r = c.sv.api.bffBytes(docPath(documentId), DOC_MAX_BYTES)
            if (r.ok && r.bytes != null) org.jetbrains.skia.Image.makeFromEncoded(r.bytes!!).toComposeImageBitmap() else null
        }.getOrNull()
    }
    Box(Modifier.size(156.dp).background(Q.colors.surface3, Q.shape.small), contentAlignment = Alignment.Center) {
        bmp?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
    }
}
