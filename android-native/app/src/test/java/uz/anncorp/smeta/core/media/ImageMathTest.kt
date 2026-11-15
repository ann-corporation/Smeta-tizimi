package uz.anncorp.smeta.core.media

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageMathTest {
    @Test fun scaledSizeStaysUnderTwoMegapixelsAndKeepsAspect() {
        val (w, h) = ImageMath.scaledSize(4000, 3000)
        assertTrue(w.toLong() * h <= ImageMath.MAX_PIXELS)
        assertEquals(4.0 / 3.0, w.toDouble() / h, 0.01)
        val (pw, ph) = ImageMath.scaledSize(3000, 4000)
        assertTrue(pw.toLong() * ph <= ImageMath.MAX_PIXELS); assertTrue(ph > pw)
    }

    @Test fun smallImagesAreNeverUpscaled() {
        assertEquals(800 to 600, ImageMath.scaledSize(800, 600))
        assertEquals(1000 to 2000, ImageMath.scaledSize(1000, 2000))      // exactly 2 MP
    }

    @Test fun sampleSizeKeepsAtLeastTargetPixels() {
        assertEquals(1, ImageMath.sampleSize(1600, 1200))
        val s = ImageMath.sampleSize(8000, 6000)
        assertTrue(s >= 2)
        assertTrue(8000L * 6000 / (s.toLong() * s) >= ImageMath.MAX_PIXELS)   // never decodes below the target
        assertTrue(s and (s - 1) == 0)                                         // power of two
    }

    @Test fun orientationMapsToClockwiseDegrees() {
        assertEquals(0, ImageMath.rotationFor(1)); assertEquals(180, ImageMath.rotationFor(3))
        assertEquals(90, ImageMath.rotationFor(6)); assertEquals(270, ImageMath.rotationFor(8)); assertEquals(0, ImageMath.rotationFor(0))
    }

    @Test fun sha256KnownVectors() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", ImageMath.sha256Hex(ByteArray(0)))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ImageMath.sha256Hex("abc".toByteArray()))
    }

    private fun seg(marker: Int, payload: ByteArray): ByteArray {
        val len = payload.size + 2
        return byteArrayOf(0xFF.toByte(), marker.toByte(), (len shr 8).toByte(), (len and 0xFF).toByte()) + payload
    }

    @Test fun stripRemovesExifAndIptcButKeepsImageAndOtherSegments() {
        val soi = byteArrayOf(0xFF.toByte(), 0xD8.toByte())
        val jfif = seg(0xE0, "JFIF\u0000".toByteArray() + ByteArray(9) { 1 })
        val exif = seg(0xE1, "Exif\u0000\u0000".toByteArray() + "GPSLatitude=41.3,GPSLongitude=69.2,Serial=ABC123".toByteArray())
        val icc = seg(0xE2, "ICC_PROFILE\u0000".toByteArray() + ByteArray(6) { 2 })
        val iptc = seg(0xED, "Photoshop 3.0\u0000".toByteArray() + "owner".toByteArray())
        val dqt = seg(0xDB, ByteArray(65) { 3 })
        // entropy-coded data may legally contain FF E1 byte pairs after a stuffed zero is NOT used; they must be copied verbatim
        val scanData = byteArrayOf(0x10, 0xFF.toByte(), 0xE1.toByte(), 0x55, 0xFF.toByte(), 0x00, 0x20)
        val sos = seg(0xDA, ByteArray(10) { 4 })
        val eoi = byteArrayOf(0xFF.toByte(), 0xD9.toByte())
        val src = soi + jfif + exif + icc + iptc + dqt + sos + scanData + eoi
        val out = JpegExif.strip(src)
        assertArrayEquals(soi + jfif + icc + dqt + sos + scanData + eoi, out)
        assertFalse(String(out, Charsets.ISO_8859_1).contains("GPSLatitude"))
        assertFalse(String(out, Charsets.ISO_8859_1).contains("owner"))
    }

    @Test fun stripLeavesCleanFilesAndNonJpegUntouched() {
        val clean = byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + seg(0xDB, ByteArray(65)) + seg(0xDA, ByteArray(10)) + byteArrayOf(1, 2, 3, 0xFF.toByte(), 0xD9.toByte())
        assertArrayEquals(clean, JpegExif.strip(clean))
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 1, 2, 3, 4)
        assertArrayEquals(png, JpegExif.strip(png))
        assertTrue(JpegExif.isJpeg(clean)); assertFalse(JpegExif.isJpeg(png))
    }

    @Test fun stripSurvivesTruncatedSegments() {
        val broken = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE1.toByte(), 0x7F, 0xFF.toByte(), 1, 2)   // declared length beyond the end
        assertArrayEquals(broken, JpegExif.strip(broken))
    }
}
