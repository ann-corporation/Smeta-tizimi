package uz.anncorp.smeta.core.data

import android.content.Context
import android.os.Build
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.demo.Demo
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides @Singleton
    fun json(): Json = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true }

    @Provides @Singleton
    fun okHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS).build()

    @Provides @Singleton
    fun tokenStore(@ApplicationContext c: Context, json: Json) = TokenStore(File(c.noBackupFilesDir, "device.bin"), KeystoreCipher(), json)

    @Provides @Singleton
    fun events() = AuthEvents()

    @Provides @Singleton
    fun prefs(@ApplicationContext c: Context) = Prefs(c.getSharedPreferences("qurai_prefs", Context.MODE_PRIVATE))

    @Provides @Singleton
    fun apiClient(tokens: TokenStore, events: AuthEvents, json: Json, http: OkHttpClient) =
        ApiClient(BuildConfig.API_BASE_URL.toHttpUrl(), tokens, events, json, BuildConfig.VERSION_NAME, http)

    @Provides @Singleton
    fun authRepository(tokens: TokenStore, json: Json, http: OkHttpClient) = AuthRepository(
        BuildConfig.API_BASE_URL.toHttpUrl(), tokens, json, BuildConfig.VERSION_NAME,
        deviceName = { Build.MODEL ?: "Android" }, osName = { "Android ${Build.VERSION.RELEASE}" }, base = http,
    )

    /** Real network client, or (debug builds only, when the demo flag file exists) fixture-backed demo data. */
    @Provides @Singleton
    fun bffApi(@ApplicationContext c: Context, api: ApiClient, json: Json): BffApi = Demo.bff(c, json) ?: api

    @Provides @Singleton
    fun sessionRepository(api: BffApi, json: Json) = SessionRepository(api, json)

    @Provides @Singleton
    fun appDb(@ApplicationContext c: Context): AppDb = AppDb.open(c).also { db -> if (Demo.enabled(c)) kotlinx.coroutines.runBlocking { Demo.seed(c, db) } }

    @Provides @Singleton
    fun workContext() = WorkContext()

    @Provides @Singleton
    fun connectivity(@ApplicationContext c: Context) = ConnectivityMonitor(c) { Demo.forcedOffline(c) }

    @Provides @Singleton
    fun objectsRepository(api: BffApi, db: AppDb) = ObjectsRepository(api, db)

    @Provides @Singleton
    fun rowsRepository(api: BffApi, db: AppDb, json: Json) = RowsRepository(api, db, json)

    @Provides @Singleton
    fun outboxScheduler(@ApplicationContext c: Context): OutboxScheduler = if (Demo.enabled(c)) object : OutboxScheduler { override fun schedule() {} } else WorkManagerScheduler(c)

    @Provides @Singleton
    fun outboxRepository(db: AppDb, scheduler: OutboxScheduler) = OutboxRepository(db.outbox(), scheduler, PhotoRepository.Companion::cleanup)

    @Provides @Singleton
    fun photoSender(db: AppDb, api: BffApi) = PhotoSender(api, db.outbox(), { path -> runCatching { File(path).readBytes() }.getOrNull() }, { path -> runCatching { File(path).delete() } })

    /** One outbox, two kinds of entries: the fact write (sb-yoz) and the photo evidence (upload + link). */
    @Provides @Singleton
    fun outboxProcessor(db: AppDb, api: BffApi, json: Json, photos: PhotoSender) = OutboxProcessor(
        db.outbox(),
        { e -> if (e.kind == KIND_PHOTO) photos.send(e) else api.bff("/api/sb-yoz", "POST", json.parseToJsonElement(e.payloadJson)) },
        json,
    )

    @Provides @Singleton
    fun moneyRepository(api: BffApi, db: AppDb, json: Json) = MoneyRepository(api, db, json)

    @Provides @Singleton
    fun approvalsRepository(api: BffApi, db: AppDb) = ApprovalsRepository(api) { id -> db.obyekt().get(id)?.nom }

    @Provides @Singleton
    fun todayRepository(api: BffApi) = TodayRepository(api)

    @Provides @Singleton
    fun photoProcessor(@ApplicationContext c: Context) = uz.anncorp.smeta.core.media.PhotoProcessor(c)

    @Provides @Singleton
    fun photoRepository(@ApplicationContext c: Context, outbox: OutboxRepository) = PhotoRepository(outbox, File(c.noBackupFilesDir, "photos"))

    @Provides @Singleton
    fun faktRepository(db: AppDb, outbox: OutboxRepository, json: Json) = FaktRepository(db, outbox, json)
}

