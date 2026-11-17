package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OmborP8Test {
    private fun obj(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test fun fuzzyToleratesTyposAndScripts() {
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "cement"))
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "semnt"))
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "sment"))
        assertTrue(matchesQuery("Sement M400", "\u0446\u0435\u043C\u0435\u043D\u0442"))
        assertTrue(matchesQuery("Armatura A500C d12", "armtura"))
        assertTrue(matchesQuery("Armatura A500C d12", "armatura 12"))
        assertTrue(matchesQuery("Xlor ohak", "hlor"))
        assertFalse(matchesQuery("Qum yuvilgan", "sement"))
        assertFalse(matchesQuery("Sement M400", "sement armatura"))
        // short tokens stay exact: no wild matches
        assertFalse(matchesQuery("Gvozd 100", "gvz"))
    }

    @Test fun cleanMatchesRankBeforeTypoMatches() {
        val rows = listOf(StockRow(1, "Cement tipi", "t", 1.0), StockRow(1, "Sement M400", "t", 2.0), StockRow(1, "Semnt eski", "t", 3.0))
        val r = filterStock(rows, OmborScope.AllObjects, "sement").map { it.nomi }
        assertEquals("Semnt eski", r.last())
        assertTrue(r.size == 3)
    }

    @Test fun editDistanceBasics() {
        assertEquals(1, editDistance("sement", "semnt", 2))
        assertEquals(1, editDistance("ab", "ba", 2))
        assertEquals(3, editDistance("abcdef", "x", 2))
    }

    @Test fun historyParsesOnlyReceiptsAndIssues() {
        val rows = listOf(
            obj("""{"id":2,"obyekt_id":101,"operatsiya":"rasxod","nomi":"Sement","birligi":"qop","obyomi":40,"sana":"2026-11-16","izoh":"x"}"""),
            obj("""{"id":1,"obyekt_id":101,"operatsiya":"prixod","nomi":"Sement","birligi":"qop","obyomi":240,"sana":"2026-11-15"}"""),
            obj("""{"id":3,"operatsiya":"storno","nomi":"Sement","birligi":"qop","obyomi":1}"""),
        )
        val m = parseHistory(rows)
        assertEquals(2, m.size)
        assertEquals(listOf(1L), filterMoves(m, true, OmborScope.AllObjects, "").map { it.id })
        assertEquals(2, materialHistory(m, "Sement", "qop", 101).size)
        assertEquals(0, materialHistory(m, "Sement", "qop", 5).size)
    }

    @Test fun balanceIsReceiptsMinusIssues() {
        val m = parseHistory(listOf(
            obj("""{"id":2,"obyekt_id":101,"operatsiya":"rasxod","nomi":"Sement","birligi":"qop","obyomi":40,"sana":"2026-11-16"}"""),
            obj("""{"id":1,"obyekt_id":101,"operatsiya":"prixod","nomi":"SEMENT","birligi":"qop","obyomi":240,"sana":"2026-11-15"}"""),
        ))
        val b = balanceFromMoves(m)
        assertEquals(1, b.size)
        assertEquals(200.0, b[0].qoldiq!!, 1e-9)
        assertEquals("2026-11-16", b[0].oxirgi)
    }

    private fun reply(s: String) = parseCommandReply(Json.parseToJsonElement(s))
    private fun preview(s: String) = (reply(s) as CommandOutcome.Preview).preview

    @Test fun commandReplyParsesTheServerPreviewShape() {
        val p = preview("""{"ok":true,"holat":"tasdiq_kerak","matn":"sement qirq qop keldi","token":"T.T","preview":{"tur":"prixod","nomi":"Sement","birligi":"qop","miqdor":40,"kontragent":"Demo","obyekt_id":101,"ogohlantirish":["Yangi nom"]},"nomzodlar":[{"nomi":"Sement","birligi":"qop","qoldiq":1},{"nomi":"Sement M500","birligi":"qop","qoldiq":2}]}""")
        assertEquals(CommandKind.RECEIVE, p.kind)
        assertEquals(40.0, p.qty!!, 0.0)
        assertEquals("T.T", p.token)
        assertEquals(101L, p.objectId)
        assertEquals("Demo", p.party)
        assertEquals(listOf("Yangi nom"), p.warnings)
        assertEquals("sement qirq qop keldi", p.heard)
        assertEquals(listOf("Sement M500"), p.alternatives.map { it.name }) // the chosen name is not offered again
        assertTrue(p.canSave())
        assertEquals(CommandKind.ISSUE, preview("""{"ok":true,"holat":"tasdiq_kerak","token":"x","preview":{"tur":"chiqim","nomi":"A","birligi":"m","miqdor":2}}""").kind)
    }

    @Test fun balanceAnswerAndUnwritableStatesAreNotSavable() {
        val w = preview("""{"ok":true,"holat":"javob","nomzodlar":[{"nomi":"Sement","birligi":"qop","qoldiq":200}]}""")
        assertEquals(CommandKind.BALANCE, w.kind)
        assertFalse(w.canSave())
        assertTrue(w.answer!!.startsWith("Sement: 200"))
        assertEquals(CommandOutcome.LowStock, reply("""{"ok":true,"holat":"qoldiq_yetmaydi","hozirgi_qoldiq":1}"""))
        for (h in listOf("tushunilmadi", "toldirish_kerak", "nom_kerak", "material_topilmadi", "obyekt_tanlang", "sana_kelajakda", "zzz"))
            assertEquals(CommandOutcome.NotUnderstood, reply("""{"ok":true,"holat":"$h"}"""))
        assertEquals(CommandOutcome.NotUnderstood, reply("""{"ok":false}"""))
        assertEquals(CommandOutcome.NotUnderstood, reply("""{"ok":true,"holat":"tasdiq_kerak","preview":{"tur":"prixod","nomi":"A","miqdor":1}}""")) // no token: nothing to confirm
        assertEquals(CommandOutcome.NotUnderstood, reply("[]"))
    }

    @Test fun editCardKeepsTheServerToken() {
        val p = preview("""{"ok":true,"holat":"tasdiq_kerak","token":"E.T","preview":{"amal":"tuzat","harakat_id":9,"asl":{"nomi":"Sement","birligi":"qop"},"yangi":{"miqdor":5},"sabab":"xato"}}""")
        assertEquals(CommandKind.EDIT, p.kind)
        assertEquals("E.T", p.token)
        assertEquals(5.0, p.qty!!, 0.0)
        assertFalse(p.canSave()) // the card confirms through its token, not through the receive/issue form
    }

    /**
     * Regression: the released app sent { kompaniya_id, til, matn } (no `amal`, no `sklad_id`) and base64 audio under keys the server did not read,
     * and the BFF did not even route /api/ombor-buyruq: neither typing nor voice could ever work. Pin the real wire.
     */
    @Test fun commandBodiesMatchTheServerWire() {
        val t = textCommandBody(7, 3, "  sement 40 qop  ", "uz")
        assertEquals("tahlil", t["amal"].toString().trim('"'))
        assertEquals("7", t["kompaniya_id"].toString()); assertEquals("3", t["sklad_id"].toString())
        assertEquals("sement 40 qop", t["matn"].toString().trim('"'))
        assertEquals("uzb", t["til"].toString().trim('"'))
        assertEquals("rus", audioCommandBody(7, 3, RecordedAudio(byteArrayOf(1), "audio/mp4", 900), "ru")["til"].toString().trim('"'))
        val a = audioCommandBody(7, 3, RecordedAudio(byteArrayOf(1, 2, 3), "audio/mp4", 900), "ru")
        assertEquals("AQID", a["audio_b64"].toString().trim('"'))
        assertEquals("audio/mp4", a["mime"].toString().trim('"'))
        assertEquals("tahlil", a["amal"].toString().trim('"'))
        assertEquals(null, a["matn"])
        val e = editedCommandBody(7, 3, CommandKind.ISSUE, " Sement ", "qop", 2.5, "Brigada", "", "Obyekt")
        val b = e["buyruq"] as kotlinx.serialization.json.JsonObject
        assertEquals("chiqim", b["amal"].toString().trim('"')); assertEquals("Sement", b["nomi"].toString().trim('"')); assertEquals("2.5", b["miqdor"].toString())
        assertEquals("Obyekt", b["obyekt"].toString().trim('"')); assertEquals(null, b["izoh"])
        assertEquals("tasdiq", confirmBody(7, 3, "T")["amal"].toString().trim('"'))
        val s = suggestBody(7, 3, "  sem ")
        assertEquals("taklif", s["amal"].toString().trim('"')); assertEquals("sem", s["q"].toString().trim('"'))
        for (body in listOf(t, a, e, confirmBody(7, 3, "T"), s)) assertFalse("the actor is never sent", body.containsKey("actor_id") || body.containsKey("p_actor_id"))
    }

    @Test fun suggestionsParseNamesUnitSupplierAndPrice() {
        val s = parseSuggestions(Json.parseToJsonElement("""{"ok":true,"takliflar":[{"nomi":"Sement","birligi":"qop","soni":3,"postavshik":"Demo","qabul_qiluvchi":"Brigada","narx":12.5},{"nomi":" ","birligi":"m"},{"nomi":"Truba","birligi":"m","narx":0}]}"""))!!
        assertEquals(2, s.size)
        assertEquals(NameSuggestion("Sement", "qop", "Demo", "Brigada", 12.5), s[0])
        assertEquals(null, s[1].price) // 0 is unknown, never a price
        assertNull(parseSuggestions(Json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseSuggestions(Json.parseToJsonElement("""{"ok":true}""")))
    }

    @Test fun bffCommandApiRoutesToTheServerEndpointAndMapsAnswers() = kotlinx.coroutines.test.runTest {
        val sent = mutableListOf<Pair<String, kotlinx.serialization.json.JsonElement?>>()
        fun api(status: Int, body: String, code: String? = null) = object : uz.anncorp.smeta.core.data.BffApi {
            override suspend fun bff(path: String, method: String, body0: kotlinx.serialization.json.JsonElement?, etag: String?): uz.anncorp.smeta.core.data.ApiResult {
                sent += path to body0
                return uz.anncorp.smeta.core.data.ApiResult(status, Json.parseToJsonElement(body), code)
            }
            override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody): uz.anncorp.smeta.core.data.ApiResult = uz.anncorp.smeta.core.data.ApiResult(404, null)
        }
        val good = BffOmborCommandApi(api(200, """{"ok":true,"holat":"tasdiq_kerak","token":"T","preview":{"tur":"prixod","nomi":"A","birligi":"m","miqdor":1}}"""))
        assertTrue(good.text(7, 3, "a 1 m keldi", "uz") is CommandOutcome.Preview)
        assertEquals(COMMAND_PATH, sent.last().first)
        assertEquals("/api/ombor-buyruq", COMMAND_PATH)
        assertEquals(ConfirmOutcome.Saved, good.confirm(7, 3, "T"))
        assertEquals(ConfirmOutcome.LowStock, BffOmborCommandApi(api(409, """{"ok":false,"code":"QOLDIQ_YETMAYDI"}""", "QOLDIQ_YETMAYDI")).confirm(7, 3, "T"))
        assertEquals(ConfirmOutcome.Forbidden, BffOmborCommandApi(api(403, """{"ok":false,"code":"PERMISSION_DENIED"}""", "PERMISSION_DENIED")).confirm(7, 3, "T"))
        assertEquals(CommandOutcome.Forbidden, BffOmborCommandApi(api(403, """{"ok":false}""", "PERMISSION_DENIED")).text(7, 3, "x", "uz"))
        assertEquals(CommandOutcome.Unavailable, BffOmborCommandApi(api(503, """{"ok":false,"code":"VOICE_NOT_CONFIGURED"}""", "VOICE_NOT_CONFIGURED")).audio(7, 3, RecordedAudio(byteArrayOf(1), "audio/mp4", 900), "uz"))
        assertEquals(CommandOutcome.Unavailable, BffOmborCommandApi(api(400, """{"ok":false,"code":"TARGET_INVALID"}""", "TARGET_INVALID")).text(7, 3, "x", "uz"))
        assertEquals(listOf("Sement"), BffOmborCommandApi(api(200, """{"ok":true,"takliflar":[{"nomi":"Sement","birligi":"qop"}]}""")).suggest(7, 3, "sem")!!.map { it.name })
        assertNull(BffOmborCommandApi(api(503, """{"ok":false}""")).suggest(7, 3, "sem"))
    }

    @Test fun receiptPriceIsOptionalAndTheServerGetsTheModeNotAComputedValue() {
        val e = editedCommandBody(7, 3, CommandKind.RECEIVE, "Sement", "qop", 2.0, "Alfa", "", null, 1120.0, "bilan")
        val b = e["buyruq"] as kotlinx.serialization.json.JsonObject
        assertEquals("1120.0", b["narx"].toString()); assertEquals("bilan", b["narx_rejim"].toString().trim('"'))
        val siz = editedCommandBody(7, 3, CommandKind.RECEIVE, "S", "m", 1.0, "", "", null, 5.0, "siz")["buyruq"] as kotlinx.serialization.json.JsonObject
        assertEquals("siz", siz["narx_rejim"].toString().trim('"'))
        // no price / issue: nothing about price is sent
        assertEquals(null, (editedCommandBody(7, 3, CommandKind.RECEIVE, "S", "m", 1.0, "", "", null)["buyruq"] as kotlinx.serialization.json.JsonObject)["narx"])
        assertEquals(null, (editedCommandBody(7, 3, CommandKind.ISSUE, "S", "m", 1.0, "", "", null, 5.0, "bilan")["buyruq"] as kotlinx.serialization.json.JsonObject)["narx"])
        assertEquals("siz", textCommandBody(7, 3, "x", "uz", "siz")["narx_rejim"].toString().trim('"'))
        assertEquals(null, textCommandBody(7, 3, "x", "uz")["narx_rejim"])
    }

    @Test fun previewCarriesBothPricesAndTheGentleAsk() {
        val ask = parseCommandReply(Json.parseToJsonElement("""{"ok":true,"holat":"tasdiq_kerak","token":"T","preview":{"tur":"prixod","nomi":"A","birligi":"m","miqdor":1,"narx_sorov":true}}""")) as CommandOutcome.Preview
        assertTrue(ask.preview.priceAsk); assertEquals(null, ask.preview.price)
        val priced = parseCommandReply(Json.parseToJsonElement("""{"ok":true,"holat":"tasdiq_kerak","token":"T","preview":{"tur":"prixod","nomi":"A","birligi":"m","miqdor":1,"narx":1000,"narx_bilan":1120,"narx_rejim_sorov":true,"narx_sorov":false}}""")) as CommandOutcome.Preview
        assertEquals(1000.0, priced.preview.price!!, 0.001); assertEquals(1120.0, priced.preview.priceGross!!, 0.001)
        assertTrue(priced.preview.modeAsk); assertFalse(priced.preview.priceAsk)
        assertTrue(priced.preview.canSave()) // the price never blocks saving
    }

    @Test fun suggestionsCarryUsualQuantityAndPriceFromTheSmartEndpoint() {
        val s = parseSuggestions(Json.parseToJsonElement("""{"ok":true,"takliflar":[{"nomi":"Sement","birligi":"kg","miqdor_median":1500,"narx_oxirgi":1000,"narx_oxirgi_qqs":1120,"kontragent":"Alfa"}]}"""))!!
        assertEquals(NameSuggestion("Sement", "kg", "Alfa", null, 1000.0, 1500.0, 1120.0), s[0])
    }

    @Test fun periodReportAnswerShowsBothSumsAndUnpricedCount() {
        val o = parseCommandReply(Json.parseToJsonElement("""{"ok":true,"holat":"hisobot","hisobot":{"davr":{"dan":"2026-10-01","gacha":"2026-10-31"},"jami":{"kirim_soni":2,"chiqim_soni":1,"birliklar":[{"birligi":"kg","kirim":1500,"chiqim":300}],"kirim_summa":1600000,"kirim_summa_qqs":1792000,"narxsiz_soni":1}}}""")) as CommandOutcome.Preview
        val t = o.preview.answer!!
        assertTrue(t.contains("2026-10-01")); assertTrue(t.contains("QQS siz")); assertTrue(t.contains("QQS bilan")); assertTrue(t.contains("narxsiz: 1"))
    }}
