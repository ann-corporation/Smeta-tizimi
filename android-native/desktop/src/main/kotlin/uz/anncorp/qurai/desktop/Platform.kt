package uz.anncorp.qurai.desktop

import com.sun.jna.platform.win32.Crypt32Util
import uz.anncorp.smeta.core.data.SecretCipher
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** Per-user data folder (%APPDATA%\QURAI). Holds the device credential, the encrypted offline cache and the log. */
object AppPaths {
    val root: File = File(System.getenv("APPDATA") ?: System.getProperty("user.home"), "QURAI").also { it.mkdirs() }
    val token = File(root, "device.bin")
    val cache = File(root, "cache")
    val logs = File(root, "logs").also { it.mkdirs() }
}

/**
 * Windows DPAPI (current user): the secret is readable only by this Windows account on this machine, so the stored device credential
 * and the offline cache are useless if the files are copied elsewhere. Same role as the Android Keystore cipher.
 */
class DpapiCipher : SecretCipher {
    override fun encrypt(plain: ByteArray): ByteArray = Crypt32Util.cryptProtectData(plain)
    override fun decrypt(data: ByteArray): ByteArray = Crypt32Util.cryptUnprotectData(data)
}

/** Plain-text log with no secrets: only events, HTTP status codes and sizes. Rotates at ~1 MB. */
object Log {
    private val file = File(AppPaths.logs, "qurai.log")
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    @Synchronized
    fun i(msg: String) {
        runCatching {
            if (file.length() > 1_000_000) file.renameTo(File(AppPaths.logs, "qurai.old.log"))
            file.appendText("${LocalDateTime.now().format(fmt)} $msg\n")
        }
    }
}