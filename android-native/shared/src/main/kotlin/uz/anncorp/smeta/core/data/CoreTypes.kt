package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import java.net.URLDecoder

/*
 * Small platform-neutral building blocks shared by the Android app and the Windows desktop app.
 * Extracted verbatim from Contract.kt / Modules.kt / Documents.kt / Repositories.kt of the Android module.
 */

// ---------- defensive JSON accessors (numbers may arrive as strings; NULL is "unknown") ----------

fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()
fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
fun JsonElement?.obj(): JsonObject? = this as? JsonObject
fun JsonElement?.arr(): JsonArray? = this as? JsonArray

// ---------- /api/sb ----------

data class SbRows(val rows: List<JsonObject>, val complete: Boolean)

/** `{ok:true, qatorlar:[...]}` -> rows; anything else (ok:false, wrong shape) -> null. */
fun parseSb(body: JsonElement?): SbRows? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val rows = o["qatorlar"].arr()?.mapNotNull { it.obj() } ?: return null
    val complete = (o["toliq"] as? JsonPrimitive)?.booleanOrNull ?: true
    return SbRows(rows, complete)
}

// ---------- sync outcome ----------

sealed interface SyncResult {
    data object Ok : SyncResult
    data object Offline : SyncResult
    /** The server said this user may not read it (403): the UI shows what is allowed instead. */
    data object Forbidden : SyncResult
    data class Failed(val code: String?) : SyncResult
}

// ---------- modules / feature flags ----------

/** Where a module opens: a native screen, or the website page inside the authenticated in-app WebView. */
enum class ModuleKind { NATIVE, WEB }

/** Native destinations the hub can jump to (the UI maps each to a tab or a route). */
enum class NativeTarget { OBJECTS, FAKT, PHOTO, APPROVALS, TODAY, WAREHOUSE, JARVIS, RAHBAR, ZAYAVKA, M29, NARYAD, HUJJAT, F2REESTR, NAKOP, QARZDOR, QABUL, RESURS, NAZORAT }

/**
 * Feature flags. Warehouse (Ombor) is merged and enabled. USERNAME (@username, people search, company invites; docs/architecture/USERNAME_V1.md)
 * is on: migration 20261224100000_t2_username_v1 is applied and the server (/api/profil username actions, /api/company member_invite,
 * BFF allow-list) is live on main. Kept as a var so tests can still switch it off. JARVIS (AI chat) uses the existing /api/ai-savol.
 */
object Features {
    const val NATIVE_WAREHOUSE = true
    const val JARVIS = true
    @Volatile @JvmStatic var USERNAME = true
}

// ---------- documents ----------

/** Largest document the apps download (bytes). */
const val DOC_MAX_BYTES = 25L * 1024 * 1024

/** `Content-Disposition: attachment; filename*=UTF-8''<percent-encoded>` -> file name, or null. */
fun parseDispositionName(header: String?): String? {
    val h = header ?: return null
    Regex("filename\\*=(?:UTF-8|utf-8)''([^;]+)").find(h)?.let { m -> return runCatching { URLDecoder.decode(m.groupValues[1].trim().replace("+", "%2B"), "UTF-8") }.getOrNull() }
    return Regex("filename=\"?([^\";]+)\"?").find(h)?.groupValues?.get(1)?.trim()
}

/** A file name that is safe to put in the cache / share directory (no path separators, bounded length). */
fun safeFileName(name: String, fallback: String): String {
    val cleaned = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trim('.').take(120)
    return cleaned.ifBlank { fallback }
}