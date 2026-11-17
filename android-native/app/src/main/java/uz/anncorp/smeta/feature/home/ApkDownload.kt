package uz.anncorp.smeta.feature.home

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.widget.Toast
import uz.anncorp.smeta.R

/**
 * App update: the APK is downloaded by the system DownloadManager (notification + Downloads folder; tapping the finished notification opens the installer),
 * so the person never leaves the app for a browser. The link is public (same host as the API), no cookie is sent.
 */
fun startApkDownload(context: Context, url: String) {
    runCatching {
        val name = Uri.parse(url).lastPathSegment?.takeIf { it.endsWith(".apk") } ?: "qurai.apk"
        val req = DownloadManager.Request(Uri.parse(url)).setTitle(name)
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        context.getSystemService(DownloadManager::class.java).enqueue(req)
        Toast.makeText(context, R.string.web_download_started, Toast.LENGTH_SHORT).show()
    }.onFailure { Toast.makeText(context, R.string.web_download_failed, Toast.LENGTH_SHORT).show() }
}
