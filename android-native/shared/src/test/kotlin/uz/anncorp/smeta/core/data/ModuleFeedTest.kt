package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModuleFeedTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun el(s: String) = json.parseToJsonElement(s)

    @Test fun isoDatesAreShownAsDayMonthYear() {
        assertEquals("14.11.2026", short("2026-11-14"))
        assertEquals("14.11.2026", short("2026-11-14T08:10:00+00:00"))
        assertEquals("2026-11", short("2026-11"))
        assertEquals("Sement", short("Sement"))
        val rows = parseFeed(el("""{"ok":true,"qatorlar":[{"id":5,"nom":"Sement","sana":"2026-11-14"}]}"""), FeedSource("t", table = "x"))
        assertEquals("14.11.2026", rows[0].all.first { it.label == "Sana" }.value)
        assertTrue(rows[0].all.none { it.value.matches(Regex("^\\d{4}-\\d{2}-\\d{2}.*")) })
    }

    @Test fun tableAnswerBecomesCards() {
        val src = FeedSource("t", table = "x")
        val rows = parseFeed(el("""{"ok":true,"qatorlar":[{"id":5,"nom":"Sement","holat":"faol","summa":1500000,"telefon":"998901112233","kompaniya_id":1}]}"""), src)
        assertEquals(1, rows.size)
        val r = rows[0]
        assertEquals("Sement", r.title)
        assertEquals("Faol", r.subtitle)
        assertEquals(1500000.0, r.amount!!, 0.0)
        // the id and the company id are never shown; a phone number stays text
        assertTrue(r.all.none { it.label == "Id" || it.label.startsWith("Kompaniya") })
        assertEquals("998901112233", r.all.first { it.label == "Telefon" }.value)
    }

    @Test fun namedReadFindsListInsideNatija() {
        val rows = parseFeed(el("""{"ok":true,"natija":{"ok":true,"jami":2,"xodimlar":[{"id":1,"ism":"A"},{"id":2,"ism":"B"}],"obyektlar":[{"id":1,"nom":"O"}]}}"""), FeedSource("h", soro = "hr_xodimlar_v1", listKey = "xodimlar"))
        assertEquals(listOf("A", "B"), rows.map { it.title })
    }

    @Test fun unknownShapeIsEmptyNeverThrows() {
        assertTrue(parseFeed(null, FeedSource("x", table = "t")).isEmpty())
        assertTrue(parseFeed(el("""[1,2]"""), FeedSource("x", table = "t")).isEmpty())
        assertTrue(parseFeed(el("""{"ok":true}"""), FeedSource("x", table = "t")).isEmpty())
    }

    @Test fun missingNumberIsAbsentNotZero() {
        val r = parseFeed(el("""{"ok":true,"qatorlar":[{"nom":"Q","summa":null}]}"""), FeedSource("x", table = "t")).single()
        assertNull(r.amount)
    }

    @Test fun singleRecordShowsScalarsAndNestedGroups() {
        val rows = parseFeed(el("""{"ok":true,"natija":{"ok":true,"jami":10,"kpi":{"kirim":5,"chiqim":3}}}"""), FeedSource("moliya_tahlil", soro = "moliya_tahlil_v1", single = true))
        assertTrue(rows.size >= 2)
        assertEquals("Moliya tahlil", rows[0].title)
        assertEquals("Kpi", rows[1].title)
    }

    @Test fun answerOkDetectsFailures() {
        assertTrue(feedAnswerOk(el("""{"ok":true,"qatorlar":[]}""")))
        assertTrue(feedAnswerOk(el("""{"ok":true,"natija":{"ok":true}}""")))
        assertFalse(feedAnswerOk(el("""{"ok":false}""")))
        assertFalse(feedAnswerOk(el("""{"ok":true,"natija":{"ok":false}}""")))
        assertFalse(feedAnswerOk(null))
    }

    @Test fun requestsUseTheSameWireAsTheWebsite() {
        val (p, b) = feedRequest(7, FeedSource("x", table = "t2_narx_markaz", filter = "xavf=is.true", order = "nom.asc", searchColumn = "nom"), "sem*ent")
        assertEquals("/api/sb", p)
        assertEquals("kompaniya_id=eq.7&xavf=is.true&nom=ilike.*sem ent*", b!!["filtr"]!!.jsonPrimitive.content)
        val (_, n) = feedRequest(7, FeedSource("y", soro = "hr_oy_v1", extra = mapOf("oy" to "2026-11")))
        assertEquals("hr_oy_v1", n!!["soro"]!!.jsonPrimitive.content)
        assertEquals("2026-11", n["oy"]!!.jsonPrimitive.content)
        val (g, nb) = feedRequest(7, FeedSource("z", getPath = "/api/company?profile={company}"))
        assertEquals("/api/company?profile=7", g)
        assertNull(nb)
    }

    @Test fun searchIgnoresCaseAndApostrophes() {
        val rows = parseFeed(el("""{"ok":true,"qatorlar":[{"nom":"O'zbekiston sement"},{"nom":"Qum"}]}"""), FeedSource("x", table = "t"))
        assertEquals(1, filterFeed(rows, "OZBEKISTON").size)
        assertEquals(2, filterFeed(rows, "").size)
    }

    @Test fun catalogueCoversEveryOfficeModule() {
        FeedCatalog.codes.forEach { assertTrue(it, FeedCatalog.module(it, "2026-11")!!.sources.isNotEmpty()) }
        assertNull(FeedCatalog.module("yo'q", "2026-11"))
    }

    @Test fun codesBecomeUzbekWords() {
        val r = parseFeed(el("""{"ok":true,"qatorlar":[{"nom":"Sement","tur":"mat","holat":"faol","xavf":true,"yopiq":false}]}"""), FeedSource("x", table = "t")).single()
        assertEquals("Faol", r.subtitle)
        assertEquals("Material", r.all.first { it.label == "Turi" }.value)
        assertEquals("Xavfli", r.all.first { it.label == "Xavfli" }.label)
        assertEquals("Qoralama", labelValue("qoralama"))
        assertEquals("Tasdiqlangan", labelValue("tasdiqlangan"))
        assertEquals("noma'lum_x", labelValue("noma'lum_x"))
        assertEquals("Shartnoma summasi", labelKey("shartnoma_summa"))
    }
}
