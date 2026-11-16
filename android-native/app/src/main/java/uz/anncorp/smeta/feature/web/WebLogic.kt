package uz.anncorp.smeta.feature.web

import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.core.data.embedPath
import java.net.URI

/** Same whitelist as the server's one-time ticket path (functions/_shared/mobil-bilet.ts BILET_YOL): /admin/... with a plain query. */
internal val TICKET_PATH = Regex("^/admin(?:/[A-Za-z0-9_.~-]+)*(?:\\?[A-Za-z0-9_=&.%-]*)?$")

private fun uriOf(url: String): URI? = runCatching { URI(url) }.getOrNull()

/** Only https pages of the QURAI website itself may load inside the in-app WebView; everything else goes to the system browser. */
internal fun isOwnHost(
    url: String,
    baseUrl: String = BuildConfig.API_BASE_URL,
    fallbackHosts: List<String> = BuildConfig.API_FALLBACK_URLS.split(",").mapNotNull { uriOf(it.trim())?.host },
): Boolean {
    val u = uriOf(url) ?: return false
    val b = uriOf(baseUrl) ?: return false
    if (u.scheme != "https" || u.host == null) return false
    if (u.host.equals(b.host, ignoreCase = true)) return true
    // Fallback hosts of the domain move (BuildConfig.API_FALLBACK_URLS) are the same website.
    return fallbackHosts.any { u.host.equals(it, ignoreCase = true) }
}

/** What to do with a top-level navigation. */
enum class NavAction { STAY, EXTERNAL, BLOCK }

/** Own origin stays in the container; http(s)/mailto/tel go to the system; anything else (intent:, file:, javascript:, ...) is blocked. */
internal fun navAction(url: String, baseUrl: String = BuildConfig.API_BASE_URL): NavAction {
    if (isOwnHost(url, baseUrl)) return NavAction.STAY
    val scheme = uriOf(url)?.scheme?.lowercase()
    return if (scheme == "https" || scheme == "http" || scheme == "mailto" || scheme == "tel") NavAction.EXTERNAL else NavAction.BLOCK
}

/**
 * Path for a silent re-ticket after the web session ended: the page the user is on (own host, /admin..., whitelisted) so nothing is lost,
 * otherwise [fallback]. App-embed hints are re-added when the SPA dropped them from the address.
 */
internal fun ticketPathFor(currentUrl: String?, fallback: String, companyId: Long?, dark: Boolean, baseUrl: String = BuildConfig.API_BASE_URL): String {
    if (currentUrl == null || !isOwnHost(currentUrl, baseUrl)) return fallback
    val u = uriOf(currentUrl) ?: return fallback
    val path = u.rawPath.orEmpty()
    if (!path.startsWith("/admin")) return fallback
    val pq = path + (u.rawQuery?.takeIf { it.isNotEmpty() }?.let { "?$it" } ?: "")
    val withHints = if (pq.contains("app=android")) pq else embedPath(pq, companyId, dark)
    return if (TICKET_PATH.matches(withHints) && withHints.length <= 200) withHints else fallback
}

/** Is this a request the web page makes to our API that the server refused because the session is gone? */
internal fun isSessionExpired(status: Int, requestUrl: String, baseUrl: String = BuildConfig.API_BASE_URL): Boolean {
    if (status != 401 || !isOwnHost(requestUrl, baseUrl)) return false
    val p = uriOf(requestUrl)?.rawPath.orEmpty()
    return p.startsWith("/api/") && !p.startsWith("/api/mobil/")
}

/** Throttle: at most one renew per [minGapMs]. */
internal fun mayRenew(lastRenewAt: Long, now: Long, minGapMs: Long = 20_000L): Boolean = lastRenewAt == 0L || now - lastRenewAt >= minGapMs

/** Safe file name for a blob download (the web page's own name when known, else a typed fallback). */
internal fun blobFileName(name: String?, mime: String): String {
    val clean = name?.substringAfterLast('/')?.substringAfterLast('\\')?.filter { it.isLetterOrDigit() || it in "._- ()" }?.trim().orEmpty()
    if (clean.isNotEmpty() && clean.contains('.')) return clean.take(120)
    val ext = when {
        mime.contains("pdf") -> "pdf"
        mime.contains("spreadsheetml") || mime.contains("excel") -> "xlsx"
        mime.contains("wordprocessingml") || mime.contains("msword") -> "docx"
        mime.contains("zip") -> "zip"
        mime.contains("csv") -> "csv"
        mime.contains("png") -> "png"
        mime.contains("jpeg") || mime.contains("jpg") -> "jpg"
        mime.startsWith("text/") -> "txt"
        else -> "bin"
    }
    return (clean.ifEmpty { "hujjat" }).take(100) + "." + ext
}
