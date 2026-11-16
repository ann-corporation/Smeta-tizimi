package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Catalogue `native` ids of the field modules open the native screens ("Barcha modullar"). */
class DalaCatalogTest {
    @Test fun nativeIdsMapToScreens() {
        assertEquals(NativeTarget.M29, nativeTargetFor("m29"))
        assertEquals(NativeTarget.NARYAD, nativeTargetFor("naryad"))
        assertEquals(NativeTarget.HUJJAT, nativeTargetFor("hujjat"))
        assertEquals(NativeTarget.ZAYAVKA, nativeTargetFor("zayavka"))
        assertNull(nativeTargetFor("smeta-studio"))
    }

    @Test fun hubModulesAreVisibleByPermission() {
        val v = ModuleCatalog.visible(setOf("smeta.write"), emptySet()).map { it.code }
        assert("m29" in v && "naryad" in v)
        assert("naryad" in ModuleCatalog.visible(setOf("self.work.read"), emptySet()).map { it.code })
        assert("m29" !in ModuleCatalog.visible(setOf("company.read"), emptySet()).map { it.code })
    }
}
