package uz.anncorp.smeta.core.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import uz.anncorp.smeta.core.data.KeystoreCipher
import uz.anncorp.smeta.core.data.SecretCipher
import java.io.File
import java.security.SecureRandom

@Database(
    entities = [ObyektEntity::class, QatorEntity::class, QatorFts::class, MetaEntity::class, DraftEntity::class, OutboxEntity::class],
    version = 2, exportSchema = false,
)
abstract class AppDb : RoomDatabase() {
    abstract fun obyekt(): ObyektDao
    abstract fun qator(): QatorDao
    abstract fun meta(): MetaDao
    abstract fun draft(): DraftDao
    abstract fun outbox(): OutboxDao

    /** Sign-out: drop everything that is cached from the server. Unsent writes are kept (they belong to the user's work). */
    suspend fun clearCaches() {
        obyekt().clear(); qator().clear(); meta().clear(); draft().clearAll()
    }

    companion object {
        /**
         * Encrypted database (SQLCipher). The 256-bit passphrase is generated once, then stored only wrapped by an
         * Android Keystore AES key (non-exportable) in noBackupFilesDir. If the wrapped key is lost (restore to another
         * device) the cache is unreadable by design: it is deleted and rebuilt from the server.
         */
        fun open(context: Context, cipher: SecretCipher = KeystoreCipher("qurai_db_key"), name: String = "qurai.db"): AppDb {
            System.loadLibrary("sqlcipher")
            val keyFile = File(context.noBackupFilesDir, "db.key")
            val passphrase = loadOrCreateKey(keyFile, cipher) {
                context.getDatabasePath(name).let { f -> listOf(f, File(f.path + "-wal"), File(f.path + "-shm"), File(f.path + "-journal")).forEach { it.delete() } }
            }
            return Room.databaseBuilder(context, AppDb::class.java, name)
                .openHelperFactory(SupportOpenHelperFactory(passphrase))
                .addMigrations(MIGRATION_1_2)
                .fallbackToDestructiveMigration()
                .build()
        }

        /** v2: rows get their section name. The cache refills on the next sync; unsent writes and drafts are untouched. */
        val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) { db.execSQL("ALTER TABLE qator ADD COLUMN bolim TEXT") }
        }

        internal fun loadOrCreateKey(file: File, cipher: SecretCipher, onNewKey: () -> Unit): ByteArray {
            if (file.exists()) {
                runCatching { cipher.decrypt(file.readBytes()) }.getOrNull()?.takeIf { it.size == 32 }?.let { return it }
                file.delete()
            }
            onNewKey()
            val key = ByteArray(32).also { SecureRandom().nextBytes(it) }
            file.parentFile?.mkdirs()
            file.writeBytes(cipher.encrypt(key))
            return key
        }
    }
}

