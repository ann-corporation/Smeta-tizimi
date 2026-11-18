package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogTest {
    private val json = Json { ignoreUnknownKeys = true }

    private val sample = """
    {"ok":true,"versiya":1,"kompaniya_id":7,"rol":"boss",
     "guruhlar":[
       {"id":"smeta","nom":{"uz":"Smeta","ru":"Смета","en":"Estimate"},"ikonka":"Calculator","qatlam":"ish"},
       {"id":"fakt","nom":{"uz":"Fakt","ru":"Факт","en":"Actual"},"ikonka":"HardHat","qatlam":"ish"},
       {"id":"bosh","nom":{"uz":"Bosh","ru":"Пустая","en":"Empty"},"ikonka":"Box","qatlam":"ish"}],
     "sahifalar":[
       {"id":"smeta-studio","nom":{"uz":"Smeta studiyasi","ru":"Сметная студия","en":"Estimate studio"},"guruh":"smeta","band":{"uz":"Smeta studiyasi","ru":"Сметная студия","en":"Estimate studio"},"ikonka":"Calculator","yol":"/admin/smeta-studio","native":null,"tanlangan":true,"holat":"tayyor","qoshimcha":false},
       {"id":"fakt","nom":{"uz":"Fakt kiritish","ru":"Ввод факта","en":"Enter actual"},"guruh":"fakt","band":{"uz":"Fakt kiritish","ru":"Ввод факта","en":"Enter actual"},"ikonka":"HardHat","yol":"/admin/fakt","native":"fakt","tanlangan":true,"holat":"tayyor","qoshimcha":false},
       {"id":"naryad","nom":{"uz":"Naryad","ru":"Наряд","en":"Work order"},"guruh":"fakt","band":{"uz":"Naryad (brigada)","ru":"Наряд","en":"Work order"},"ikonka":"ClipboardList","yol":"/admin/naryad","native":null,"tanlangan":false,"holat":"beta","qoshimcha":true},
       {"id":"x","nom":{"uz":"Noma'lum guruh"},"guruh":"yoq","yol":"/admin/x","ikonka":"Box"},
       {"id":"y","nom":{"uz":"Tashqi"},"guruh":"smeta","yol":"https://evil.example/admin","ikonka":"Box"},
       {"id":"z","nom":{"uz":"Yo'lsiz"},"guruh":"smeta","ikonka":"Box"}]}
    """.trimIndent()

    private fun catalog() = parseCatalog(json.parseToJsonElement(sample))!!

    @Test fun parsesAndSkipsMalformedRows() {
        val c = catalog()
        assertEquals(7L, c.companyId)
        assertEquals(listOf("smeta-studio", "fakt", "naryad"), c.items.map { it.id })
        assertEquals("Сметная студия", c.items[0].title.ru)
        assertNull(c.items[0].native)
        assertEquals("fakt", c.items[1].native)
        assertEquals(false, c.items[2].chosen)
        assertTrue(c.items[2].extra)
    }

    @Test fun refusesNonOkOrSkeletonLess() {
        assertNull(parseCatalog(json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseCatalog(json.parseToJsonElement("""{"ok":true,"guruhlar":[]}""")))
        assertNull(parseCatalog(null))
    }

    @Test fun everyPageOpensANativeScreenNeverTheWebsite() {
        val c = catalog()
        assertEquals(CatalogOpen.Native(NativeTarget.FAKT), c.items[1].open())
        // A website page of a module the app has natively opens that module.
        assertEquals(CatalogOpen.Native(NativeTarget.SMETA), c.items[0].open())
    }

    @Test fun unknownNativeCodeFallsBackToTheModuleOfThePathElseNull() {
        val i = catalog().items[0].copy(native = "yo'q-ekran")
        assertEquals(CatalogOpen.Native(NativeTarget.SMETA), i.open())
        val gone = i.copy(path = "/admin/hech-narsa")
        assertNull(gone.open())
        assertTrue(catalog().let { it.copy(items = it.items + gone) }.search("").none { it.path == "/admin/hech-narsa" })
    }

    @Test fun everyNativeCodeTheServerCanSendIsARealNativeModule() {
        // Mirror of functions/_shared/modul-katalog.ts NATIVE_YOL values.
        for (code in listOf("obyektlar", "fakt", "foto", "rahbar", "zayavka")) assertNotNull(code, nativeTargetFor(code))
    }

    @Test fun searchIsMultiWordAcrossLanguagesAndGroupNames() {
        val c = catalog()
        assertEquals(listOf("smeta-studio"), c.search("smeta stud").map { it.id })
        assertEquals(listOf("smeta-studio"), c.search("сметная").map { it.id })
        assertEquals(listOf("smeta-studio"), c.search("estimate studio").map { it.id })
        assertEquals(listOf("fakt", "naryad"), c.search("fakt").map { it.id })
        assertEquals(3, c.search("  ").size)
        assertTrue(c.search("zzz").isEmpty())
    }

    @Test fun searchIgnoresApostropheVariants() {
        val c = catalog().let { it.copy(items = it.items + it.items[0].copy(id = "q", native = "foto", title = L3("O‘zbek sahifa", "Страница", "Page"))) }
        assertEquals(listOf("q"), c.search("ozbek").map { it.id })
        assertEquals(listOf("q"), c.search("o'zbek").map { it.id })
    }

    @Test fun sectionsFollowServerGroupOrderAndDropEmptyGroups() {
        val s = catalog().sections()
        assertEquals(listOf("smeta", "fakt"), s.map { it.group.id })
        assertEquals(listOf("fakt", "naryad"), s[1].items.map { it.id })
    }

    @Test fun l3FallsBackToUzbek() {
        val t = L3("Smeta", "", "")
        assertEquals("Smeta", t.pick("ru")); assertEquals("Smeta", t.pick("en")); assertEquals("Smeta", t.pick("de"))
        assertEquals("Смета", L3("Smeta", "Смета", "Estimate").pick("ru"))
    }

    @Test fun twoPagesOpeningTheSameNativeScreenAreShownOnce() {
        fun item(id: String, path: String, native: String?) = CatalogItem(id, L3(id, id, id), "g", L3(id, id, id), "", path, native, true, "tayyor", false)
        val items = listOf(item("pult", "/admin/pult", "rahbar"), item("dashboard", "/admin/dashboard", "rahbar"), item("a", "/admin/a", null), item("b", "/admin/b", null))
        val r = items.dedupeNative()
        assertEquals(listOf("dashboard", "a", "b"), r.map { it.id })   // the page on the module's own path wins; web pages are never merged
    }}
