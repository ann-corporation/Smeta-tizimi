package uz.anncorp.smeta

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import uz.anncorp.smeta.core.data.Features
import uz.anncorp.smeta.core.demo.Demo
import java.io.File

@HiltAndroidApp
class QuraiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // @username screens stay hidden until the server migration is applied. Only a debug build in demo mode with
        // `files/username.flag` can show them (Demo.enabled is a constant false in release builds).
        if (Demo.enabled(this) && File(filesDir, "username.flag").exists()) Features.USERNAME = true
    }
}
