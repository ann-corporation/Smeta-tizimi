package uz.anncorp.smeta.feature.web

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

sealed interface WebState {
    data object Loading : WebState
    data class Ready(val url: String) : WebState
    /** The server does not offer a ticket (older server) or the network failed: show the "open on the website" fallback. */
    data class Unavailable(val offline: Boolean) : WebState
}

/** Only https pages of the QURAI website itself may load inside the in-app WebView; everything else goes to the system browser. */
internal fun isOwnHost(url: String, baseUrl: String = BuildConfig.API_BASE_URL): Boolean {
    val u = runCatching { Uri.parse(url) }.getOrNull() ?: return false
    val b = Uri.parse(baseUrl)
    return u.scheme == "https" && u.host != null && u.host == b.host
}

@HiltViewModel
class WebModuleViewModel @Inject constructor(private val api: BffApi, handle: SavedStateHandle) : ViewModel() {
    val path: String = handle.get<String>("path").orEmpty()
    private val _state = MutableStateFlow<WebState>(WebState.Loading)
    val state: StateFlow<WebState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = WebState.Loading
        viewModelScope.launch {
            val r = api.webTicket(path)
            val url = ((r.body as? JsonObject)?.get("url"))?.jsonPrimitive?.content
            _state.value = if (r.ok && url != null && isOwnHost(url)) WebState.Ready(url) else WebState.Unavailable(offline = r.networkError)
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebModuleScreen(title: String, onBack: () -> Unit, vm: WebModuleViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var web by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableStateOf(0) }

    // The web session cookie lives only as long as this screen: wipe everything on the way out.
    DisposableEffect(Unit) {
        onDispose {
            web?.apply { stopLoading(); clearHistory(); clearCache(true); destroy() }
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
            WebStorage.getInstance().deleteAllData()
        }
    }
    BackHandler(enabled = web?.canGoBack() == true) { web?.goBack() }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            WorkTopBar(title.ifBlank { stringResource(R.string.hub_web_title) }, onBack)
            if (state is WebState.Ready && progress in 1..99) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
            when (val s = state) {
                WebState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                is WebState.Unavailable -> CenterMessage(
                    Icons.Filled.Warning,
                    stringResource(if (s.offline) R.string.p1_objects_offline_empty else R.string.hub_web_soon),
                    stringResource(if (s.offline) R.string.err_network else R.string.hub_web_soon_hint),
                    stringResource(if (s.offline) R.string.retry else R.string.hub_web_open_browser),
                ) {
                    if (s.offline) vm.load()
                    else runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.API_BASE_URL.trimEnd('/') + vm.path)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
                is WebState.Ready -> AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        WebView(ctx).also { w ->
                            CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(w, false) }
                            w.settings.apply {
                                javaScriptEnabled = true; domStorageEnabled = true
                                allowFileAccess = false; allowContentAccess = false
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                setSupportMultipleWindows(false); javaScriptCanOpenWindowsAutomatically = false
                                @Suppress("DEPRECATION") run { allowFileAccessFromFileURLs = false; allowUniversalAccessFromFileURLs = false }
                            }
                            w.webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                    val url = request.url.toString()
                                    if (isOwnHost(url)) return false
                                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                                    return true
                                }
                                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) { progress = 10 }
                                override fun onPageFinished(view: WebView, url: String?) { progress = 100 }
                            }
                            web = w
                            w.loadUrl(s.url)
                        }
                    },
                )
            }
        }
    }
}
