package uz.anncorp.smeta.feature.web

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.URLUtil
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONObject
import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ConnectivityMonitor
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.embedPath
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.docs.DocFiles
import java.io.File
import java.util.UUID
import javax.inject.Inject

sealed interface WebState {
    data object Loading : WebState
    data class Ready(val url: String) : WebState
    /** The server does not offer a ticket (older server) or the network failed: show the "open on the website" fallback. */
    data class Unavailable(val offline: Boolean) : WebState
}

/**
 * In-app web container for every page the app has no native screen for. The page opens already signed in: the app asks the server for a
 * one-time ticket (/api/mobil/web-bilet, device-bound) and the WebView exchanges it for a short web cookie (/api/mobil/web-kirish), so there
 * is no second login. The website knows it is embedded (User-Agent QURAIApp + `app=android`) and hides its own sidebar and top bar.
 */
@HiltViewModel
class WebModuleViewModel @Inject constructor(
    private val api: BffApi, private val work: WorkContext, connectivity: ConnectivityMonitor, handle: SavedStateHandle,
) : ViewModel() {
    val path: String = handle.get<String>("path").orEmpty()
    private val _state = MutableStateFlow<WebState>(WebState.Loading)
    val state: StateFlow<WebState> = _state.asStateFlow()
    val online: StateFlow<Boolean> = connectivity.online.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)
    private var dark = false
    private var started = false
    private var lastOffline = false

    /** True once a WebView consumed the one-time ticket: a recreated view (rotation) must ask for a new one instead of replaying it. */
    @Volatile var ticketUsed = false
    @Volatile var lastUrl: String? = null

    private val companyId: Long? get() = work.current.value?.companyId
    private fun startPath() = embedPath(path, companyId, dark)

    fun start(dark: Boolean) { if (started) return; started = true; this.dark = dark; load() }

    fun load() {
        _state.value = WebState.Loading
        viewModelScope.launch {
            val url = ticket(startPath())
            _state.value = if (url != null) WebState.Ready(url) else WebState.Unavailable(offline = lastOffline)
        }
    }

    private suspend fun ticket(webPath: String): String? {
        val r = api.webTicket(webPath)
        lastOffline = r.networkError
        val url = ((r.body as? JsonObject)?.get("url"))?.jsonPrimitive?.content
        return url?.takeIf { r.ok && isOwnHost(it) }
    }

    /** Fresh one-time URL for the page the user is on (silent re-sign-in after the web session ended); null when the server/network refuses. */
    suspend fun renewUrl(currentUrl: String?): String? = ticket(ticketPathFor(currentUrl ?: lastUrl, startPath(), companyId, dark))
}

private const val MAX_BLOB_BYTES = 25L * 1024 * 1024
/** Remembers the name a page gives to a programmatic `<a download>` click (blob URLs carry no name). */
private const val HOOK_JS = "(function(){if(window.__qHook)return;window.__qHook=1;var c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){try{if(this.download)window.__qName=this.download}catch(e){}return c.apply(this,arguments)}})()"

private fun blobScript(url: String): String =
    "(function(u){var n=window.__qName||'';window.__qName='';fetch(u).then(function(r){return r.blob()}).then(function(b){if(b.size>$MAX_BLOB_BYTES){QuraiBridge.fail();return}" +
        "var f=new FileReader();f.onloadend=function(){var s=String(f.result);QuraiBridge.save(n,b.type||'',s.substring(s.indexOf(',')+1))};f.readAsDataURL(b)}).catch(function(){QuraiBridge.fail()})})(${JSONObject.quote(url)})"

/** Blob downloads (files the page builds in the browser: exports, generated documents) reach the app through this one narrow bridge; only own-origin pages may use it. */
private class QuraiBridge(private val context: Context, private val ownPage: () -> Boolean) {
    private val main = Handler(Looper.getMainLooper())
    private fun toast() { main.post { Toast.makeText(context, R.string.web_download_failed, Toast.LENGTH_SHORT).show() } }

    @JavascriptInterface fun fail() { if (ownPage()) toast() }

    @JavascriptInterface fun save(name: String?, mime: String?, b64: String?) {
        if (!ownPage() || b64.isNullOrEmpty()) { toast(); return }
        val bytes = runCatching { Base64.decode(b64, Base64.DEFAULT) }.getOrNull()
        if (bytes == null || bytes.size > MAX_BLOB_BYTES) { toast(); return }
        val m = mime.orEmpty()
        val n = blobFileName(name, m)
        main.post { runCatching { DocFiles.share(context, n, m, bytes) }.onFailure { toast() } }
    }
}

/** Downloads: own-origin https goes through the system DownloadManager (notification, Downloads folder, the web cookie is passed on); blob: through the bridge to the share sheet. */
private fun startDownload(context: Context, web: WebView, url: String, userAgent: String?, contentDisposition: String?, mime: String?) {
    when {
        url.startsWith("blob:") -> web.evaluateJavascript(blobScript(url), null)
        isOwnHost(url) -> runCatching {
            val name = URLUtil.guessFileName(url, contentDisposition, mime)
            val req = DownloadManager.Request(Uri.parse(url)).setTitle(name).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            mime?.takeIf { it.isNotBlank() }?.let { req.setMimeType(it) }
            CookieManager.getInstance().getCookie(url)?.let { req.addRequestHeader("Cookie", it) }
            userAgent?.let { req.addRequestHeader("User-Agent", it) }
            context.getSystemService(DownloadManager::class.java).enqueue(req)
            Toast.makeText(context, R.string.web_download_started, Toast.LENGTH_SHORT).show()
        }.onFailure { Toast.makeText(context, R.string.web_download_failed, Toast.LENGTH_SHORT).show() }
        navAction(url) == NavAction.EXTERNAL -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

private class ChooserState {
    var callback: ValueCallback<Array<Uri>>? = null
    var params: WebChromeClient.FileChooserParams? = null
    var cameraUri: Uri? = null
    var cameraFile: File? = null
}

/** Chosen files, or the camera photo when the user took one (the camera app returns no data); null = cancelled. */
private fun chooserResult(code: Int, data: Intent?, cameraFile: File?, cameraUri: Uri?): Array<Uri>? {
    if (code != Activity.RESULT_OK) return null
    WebChromeClient.FileChooserParams.parseResult(code, data)?.takeIf { it.isNotEmpty() }?.let { return it }
    return if (cameraUri != null && cameraFile != null && cameraFile.length() > 0) arrayOf(cameraUri) else null
}

private fun showJsDialog(context: Context, message: String?, result: JsResult, withCancel: Boolean) {
    val b = AlertDialog.Builder(context).setMessage(message).setCancelable(true)
        .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
        .setOnCancelListener { result.cancel() }
    if (withCancel) b.setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
    b.show()
}

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
@Composable
fun WebModuleScreen(title: String, onBack: () -> Unit, vm: WebModuleViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val online by vm.online.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val bg = MaterialTheme.colorScheme.background.toArgb()
    LaunchedEffect(Unit) { vm.start(dark) }

    var web by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var canGoBack by remember { mutableStateOf(false) }
    var pageError by remember { mutableStateOf(false) }
    var renewing by remember { mutableStateOf(false) }
    var lastRenew by remember { mutableLongStateOf(0L) }
    val ownPage = remember { java.util.concurrent.atomic.AtomicBoolean(false) }
    val chooser = remember { ChooserState() }

    // Silent re-sign-in (web session ended: the server answered 401 to the page's API call): one new ticket for the page the user is on.
    val renew: (String?) -> Unit = { current ->
        val now = SystemClock.elapsedRealtime()
        if (mayRenew(lastRenew, now)) {
            lastRenew = now; renewing = true
            scope.launch { vm.renewUrl(current)?.let { web?.loadUrl(it) }; renewing = false }
        }
    }

    val chooserLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val cb = chooser.callback; chooser.callback = null
        cb?.onReceiveValue(chooserResult(res.resultCode, res.data, chooser.cameraFile, chooser.cameraUri))
        chooser.cameraUri = null; chooser.cameraFile = null
    }
    fun launchChooser(params: WebChromeClient.FileChooserParams, withCamera: Boolean) {
        var camera: Intent? = null
        if (withCamera) {
            val f = File(File(context.cacheDir, "webup").apply { mkdirs() }, UUID.randomUUID().toString().take(8) + ".jpg")
            val uri = FileProvider.getUriForFile(context, context.packageName + ".files", f)
            chooser.cameraUri = uri; chooser.cameraFile = f
            camera = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val intent = if (params.isCaptureEnabled && camera != null) camera
        else Intent.createChooser(params.createIntent(), context.getString(R.string.web_upload_choose)).also { if (camera != null) it.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera)) }
        runCatching { chooserLauncher.launch(intent) }.onFailure { chooser.callback?.onReceiveValue(null); chooser.callback = null }
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val p = chooser.params
        if (p != null && chooser.callback != null) launchChooser(p, withCamera = granted)
    }

    // The web session cookie lives only as long as this screen: wipe everything on the way out.
    DisposableEffect(Unit) {
        onDispose {
            chooser.callback?.onReceiveValue(null); chooser.callback = null
            File(context.cacheDir, "webup").deleteRecursively()
            web?.apply { stopLoading(); clearHistory(); clearCache(true); removeJavascriptInterface("QuraiBridge"); destroy() }
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
            WebStorage.getInstance().deleteAllData()
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { web?.onPause() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { web?.onResume() }
    BackHandler(enabled = canGoBack && state is WebState.Ready) { web?.goBack() }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            WorkTopBar(title.ifBlank { stringResource(R.string.hub_web_title) }, onBack)
            if (state is WebState.Ready && (progress in 1..99 || renewing)) {
                if (renewing) LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) else LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
            }
            if (renewing) Text(stringResource(R.string.web_renewing), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
            if (!online && state is WebState.Ready) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.web_offline_banner), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                }
            }
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
                is WebState.Ready -> PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; web?.reload() }, modifier = Modifier.fillMaxSize()) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            WebView(ctx).also { w ->
                                w.setBackgroundColor(bg)
                                if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
                                CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(w, false) }
                                w.settings.apply {
                                    javaScriptEnabled = true; domStorageEnabled = true
                                    allowFileAccess = false; allowContentAccess = false
                                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                    setSupportMultipleWindows(false); javaScriptCanOpenWindowsAutomatically = false
                                    builtInZoomControls = true; displayZoomControls = false
                                    // The website recognises the container by this token (lib/app-embed.ts) and hides its own sidebar / top bar.
                                    userAgentString = userAgentString + " QURAIApp/" + BuildConfig.VERSION_NAME
                                    @Suppress("DEPRECATION") run { allowFileAccessFromFileURLs = false; allowUniversalAccessFromFileURLs = false }
                                }
                                w.addJavascriptInterface(QuraiBridge(ctx) { ownPage.get() }, "QuraiBridge")
                                w.setDownloadListener { url, ua, cd, mime, _ -> startDownload(ctx, w, url, ua, cd, mime) }
                                w.webChromeClient = object : WebChromeClient() {
                                    override fun onProgressChanged(view: WebView, newProgress: Int) { progress = newProgress }
                                    override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                                        chooser.callback?.onReceiveValue(null)
                                        chooser.callback = cb; chooser.params = params
                                        val wantsImage = params.acceptTypes.any { it.startsWith("image") } || params.isCaptureEnabled
                                        if (wantsImage && ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) cameraPermission.launch(Manifest.permission.CAMERA)
                                        else launchChooser(params, withCamera = wantsImage)
                                        return true
                                    }
                                    // confirm()/alert() are used by the website (e.g. delete confirmations): without these the WebView answers "cancel" silently.
                                    override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
                                        if (url == null || !isOwnHost(url)) { result.cancel(); return true }
                                        showJsDialog(ctx, message, result, withCancel = false); return true
                                    }
                                    override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
                                        if (url == null || !isOwnHost(url)) { result.cancel(); return true }
                                        showJsDialog(ctx, message, result, withCancel = true); return true
                                    }
                                }
                                w.webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                        val url = request.url.toString()
                                        when (navAction(url)) {
                                            NavAction.STAY -> return false
                                            NavAction.EXTERNAL -> runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                                            NavAction.BLOCK -> Unit
                                        }
                                        return true
                                    }
                                    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                        progress = 10; pageError = false; vm.ticketUsed = true
                                        ownPage.set(url != null && isOwnHost(url))
                                    }
                                    override fun onPageFinished(view: WebView, url: String?) {
                                        progress = 100; refreshing = false; canGoBack = view.canGoBack()
                                        url?.let { vm.lastUrl = it }
                                        view.evaluateJavascript(HOOK_JS, null)
                                    }
                                    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) { canGoBack = view.canGoBack(); url?.takeIf { isOwnHost(it) }?.let { vm.lastUrl = it } }
                                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                                        if (request.isForMainFrame) { pageError = true; refreshing = false }
                                    }
                                    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                                        if (isSessionExpired(errorResponse.statusCode, request.url.toString())) renew(view.url)
                                    }
                                }
                                web = w
                                // A recreated view (rotation) must not replay the used one-time ticket: ask for a fresh one for the page the user was on.
                                if (vm.ticketUsed) scope.launch { vm.renewUrl(vm.lastUrl)?.let { w.loadUrl(it) } } else w.loadUrl(s.url)
                            }
                        },
                    )
                    if (pageError) Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                        CenterMessage(Icons.Filled.Warning, stringResource(R.string.p1_objects_offline_empty), stringResource(R.string.err_network), stringResource(R.string.retry)) {
                            scope.launch { vm.renewUrl(web?.url)?.let { pageError = false; web?.loadUrl(it) } }
                        }
                    }
                }
            }
        }
    }
}
