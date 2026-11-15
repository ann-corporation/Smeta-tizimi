package uz.anncorp.smeta.core.demo

import android.content.Context
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.db.AppDb

/** Release build: the demo mode does not exist. These stubs are inert constants, so no fixture or flag can reach production. */
@Suppress("UNUSED_PARAMETER")
object Demo {
    fun enabled(context: Context): Boolean = false
    fun forcedOffline(context: Context): Boolean? = null
    fun bff(context: Context, json: Json): BffApi? = null
    suspend fun seed(context: Context, db: AppDb) {}
    fun updateManifest(context: Context): String? = null
}
