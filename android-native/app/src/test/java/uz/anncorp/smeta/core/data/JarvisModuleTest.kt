package uz.anncorp.smeta.core.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JarvisModuleTest {
    @Test fun hubListsJarvisWithCompanyReadAndHidesItOtherwise() {
        assertTrue(ModuleCatalog.visible(setOf("company.read"), emptySet()).any { it.code == "jarvis" && it.target == NativeTarget.JARVIS })
        assertFalse(ModuleCatalog.visible(setOf("fakt.read"), emptySet()).any { it.code == "jarvis" })
    }
}
