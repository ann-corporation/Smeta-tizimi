package uz.anncorp.smeta.core.media

import java.io.ByteArrayOutputStream
import java.security.MessageDigest

/** Pure (JVM-testable) parts of the photo pipeline: sizing, EXIF orientation, metadata stripping, hashing. */
object ImageMath {
    /** Upload ceiling: about 2 megapixels, JPEG quality 85. */
    const val MAX_PIXELS = 2_000_000
    const val JPEG_QUALITY = 85

    /** Target size with the aspect ratio kept so that width*height <= [maxPixels]. Never upscales. */
    fun scaledSize(width: Int, height: Int, maxPixels: Int = MAX_PIXELS): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return width to height
        val px = width.toLong() * height
        if (px <= maxPixels) return width to height
        val f = Math.sqrt(maxPixels.toDouble() / px)
        var w = Math.floor(width * f).toInt().coerceAtLeast(1)
        var h = Math.floor(height * f).toInt().coerceAtLeast(1)
        while (w.toLong() * h > maxPixels && w > 1 && h > 1) { w--; h = Math.floor(w.toDouble() * height / width).toInt().coerceAtLeast(1) }
        return w to h
    }

    /** Power-of-two decode sample size that keeps the decoded bitmap at least [maxPixels] big (final exact resize follows). */
    fun sampleSize(width: Int, height: Int, maxPixels: Int = MAX_PIXELS): Int {
        var s = 1
        while (width.toLong() * height / ((s * 2L) * (s * 2L)) >= maxPixels) s *= 2
        return s
    }

    /** EXIF orientation tag value -> clockwise degrees to apply to the decoded pixels. Mirrored variants are not produced by cameras. */
    fun rotationFor(orientation: Int): Int = when (orientation) { 3, 4 -> 180; 6, 5 -> 90; 8, 7 -> 270; else -> 0 }

    fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

/**
 * Removes the metadata segments that can identify a person or a place: APP1 (EXIF with GPS/serial numbers, XMP) and
 * APP13 (IPTC/Photoshop). JFIF (APP0), ICC colour profile (APP2) and the image data are kept. A re-encoded bitmap carries no
 * EXIF in the first place; this is a second, independently tested guarantee on the bytes that are actually uploaded.
 */
object JpegExif {
    private const val SOI = 0xD8; private const val EOI = 0xD9; private const val SOS = 0xDA
    private const val APP1 = 0xE1; private const val APP13 = 0xED

    fun isJpeg(b: ByteArray) = b.size > 3 && (b[0].toInt() and 0xFF) == 0xFF && (b[1].toInt() and 0xFF) == SOI

    fun strip(jpeg: ByteArray): ByteArray {
        if (!isJpeg(jpeg)) return jpeg
        val out = ByteArrayOutputStream(jpeg.size)
        out.write(jpeg, 0, 2)
        var i = 2
        while (i < jpeg.size) {
            if ((jpeg[i].toInt() and 0xFF) != 0xFF) { out.write(jpeg, i, jpeg.size - i); break }   // not a marker: copy the remainder verbatim
            var j = i
            while (j < jpeg.size && (jpeg[j].toInt() and 0xFF) == 0xFF) j++                         // fill bytes
            if (j >= jpeg.size) { out.write(jpeg, i, jpeg.size - i); break }
            val marker = jpeg[j].toInt() and 0xFF
            if (marker == SOS || marker == EOI) { out.write(jpeg, i, jpeg.size - i); break }        // image data follows: copy the rest
            if (marker == 0x01 || marker in 0xD0..0xD7) { out.write(jpeg, i, j + 1 - i); i = j + 1; continue }   // standalone markers
            if (j + 2 >= jpeg.size) { out.write(jpeg, i, jpeg.size - i); break }
            val len = ((jpeg[j + 1].toInt() and 0xFF) shl 8) or (jpeg[j + 2].toInt() and 0xFF)
            val end = j + 1 + len
            if (len < 2 || end > jpeg.size) { out.write(jpeg, i, jpeg.size - i); break }
            if (marker != APP1 && marker != APP13) out.write(jpeg, i, end - i)
            i = end
        }
        return out.toByteArray()
    }
}
