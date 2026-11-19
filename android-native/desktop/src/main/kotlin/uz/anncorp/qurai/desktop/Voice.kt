package uz.anncorp.qurai.desktop

import java.io.ByteArrayOutputStream
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import javax.sound.sampled.DataLine
import javax.sound.sampled.TargetDataLine

/** One finished microphone take: WAV (16 kHz, 16 bit, mono) that the server's speech-to-text accepts (`audio/wav`). */
class DesktopAudio(val bytes: ByteArray, val millis: Long)

/** System microphone through javax.sound (no extra library). [start] opens the default input, [stop] returns the take; shorter than 400 ms is dropped. */
class DesktopRecorder {
    private var line: TargetDataLine? = null
    private var thread: Thread? = null
    private val pcm = ByteArrayOutputStream()
    private var startedAt = 0L
    private val format = AudioFormat(16_000f, 16, 1, true, false)

    @Synchronized fun start(): Boolean {
        cancel()
        return try {
            val info = DataLine.Info(TargetDataLine::class.java, format)
            if (!AudioSystem.isLineSupported(info)) return false
            val l = AudioSystem.getLine(info) as TargetDataLine
            l.open(format); l.start()
            pcm.reset(); line = l; startedAt = System.currentTimeMillis()
            thread = Thread {
                val buf = ByteArray(4096)
                while (line === l && l.isOpen) {
                    val n = l.read(buf, 0, buf.size)
                    if (n > 0) synchronized(pcm) { if (pcm.size() < MAX_PCM) pcm.write(buf, 0, n) }
                }
            }.also { it.isDaemon = true; it.start() }
            true
        } catch (e: Exception) { line = null; false }
    }

    @Synchronized fun stop(): DesktopAudio? {
        val l = line ?: return null
        line = null
        val ms = System.currentTimeMillis() - startedAt
        runCatching { l.stop(); l.close() }
        runCatching { thread?.join(300) }
        val raw = synchronized(pcm) { pcm.toByteArray() }
        if (ms < 400 || raw.isEmpty()) return null
        return DesktopAudio(wav(raw, format), ms)
    }

    @Synchronized fun cancel() { line?.let { runCatching { it.stop(); it.close() } }; line = null }

    companion object {
        private const val MAX_PCM = 16_000 * 2 * 120 // two minutes
        fun wav(pcm: ByteArray, format: AudioFormat): ByteArray {
            val out = ByteArrayOutputStream()
            AudioSystem.write(AudioInputStream(pcm.inputStream(), format, (pcm.size / format.frameSize).toLong()), AudioFileFormat.Type.WAVE, out)
            return out.toByteArray()
        }
    }
}
