package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModuleAccessTest {
    private val ombor get() = ModuleCatalog.all.first { it.code == "ombor" }

    @Test fun workspaceGrantCountsAsAllowed() {
        val perms = setOf("company.read")
        assertFalse(ModuleCatalog.allowed(ombor, perms, emptySet()))
        assertTrue(ModuleCatalog.allowed(ombor, perms, emptySet(), granted = setOf("ombor")))
        assertFalse(ModuleCatalog.allowed(ombor, perms, setOf("module.logistika"), granted = setOf("ombor")))
    }

    @Test fun searchFindsModulesMissingFromCatalogue() {
        val cat = Catalog(1, 1, listOf(CatalogGroup("g", L3("G", "G", "G"), "Box", "")), emptyList())
        val missing = ModuleCatalog.missingFrom(emptySet(), listOf(ombor))
        val c2 = cat.withExtraModules("Boshqa", missing.map { Triple(it, "Ombor", "Qoldiq") })
        assertEquals(listOf("m:ombor"), c2.search("ombor").map { it.id })
    }
}