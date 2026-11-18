package uz.anncorp.smeta.core.data

/** Reversible test cipher (the shared module has its own copy for its tests; Android Keystore is not available on the JVM). */
class FakeCipher : SecretCipher {
    override fun encrypt(plain: ByteArray) = byteArrayOf(0x7F) + plain.map { (it.toInt() xor 0x5A).toByte() }.toByteArray()
    override fun decrypt(data: ByteArray): ByteArray {
        require(data.isNotEmpty() && data[0] == 0x7F.toByte()) { "bad blob" }
        return data.drop(1).map { (it.toInt() xor 0x5A).toByte() }.toByteArray()
    }
}