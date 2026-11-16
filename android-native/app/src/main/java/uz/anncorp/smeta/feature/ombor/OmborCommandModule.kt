package uz.anncorp.smeta.feature.ombor

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.media.AndroidAudioRecorder

/** Binds the platform-neutral command interfaces to their Android / BFF implementations. */
@Module
@InstallIn(SingletonComponent::class)
object OmborCommandModule {
    @Provides fun commandApi(api: BffApi): OmborCommandApi = BffOmborCommandApi(api)
    @Provides fun audioRecorder(@ApplicationContext c: Context): AudioRecorder = AndroidAudioRecorder(c)
}