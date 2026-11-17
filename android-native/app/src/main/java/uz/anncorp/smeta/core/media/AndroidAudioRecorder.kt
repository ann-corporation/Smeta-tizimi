package uz.anncorp.smeta.core.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import uz.anncorp.smeta.feature.ombor.AudioRecorder
import uz.anncorp.smeta.feature.ombor.RecordedAudio
import java.io.File

/**
 * Android implementation of [AudioRecorder] (the platform-neutral interface lives with the warehouse command contract).
 * AAC in an MP4 container (audio/mp4), mono 16 kHz: small enough to send a few seconds of speech, accepted by speech-to-text services.
 * The temporary file lives in the app cache and is deleted as soon as it is read. Anything shorter than 400 ms is discarded.
 */
class AndroidAudioRecorder(private val context: Context) : AudioRecorder {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    override fun start(): Boolean {
        cancel()
        val f = File(context.cacheDir, "cmd_${System.nanoTime()}.m4a")
        return try {
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1); r.setAudioSamplingRate(16_000); r.setAudioEncodingBitRate(32_000)
            r.setMaxDuration(30_000)
            r.setOutputFile(f.absolutePath)
            r.prepare(); r.start()
            recorder = r; file = f; startedAt = System.currentTimeMillis()
            true
        } catch (e: Exception) {
            f.delete(); recorder = null; file = null
            false
        }
    }

    override fun stop(): RecordedAudio? {
        val r = recorder ?: return null
        val f = file
        val ms = System.currentTimeMillis() - startedAt
        recorder = null; file = null
        val ok = try { r.stop(); true } catch (e: RuntimeException) { false } finally { runCatching { r.release() } }
        if (f == null) return null
        return try { if (ok && ms >= 400 && f.length() > 0) RecordedAudio(f.readBytes(), "audio/mp4", ms) else null } finally { f.delete() }
    }

    override fun cancel() {
        recorder?.let { runCatching { it.stop() }; runCatching { it.release() } }
        file?.delete(); recorder = null; file = null
    }
}