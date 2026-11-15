package uz.anncorp.smeta.feature.docs

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import uz.anncorp.smeta.core.data.safeFileName
import java.io.File
import java.util.UUID

/**
 * Hand-off of an already authorised document to other apps. No storage permission is needed: files are staged in the app cache and
 * exposed through a FileProvider URI with a one-off read grant. Staged (decrypted) copies are removed when the viewer closes and on every app start.
 */
object DocFiles {
    private const val SHARED = "shared"
    private const val VIEW = "view"

    private fun dir(context: Context, name: String) = File(context.cacheDir, name).apply { mkdirs() }

    /** Writes [bytes] under a safe file name (kept, so the receiving app shows the real name) and returns the file. */
    fun stage(context: Context, name: String, bytes: ByteArray): File {
        val d = File(dir(context, SHARED), UUID.randomUUID().toString().take(8)).apply { mkdirs() }
        return File(d, safeFileName(name, "hujjat")).also { it.writeBytes(bytes) }
    }

    fun uriOf(context: Context, file: File) = FileProvider.getUriForFile(context, context.packageName + ".files", file)

    fun share(context: Context, name: String, mime: String, bytes: ByteArray) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime.ifBlank { "application/octet-stream" }
            putExtra(Intent.EXTRA_STREAM, uriOf(context, stage(context, name, bytes)))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }

    /** Opens the file in another installed app. False when no app can show it. */
    fun openWith(context: Context, name: String, mime: String, bytes: ByteArray): Boolean {
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uriOf(context, stage(context, name, bytes)), mime.ifBlank { "application/octet-stream" })
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try { context.startActivity(Intent.createChooser(view, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); true } catch (e: ActivityNotFoundException) { false }
    }

    fun viewFile(context: Context): File = File(dir(context, VIEW), UUID.randomUUID().toString().take(8) + ".pdf")

    /** Removes every staged plain copy (app start / viewer close). */
    fun cleanup(context: Context) {
        File(context.cacheDir, SHARED).deleteRecursively()
        File(context.cacheDir, VIEW).deleteRecursively()
    }
}

/** Page renderer over the framework [PdfRenderer] (one open page at a time, so renders are serialised). Close it when the viewer leaves. */
class PdfDoc private constructor(private val fd: ParcelFileDescriptor, private val renderer: PdfRenderer) {
    private val lock = Mutex()
    val pageCount: Int = renderer.pageCount

    /** Renders page [index] at [widthPx] wide on a white background. */
    suspend fun render(index: Int, widthPx: Int): Bitmap? = lock.withLock {
        withContext(Dispatchers.Default) {
            runCatching {
                renderer.openPage(index).use { page ->
                    val w = widthPx.coerceIn(200, 1800)
                    val h = (w.toFloat() * page.height / page.width).toInt().coerceAtLeast(1)
                    Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { bmp ->
                        bmp.eraseColor(Color.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    }
                }
            }.getOrNull()
        }
    }

    fun close() { runCatching { renderer.close() }; runCatching { fd.close() } }

    companion object {
        /** Null when the bytes are not a readable PDF (corrupt or password protected). */
        suspend fun open(context: Context, bytes: ByteArray): PdfDoc? = withContext(Dispatchers.IO) {
            val f = DocFiles.viewFile(context)
            try {
                f.writeBytes(bytes)
                val fd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
                try { PdfDoc(fd, PdfRenderer(fd)) } catch (e: Exception) { fd.close(); null }
            } catch (e: Exception) {
                null
            } finally {
                // The renderer keeps its own descriptor: the plain copy on disk is not needed any more.
                f.delete()
            }
        }
    }
}
