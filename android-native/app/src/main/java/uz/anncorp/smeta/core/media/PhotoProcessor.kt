package uz.anncorp.smeta.core.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** A photo ready for the outbox: re-encoded JPEG (no EXIF), its hash and the optional position taken from the source EXIF. */
class ProcessedPhoto(val jpeg: ByteArray, val width: Int, val height: Int, val sha256: String, val lat: Double?, val lng: Double?)

/**
 * Camera or gallery image -> upload-ready JPEG: orientation applied to the pixels, downscaled to <= 2 MP, quality 85,
 * all metadata dropped (re-encoding writes none, [JpegExif.strip] re-checks). The position stored in the SOURCE (if any) is only
 * reported in [ProcessedPhoto.lat]/[ProcessedPhoto.lng]; the caller attaches it ONLY after an explicit user toggle, and then as
 * separate fields, never inside the file. The app requests no location permission.
 */
class PhotoProcessor(private val context: Context) {
    suspend fun process(uri: Uri): ProcessedPhoto? = withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return@withContext null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
        val opts = BitmapFactory.Options().apply { inSampleSize = ImageMath.sampleSize(bounds.outWidth, bounds.outHeight) }
        val decoded = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return@withContext null

        var orientation = ExifInterface.ORIENTATION_NORMAL
        var lat: Double? = null; var lng: Double? = null
        runCatching {
            cr.openInputStream(uri)?.use { s ->
                val exif = ExifInterface(s)
                orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
                val ll = FloatArray(2); if (exif.getLatLong(ll)) { lat = ll[0].toDouble(); lng = ll[1].toDouble() }
            }
        }

        val rot = ImageMath.rotationFor(orientation)
        val (tw, th) = ImageMath.scaledSize(if (rot % 180 == 0) decoded.width else decoded.height, if (rot % 180 == 0) decoded.height else decoded.width)
        val m = Matrix().apply {
            if (rot != 0) postRotate(rot.toFloat())
            val rw = if (rot % 180 == 0) decoded.width else decoded.height
            if (rw > 0 && tw != rw) { val s = tw.toFloat() / rw; postScale(s, s) }
        }
        val out = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true)
        if (out !== decoded) decoded.recycle()
        val buf = ByteArrayOutputStream()
        out.compress(Bitmap.CompressFormat.JPEG, ImageMath.JPEG_QUALITY, buf)
        val w = out.width; val h = out.height
        out.recycle()
        val clean = JpegExif.strip(buf.toByteArray())
        ProcessedPhoto(clean, w, h, ImageMath.sha256Hex(clean), lat, lng)
    }
}
