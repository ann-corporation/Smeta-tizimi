package uz.anncorp.smeta.core.demo

import android.content.Context
import android.content.ContextWrapper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** The release demo never shares a file with the real session: its own names, and leaving it deletes only the demo copies. */
class DemoModeTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun ctx(): Context {
        val files = tmp.newFolder("files"); val noBackup = tmp.newFolder("nobackup"); val dbs = tmp.newFolder("databases"); val prefs = mutableListOf<String>()
        return object : ContextWrapper(null) {
            override fun getFilesDir(): File = files
            override fun getNoBackupFilesDir(): File = noBackup
            override fun getDatabasePath(name: String): File = File(dbs, name)
            override fun deleteSharedPreferences(name: String): Boolean { prefs += name; return true }
        }
    }

    @Test fun realNamesUntilTheDemoFlagExists() {
        val c = ctx()
        assertFalse(Demo.enabled(c))
        assertEquals("qurai.db", Demo.scoped(c, "qurai.db"))
        File(c.filesDir, Demo.FLAG).writeText("1")
        assertTrue(Demo.enabled(c))
        assertEquals("qurai.db-demo", Demo.scoped(c, "qurai.db"))
        assertEquals("readcache-demo", Demo.scoped(c, "readcache"))
    }

    @Test fun wipeRemovesOnlyDemoFilesAndNeverTheRealSession() {
        val c = ctx()
        File(c.filesDir, Demo.FLAG).writeText("1"); File(c.filesDir, "rol.flag").writeText("x")
        val real = listOf("device.bin", "readcache", "docs", "jarvis-outbox", "photos", "db.key").map { File(c.noBackupFilesDir, it).apply { if (name.contains(".")) writeText("secret") else mkdirs() } }
        val demo = listOf("readcache-demo", "docs-demo", "jarvis-outbox-demo", "photos-demo").map { File(c.noBackupFilesDir, it).apply { mkdirs(); File(this, "a").writeText("1") } }
        val realDb = c.getDatabasePath("qurai.db").apply { writeText("real") }
        val demoDb = c.getDatabasePath("qurai.db-demo").apply { writeText("demo") }
        Demo.wipe(c)
        assertFalse(File(c.filesDir, Demo.FLAG).exists()); assertFalse(File(c.filesDir, "rol.flag").exists())
        assertTrue(demo.none { it.exists() }); assertFalse(demoDb.exists())
        assertTrue(real.all { it.exists() }); assertTrue(realDb.exists())
        assertFalse(Demo.enabled(c))
    }
}