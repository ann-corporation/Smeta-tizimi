package uz.anncorp.smeta.core.i18n

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same fixtures as the site test `frontend/src/i18n/til.test.ts` (parity): the native apps must answer exactly like `t()` of the site. */
class SiteI18nTest {
    private val ru = Lang.Ru
    private val en = Lang.En
    // "Сохранить" / "Части словаря"
    private val saveRu = "Сохранить"
    private val partsRu = "Части словаря"

    @Test fun translatesFallsBackAndFillsPlaceholders() {
        assertEquals(saveRu, SiteI18n.t("Saqlash", ru))
        assertEquals("Save", SiteI18n.t("Saqlash", en))
        assertEquals("Saqlash", SiteI18n.t("Saqlash", Lang.Uz))
        assertEquals("4 ta qator", SiteI18n.t("{n} ta qator", ru, mapOf("n" to 4)))
        assertEquals("Lug‘atda yo‘q", SiteI18n.t("Lug‘atda yo‘q", ru))
        assertEquals("{x} stays", SiteI18n.t("{x} stays", Lang.Uz, mapOf("n" to 1)))
    }

    @Test fun qismFilesAreIncluded() {
        assertEquals(partsRu, SiteI18n.t("Lug‘at bo‘laklari", ru))
        assertEquals("Dictionary parts", SiteI18n.t("Lug‘at bo‘laklari", en))
    }

    @Test fun aosrSpellingFollowsTheLanguage() {
        val cyr = "АОСР"
        assertEquals("3 ta yashirin ish AOSR siz", SiteI18n.t("{n} ta yashirin ish $cyr siz", Lang.Uz, mapOf("n" to 3)))
        assertEquals("$cyr bog‘lanishi (lug‘atda yo‘q)", SiteI18n.t("AOSR bog‘lanishi (lug‘atda yo‘q)", ru))
        assertEquals("lug‘atda yo‘q AOSR matn", SiteI18n.t("lug‘atda yo‘q $cyr matn", en))
    }

    @Test fun fraktKeysOfTheFaktPageExist() {
        assertTrue(SiteI18n.has("Fakt jurnali", ru)); assertTrue(SiteI18n.has("Fakt jurnali", en))
        assertFalse(SiteI18n.t("Fakt jurnali", ru) == "Fakt jurnali")
        assertEquals("ru", Lang.Ru.code)
        assertEquals(Lang.En, Lang.entries.first { it.code == "en" })
        assertEquals(SiteI18n.t("Saqlash", Lang.Ru), SiteI18n.t("Saqlash", "ru"))
    }
}
