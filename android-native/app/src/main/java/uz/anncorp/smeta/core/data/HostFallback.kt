package uz.anncorp.smeta.core.data

import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException

/**
 * API host fallback (domain move to qurai.uz). Bases are tried in order: the canonical host first, then the old host that
 * still serves the same API. Only a failure to REACH a host switches to the next one (DNS, refused/unroutable connection,
 * TLS handshake; any IOException for idempotent GET/HEAD), so a POST is never replayed after it may have been processed.
 * The host that worked is remembered for [stickyMs] to avoid paying the failed attempt on every request.
 * An `Origin` header equal to one of our own origins is rewritten to the origin of the host actually called, because the
 * server only accepts a same-origin Origin.
 */
class HostFallbackInterceptor(
    bases: List<HttpUrl>,
    private val stickyMs: Long = 120_000L,
    private val now: () -> Long = System::currentTimeMillis,
) : Interceptor {
    private val bases: List<HttpUrl> = bases.distinctBy { it.host to it.port }
    @Volatile private var stickyIdx = 0
    @Volatile private var stickyUntil = 0L

    private fun isOurs(url: HttpUrl) = bases.any { it.host.equals(url.host, true) && it.port == url.port }
    private fun origin(u: HttpUrl) = "${u.scheme}://${u.host}" + if (u.port != HttpUrl.defaultPort(u.scheme)) ":${u.port}" else ""

    internal fun order(): List<Int> {
        val first = if (now() < stickyUntil) stickyIdx else 0
        return listOf(first) + bases.indices.filter { it != first }
    }

    private fun reachFailure(e: IOException, idempotent: Boolean) =
        idempotent || e is UnknownHostException || e is ConnectException || e is NoRouteToHostException || e is SSLHandshakeException

    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (bases.size < 2 || !isOurs(req.url)) return chain.proceed(req)
        val idempotent = req.method == "GET" || req.method == "HEAD"
        val ownOrigins = bases.map(::origin)
        var last: IOException? = null
        for (i in order()) {
            val b = bases[i]
            val url = req.url.newBuilder().scheme(b.scheme).host(b.host).port(b.port).build()
            val rb = req.newBuilder().url(url)
            val o = req.header("Origin")
            if (o != null && o in ownOrigins) rb.header("Origin", origin(url))
            try {
                val r = chain.proceed(rb.build())
                if (i == 0) stickyUntil = 0L else { stickyIdx = i; stickyUntil = now() + stickyMs }
                return r
            } catch (e: IOException) {
                if (chain.call().isCanceled() || !reachFailure(e, idempotent)) throw e
                last = e
            }
        }
        throw last ?: IOException("no API host reachable")
    }
}