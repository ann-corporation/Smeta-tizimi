package uz.anncorp.smeta.feature.web

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.anncorp.smeta.core.ui.WorkTopBar

/** http -> https (cleartext is off in the manifest); anything that is not a plain web link yields null. */
internal fun foreignWebUrl(url: String): String? {
    val u = url.trim()
    return when {
        u.startsWith("https://", true) -> u
        u.startsWith("http://", true) -> "https://" + u.substring(7)
        else -> null
    }
}

/**
 * Other websites (links inside a QURAI page) open here, inside the app, never in the external browser. A plain WebView: no JavaScript bridge,
 * no files, no app session (the web ticket cookie belongs to the QURAI host only and third-party cookies are off).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InAppBrowserDialog(url: String, onClose: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableIntStateOf(0) }
    var canGoBack by remember { mutableStateOf(false) }
    var host by remember { mutableStateOf(runCatching { java.net.URI(url).host }.getOrNull().orEmpty()) }
    DisposableEffect(Unit) { onDispose { web?.apply { stopLoading(); clearHistory(); removeAllViews(); destroy() } } }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BackHandler(enabled = canGoBack) { web?.goBack() }
            Column(Modifier.fillMaxSize()) {
                WorkTopBar(host, onClose)
                if (progress in 1..99) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        WebView(ctx).also { w ->
                            CookieManager.getInstance().setAcceptThirdPartyCookies(w, false)
                            w.settings.apply {
                                javaScriptEnabled = true; domStorageEnabled = true
                                allowFileAccess = false; allowContentAccess = false
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                setSupportMultipleWindows(false); builtInZoomControls = true; displayZoomControls = false
                            }
                            w.webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                    val s = request.url.toString()
                                    if (s.startsWith("https://", true)) return false
                                    foreignWebUrl(s)?.let { view.loadUrl(it) }
                                    return true
                                }
                                override fun onPageStarted(view: WebView, u: String?, favicon: Bitmap?) { progress = 10; u?.let { host = runCatching { java.net.URI(it).host }.getOrNull() ?: host } }
                                override fun onPageFinished(view: WebView, u: String?) { progress = 100; canGoBack = view.canGoBack() }
                            }
                            w.webChromeClient = object : android.webkit.WebChromeClient() { override fun onProgressChanged(view: WebView, p: Int) { progress = p } }
                            web = w
                            foreignWebUrl(url)?.let { w.loadUrl(it) }
                        }
                    },
                )
            }
        }
    }
}

