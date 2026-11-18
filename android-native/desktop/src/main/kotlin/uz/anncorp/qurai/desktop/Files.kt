package uz.anncorp.qurai.desktop

import uz.anncorp.smeta.core.data.safeFileName
import java.awt.Desktop
import java.io.File

/** Where downloaded documents go: Documents\QURAI (created on demand). */
fun downloadsDir(): File = File(System.getProperty("user.home"), "Documents\\QURAI").also { it.mkdirs() }

/** Saves [bytes] under a safe file name (never overwrites: a counter is added) and opens it with the default Windows program. Returns the saved file. */
fun saveAndOpen(name: String, bytes: ByteArray, open: Boolean = true): File {
    val clean = safeFileName(name, "hujjat")
    val dot = clean.lastIndexOf('.')
    val base = if (dot > 0) clean.substring(0, dot) else clean
    val ext = if (dot > 0) clean.substring(dot) else ""
    val dir = downloadsDir()
    var f = File(dir, clean); var i = 1
    while (f.exists()) { f = File(dir, "$base ($i)$ext"); i++ }
    f.writeBytes(bytes)
    Log.i("saved ${f.name} size=${bytes.size}")
    if (open) openFile(f)
    return f
}

fun openFile(f: File) { runCatching { if (Desktop.isDesktopSupported()) Desktop.getDesktop().open(f) }.onFailure { Log.i("open failed ${it::class.simpleName}") } }

/** Native Windows "open file" dialog; null when cancelled. */
fun pickFile(title: String, imagesOnly: Boolean = false): File? {
    val d = java.awt.FileDialog(null as java.awt.Frame?, title, java.awt.FileDialog.LOAD)
    if (imagesOnly) d.setFilenameFilter { _, n -> n.lowercase().let { it.endsWith(".jpg") || it.endsWith(".jpeg") || it.endsWith(".png") || it.endsWith(".webp") } }
    d.isVisible = true
    val n = d.file ?: return null
    return File(d.directory, n)
}