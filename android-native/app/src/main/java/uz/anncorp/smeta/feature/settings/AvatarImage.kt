package uz.anncorp.smeta.feature.settings

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.AvatarCrop
import uz.anncorp.smeta.core.data.ProfileRules
import uz.anncorp.smeta.core.media.ImageMath
import java.io.ByteArrayOutputStream

/** Decodes the picked image (downsampled, EXIF orientation applied) for cropping. Null when it is not a readable image. */
suspend fun decodeForCrop(context: Context, uri: Uri): Bitmap? = withContext(Dispatchers.IO) {
    runCatching {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
        val opts = BitmapFactory.Options().apply { inSampleSize = AvatarCrop.sampleSize(bounds.outWidth, bounds.outHeight) }
        val decoded = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return@runCatching null
        var orientation = ExifInterface.ORIENTATION_NORMAL
        runCatching { cr.openInputStream(uri)?.use { orientation = ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } }
        val rot = ImageMath.rotationFor(orientation)
        if (rot == 0) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, Matrix().apply { postRotate(rot.toFloat()) }, true).also { if (it !== decoded) decoded.recycle() }
    }.getOrNull()
}

/** The chosen square -> <= 512 px JPEG (quality 85; no metadata is written by re-encoding). */
fun renderAvatar(bitmap: Bitmap, src: AvatarCrop.Src): ByteArray {
    val square = Bitmap.createBitmap(bitmap, src.left, src.top, src.size, src.size)
    val out = if (square.width > ProfileRules.AVATAR_SIDE) Bitmap.createScaledBitmap(square, ProfileRules.AVATAR_SIDE, ProfileRules.AVATAR_SIDE, true) else square
    val buf = ByteArrayOutputStream()
    out.compress(Bitmap.CompressFormat.JPEG, 85, buf)
    return buf.toByteArray()
}

/** Round avatar: the photo, or the initials on the user's colour (fallback: theme primary). */
@Composable
fun AvatarCircle(bytes: ByteArray?, name: String, size: Dp, colorHex: String? = null, modifier: Modifier = Modifier) {
    val image: ImageBitmap? = remember(bytes) { bytes?.let { runCatching { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }.getOrNull() } }
    val tint = remember(colorHex) { runCatching { Color(android.graphics.Color.parseColor(colorHex)) }.getOrNull() } ?: MaterialTheme.colorScheme.primary
    Box(modifier.size(size).clip(CircleShape).background(tint), contentAlignment = Alignment.Center) {
        if (image != null) androidx.compose.foundation.Image(image, null, Modifier.size(size), contentScale = ContentScale.Crop)
        else Text(ProfileRules.initials(name), color = Color.White, fontWeight = FontWeight.SemiBold, style = if (size >= 80.dp) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleMedium)
    }
}

/** Pan / pinch / slider crop of a square avatar. Decoding runs once; the result is already <= 512 px. */
@Composable
fun AvatarCropDialog(uri: Uri, onCancel: () -> Unit, onUnreadable: () -> Unit, onDone: (ByteArray) -> Unit) {
    val ctx = LocalContext.current
    var bmp by remember(uri) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(uri) { val b = decodeForCrop(ctx, uri); if (b == null) onUnreadable() else bmp = b }
    val b = bmp ?: return
    val viewDp = 260.dp
    val view = with(LocalDensity.current) { viewDp.toPx() }
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    val image = remember(b) { b.asImageBitmap() }
    val ring = MaterialTheme.colorScheme.primary
    fun clampPan(p: Offset, z: Float): Offset {
        val scale = AvatarCrop.coverScale(b.width, b.height, view) * z
        val mx = AvatarCrop.maxPan(b.width, scale, view); val my = AvatarCrop.maxPan(b.height, scale, view)
        return Offset(p.x.coerceIn(-mx, mx), p.y.coerceIn(-my, my))
    }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.p10_crop_title)) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Canvas(
                    Modifier.size(viewDp).clip(MaterialTheme.shapes.medium).pointerInput(b) {
                        detectTransformGestures { _, change, zc, _ ->
                            zoom = (zoom * zc).coerceIn(1f, AvatarCrop.MAX_ZOOM)
                            pan = clampPan(pan + change, zoom)
                        }
                    },
                ) {
                    val s = AvatarCrop.source(b.width, b.height, view, zoom, pan.x, pan.y)
                    drawImage(image, IntOffset(s.left, s.top), IntSize(s.size, s.size), IntOffset.Zero, IntSize(size.width.toInt(), size.height.toInt()))
                    drawCircle(ring, radius = size.minDimension / 2f - 2f, style = Stroke(width = 4f))
                }
                Spacer(Modifier.height(8.dp))
                Slider(zoom, { zoom = it; pan = clampPan(pan, it) }, valueRange = 1f..AvatarCrop.MAX_ZOOM, modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.p10_crop_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(onClick = { onDone(renderAvatar(b, AvatarCrop.source(b.width, b.height, view, zoom, pan.x, pan.y))) }) { Text(stringResource(R.string.p10_save)) } },
        dismissButton = { TextButton(onClick = onCancel) { Text(stringResource(R.string.p10_cancel)) } },
    )
}
