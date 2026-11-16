package uz.anncorp.smeta.feature.hujjat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.NotificationItem
import uz.anncorp.smeta.core.data.parseNotifications
import java.time.LocalDate

class HujjatContractTest {
    private val chains = Json.parseToJsonElement("""{"ok":true,"natija":[{"id":4,"hujjat_turi":"f2","sarlavha":"F-2 oktyabr","holat":"jarayonda","raund":2,"meniki":false,"egasi_nom":"NEW TIMES","navbat_menda":true,"navbat_rol":"rahbar"},
        {"id":3,"hujjat_turi":"akt","sarlavha":"Akt","holat":"tasdiqlandi","meniki":true},{"sarlavha":"no id"}]}""")

    @Test fun parsesChainsAndFilters() {
        val r = parseChains(chains)!!
        assertEquals(2, r.size); assertTrue(r[0].myTurn); assertEquals("rahbar", r[0].turnRole); assertEquals(2, r[0].raund)
        assertEquals(listOf(4L), filterChains(r, "turn").map { it.id })
        assertEquals(listOf(4L), filterChains(r, "running").map { it.id })
        assertEquals(listOf(3L), filterChains(r, "done").map { it.id })
        assertNull(parseChains(Json.parseToJsonElement("""{"ok":false}""")))
    }

    @Test fun parsesLettersWithDirectionNumbers() {
        val b = Json.parseToJsonElement("""{"ok":true,"natija":[{"id":9,"turi":"talabnoma","mavzu":"Muddat","holat":"yuborilgan","kiruvchi":true,"kiruvchi_raqam":"K-1","chiquvchi_raqam":"C-7","qarshi_nom":"Zakazchik","javob_muddati":"2026-11-10","kechikkan":true}]}""")
        val l = parseLetters(b)!!.single()
        assertTrue(l.incoming); assertEquals("K-1", l.raqam); assertTrue(canReceive(l)); assertTrue(isLate(l, LocalDate.of(2026, 11, 16)))
        assertFalse(canReceive(l.copy(holat = "olindi"))); assertFalse(isLate(l.copy(holat = "javob_berildi", overdue = false), LocalDate.of(2026, 11, 16)))
    }

    @Test fun parsesLetterDetail() {
        val b = Json.parseToJsonElement("""{"ok":true,"xat":{"id":9,"turi":"xat","mavzu":"Salom","matn":"Matn","holat":"yuborilgan","kiruvchi":true,"kiruvchi_raqam":"K-1","yuboruvchi_nom":"A","qabul_nom":"B"}}""")
        val d = parseLetter(b)!!
        assertEquals("Matn", d.text); assertEquals("A", d.row.counterparty); assertEquals("B", d.receiver)
    }

    @Test fun receiveBodyAndPaths() {
        assertEquals("xat_qabul", receiveBody(17, 9)["amal"]!!.jsonPrimitive.content)
        assertEquals("/api/hujjat-aylanish?bolim=zanjirlar&kompaniya_id=17&yonalish=mendan&limit=100", chainsPath(17, ChainDirection.FROM_ME))
        assertEquals("/api/hujjat-aylanish?bolim=xatlar&kompaniya_id=17&limit=100&yonalish=kiruvchi", lettersPath(17, "kiruvchi"))
    }

    @Test fun notificationDeepLinks() {
        val body = Json.parseToJsonElement("""{"ok":true,"qatorlar":[{"id":1,"mavzu":"hujjat.xat_keldi","parametrlar":{"xat_id":9}},{"id":2,"mavzu":"hujjat.tasdiq_kutmoqda","parametrlar":{"zanjir_id":"4"}},{"id":3,"mavzu":"x","parametrlar":{}}]}""")
        val items: List<NotificationItem> = parseNotifications(body)!!.items
        assertEquals(DocTarget.Letter(9), targetOf(items[0].zanjirId, items[0].xatId))
        assertEquals(DocTarget.Chain(4), targetOf(items[1].zanjirId, items[1].xatId))
        assertEquals(DocTarget.Inbox, targetOf(items[2].zanjirId, items[2].xatId))
    }
}
