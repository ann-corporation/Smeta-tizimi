package uz.anncorp.smeta.feature.common

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult

class WireTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun res(s: String, status: Int = 200) = ApiResult(status, json.parseToJsonElement(s))

    // RZ(1) -> BL(2) -> RS(3);  RZ(1) -> BL(4)
    private val packet = """{"format":"t2-paket/1","obyekt_id":7,"soni":4,
      "q":{"id":[1,2,3,4],"ota_id":[null,1,2,1],"tartib":[1,1,1,2],"tur":[0,1,2,1],"kod":[0,1,2,3],"nom":[0,1,2,3],"birlik":[0,1,1,1],"hajm":[null,10,5,2],"narx":[null,100,20,50],"summa":[null,1000,100,100]},
      "h":{"fakt_hajm":[0,3,0,0],"fakt_summa":[0,300,0,0],"f2_hajm":[0,0,0,0],"f2_summa":[0,0,0,0]},
      "lugat":{"tur":["rz","bl","rs"],"kod":["","K1","K2","K3"],"nom":["Bo'lim","Ish A","Resurs","Ish B"],"birlik":["","m2"]}}"""

    @Test fun packetBuildsTreeAndRollup() {
        val p = parsePacket(json.parseToJsonElement(packet))
        assertNotNull(p)
        assertEquals(listOf(1L, 2L, 3L, 4L), p!!.nodes.map { it.id })
        assertEquals(listOf(0, 1, 2, 1), p.nodes.map { it.depth })
        assertEquals(2, p.blCount)
        assertEquals(1100.0, p.nodes[0].roll!!, 0.001) // a work counts once; its resource does not add again
        assertTrue(p.nodes[0].hasChildren); assertEquals("Ish A", p.byId[2]!!.nom)
    }

    @Test fun packetRejectsWrongFormat() {
        assertNull(parsePacket(json.parseToJsonElement("""{"format":"x","obyekt_id":1,"soni":0}""")))
    }

    @Test fun treeCollapseAndSearch() {
        val p = parsePacket(json.parseToJsonElement(packet))!!
        assertEquals(listOf(1L), visibleNodes(p.nodes, emptySet(), "").map { it.id })
        assertEquals(listOf(1L, 2L, 4L), visibleNodes(p.nodes, setOf(1L), "").map { it.id })
        assertEquals(listOf(1L, 2L, 3L, 4L), visibleNodes(p.nodes, setOf(1L, 2L), "").map { it.id })
        assertEquals(listOf(1L, 4L), visibleNodes(p.nodes, emptySet(), "ish b").map { it.id }) // match + its ancestors
    }

    @Test fun omborSavolWithVariants() {
        val r = parseOmborReply(res("""{"ok":true,"holat":"savol","matn":"sement 10","savol":"Kirimmi yoki chiqimmi?","variantlar":[{"yorliq":"Kirim","tanlov":{"amal":"prixod"}},{"yorliq":"Chiqim","tanlov":{"amal":"chiqim"}}]}"""))
        r as OmborReply.Ask
        assertEquals("Kirimmi yoki chiqimmi?", r.text)
        assertEquals(listOf("Kirim", "Chiqim"), r.variants.map { it.label })
        assertEquals("prixod", r.variants[0].tanlov["amal"].toString().trim('"'))
        assertEquals("sement 10", r.heard)
    }

    @Test fun omborPreviewNeedsToken() {
        val ok = parseOmborReply(res("""{"ok":true,"holat":"tasdiq_kerak","token":"T1","preview":{"tur":"prixod","nomi":"Sement","birligi":"qop","miqdor":10,"kontragent":"Alfa","ogohlantirish":["yangi material"],"qoldiq_hozir":5,"qoldiq_keyin":15}}"""))
        ok as OmborReply.Preview
        assertEquals("T1", ok.token); assertEquals(10.0, ok.miqdor!!, 0.0); assertEquals(listOf("yangi material"), ok.warnings); assertEquals(15.0, ok.after!!, 0.0)
        assertTrue(parseOmborReply(res("""{"ok":true,"holat":"tasdiq_kerak","preview":{"tur":"prixod"}}""")) is OmborReply.Fail)
    }

    @Test fun omborStatesAndErrors() {
        assertTrue(parseOmborReply(res("""{"ok":true,"holat":"qoldiq_yetmaydi"}""")) is OmborReply.Fail)
        assertTrue(parseOmborReply(res("""{"ok":true,"holat":"tushunilmadi"}""")) is OmborReply.Ask)
        assertTrue(parseOmborReply(res("""{"ok":true,"holat":"toldirish_kerak","savol":"Qancha?"}""")) is OmborReply.Ask)
        assertTrue(parseOmborReply(ApiResult(0, null)) is OmborReply.Fail)
        assertTrue(parseOmborReply(res("""{"ok":false,"code":"X"}""", 403)) is OmborReply.Fail)
        val info = parseOmborReply(res("""{"ok":true,"holat":"javob","sana":"2026-10-01","nomzodlar":[{"nomi":"Sement","birligi":"qop","qoldiq":12.5}]}""")) as OmborReply.Info
        assertEquals("Qoldiq (2026-10-01)", info.title); assertTrue(info.lines.single().startsWith("Sement: 12,5"))
    }

    @Test fun omborRequestBodies() {
        val b = omborText(1, 2, " sement 10 qop ", json.parseToJsonElement("""{"amal":"prixod"}""").jsonObject)
        assertEquals("tahlil", b["amal"].toString().trim('"')); assertTrue(b.containsKey("tanlov")); assertEquals("sement 10 qop", b["matn"].toString().trim('"'))
        assertTrue(!omborText(1, 2, "x", null).containsKey("tanlov"))
        assertEquals("tasdiq", omborConfirm(1, 2, "T")["amal"].toString().trim('"'))
        val e = omborEdited(1, 2, "chiqim", "Sement", "qop", 3.0, "", "")["buyruq"] as JsonObject
        assertEquals("chiqim", e["amal"].toString().trim('"')); assertTrue(!e.containsKey("kontragent"))
    }

    @Test fun reportRows() {
        val body = json.parseToJsonElement("""{"ok":true,"davr":{"dan":"2026-10-01","gacha":"2026-10-31"},"jami":{"kirim_soni":2,"chiqim_soni":1,"birliklar":[{"birligi":"qop","kirim":20,"chiqim":3}],"kirim_summa":1000,"kirim_summa_qqs":1120,"narxsiz_soni":1},
        "qatorlar":[{"sana":"2026-10-02","operatsiya":"prixod","nomi":"Sement","birligi":"qop","obyomi":20,"narx":50,"summa":1000,"summa_qqs":1120}]}""")
        val (rows, lines) = parseMoves(body)!!
        assertEquals(1, rows.size); assertEquals("Kirim", rows[0].op)
        assertTrue(lines.any { it.contains("QQS siz") && it.contains("QQS bilan") }); assertTrue(lines.any { it.startsWith("Narxsiz") })
    }

    @Test fun stockLinesFromRpcWrapAndPlain() {
        val plain = json.parseToJsonElement("""{"ok":true,"qatorlar":[{"nomi":"Sement","birligi":"qop","qoldiq":5}]}""")
        val wrapped = json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"qatorlar":[{"nomi":"Sement","birligi":"qop","qoldiq":5}]}}""")
        assertEquals(5.0, parseStockLines(plain)!!.single().qoldiq!!, 0.0)
        assertEquals(5.0, parseStockLines(wrapped)!!.single().qoldiq!!, 0.0)
        assertNull(parseStockLines(json.parseToJsonElement("""{"ok":false}""")))
    }

    @Test fun faktBodyKeepsMinusAndOperationId() {
        val b = faktWriteBody(1, 2, "2026-11-01", listOf(FaktLine(9, -2.5)), "op-1")
        assertEquals("fakt_yoz_v2", b["amal"].toString().trim('"')); assertEquals("op-1", b["operation_id"].toString().trim('"')); assertTrue(b.toString().contains("-2.5"))
        val out = parseFaktOutcome(res("""{"ok":true,"raqam":"F-1","jami":10,"narxsiz_soni":2,"ogohlantirish":[{"qator_id":1,"nom":"Ish","bor":9,"qoshilmoqda":2,"chegara":10}]}"""))
        assertTrue(out.ok); assertEquals(2, out.warnings.size)
    }

    @Test fun narxAndDebtAndDocs() {
        val n = parseNarx(json.parseToJsonElement("""{"ok":true,"qatorlar":[{"nom":"Sement","birlik":"qop","obyekt_soni":3,"natija":null,"xavf":true}]}"""))!!
        assertNull(n[0].natija); assertTrue(n[0].xavf)
        val d = parseDebtRows(json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"qatorlar":[{"yonalish":"debitor","qarz":5},{"yonalish":"kreditor","qarz":9}]}}"""))!!
        assertEquals(1, d.size)
        val docs = parseDocs(json.parseToJsonElement("""{"ok":true,"documents":[{"id":"12","filename":"a.pdf","canonicalStatus":"READY"}]}"""))!!
        assertEquals(12L, docs[0].id); assertTrue(docs[0].ready)
    }

    @Test fun profile() {
        val p = parseProfile(json.parseToJsonElement("""{"profil":{"ism":"Ali","email":"a@b.c","telefon":"+998"}}"""))!!
        assertEquals("Ali", p.ism)
        assertTrue(profileUpdateBody("X", null, null).containsKey("ism"))
    }
}
