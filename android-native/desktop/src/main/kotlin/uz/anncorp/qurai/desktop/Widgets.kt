package uz.anncorp.qurai.desktop

import uz.anncorp.smeta.core.data.Loaded
import uz.anncorp.smeta.feature.common.*

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.loadImageBitmap
import uz.anncorp.qurai.ui.components.QError
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.smeta.core.data.formatMoney
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Shared Uzbek (Latin) strings of the desktop app. */
object Tx {
    const val off = "Oflayn: oxirgi saqlangan nusxa"
    const val forbidden = "Bu bo'limni ko'rishga ruxsat yo'q"
    const val nodata = "Ma'lumot yo'q (oflayn va nusxa saqlanmagan)"
    const val offlineWrite = "Oflayn: yozib bo'lmaydi, tarmoqqa ulanib qayta urinib ko'ring"
    const val dash = "\u2014"
}

fun stamp(ms: Long): String = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(ms))

/** Money with a space-grouped integer part; unknown (null) is a dash, never 0. */
fun money(v: Double?): String = if (v == null) Tx.dash else formatMoney(v, 2)

/** Plain number for a quantity (up to 3 decimals, comma decimal). */
fun qty(v: Double?): String = if (v == null) Tx.dash else uz.anncorp.smeta.core.data.formatVolume(v)

/** Offline / forbidden / failed banner of a [Loaded] read (design-system notes, same wording as the other apps). */
@Composable
fun <T> Loaded<T>.Banner() {
    when (this) {
        is Loaded.Offline<*> -> QNote("${Tx.off} (${stamp(savedAt)})", tone = QTone.Warn)
        Loaded.Forbidden -> QError(Tx.forbidden)
        Loaded.NoData -> QError(Tx.nodata)
        is Loaded.Failed -> QError("Xato: $code")
        is Loaded.Fresh<*> -> {}
    }
}

/** The data of a fresh or offline read; null when there is nothing to show. */
fun <T> Loaded<T>?.valueOrNull(): T? = when (this) { is Loaded.Fresh -> data; is Loaded.Offline -> data; else -> null }

@Composable
fun Fill(content: @Composable () -> Unit) = Box(androidx.compose.ui.Modifier.fillMaxSize()) { content() }
/** The QURAI mark (same artwork as the window and the website favicon). */
@Composable
fun BrandMark(size: Int) = androidx.compose.foundation.Image(androidx.compose.ui.graphics.painter.BitmapPainter(androidx.compose.ui.res.useResource("qurai-icon.png", ::loadImageBitmap)), null, androidx.compose.ui.Modifier.size(size.dp))
