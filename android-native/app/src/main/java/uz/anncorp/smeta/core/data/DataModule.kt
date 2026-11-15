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

    @Provides @Singleton
    fun sessionRepository(api: ApiClient, json: Json) = SessionRepository(api, json)
}
