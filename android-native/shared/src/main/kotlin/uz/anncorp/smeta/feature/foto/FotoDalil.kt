package uz.anncorp.smeta.feature.foto

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.time.LocalDate
import java.time.YearMonth

/*
 * Foto-dalil feed (the site's FotoLenta page): GET /api/foto-dalil list + the pure helpers of frontend/src/lib/foto-dalil.ts
 * (grouping by date / section, month range, source names, caption). Upload stays in :shared EvidenceUploader.
 */

data class FotoElement(
    val id: Long, val documentId: Long, val manbaTuri: String, val manbaId: Long?, val razdelId: Long?, val razdelNom: String?, val sana: String,
    val izoh: String?, val aiIzoh: String?, val originalFilename: String?, val manbaNom: String?,
)
class FotoRazdel(val razdelId: Long?, val nom: String?, val soni: Int)
class FotoRoyxat(val jami: Int, val fotolar: List<FotoElement>, val razdellar: List<FotoRazdel>)

/** `{ok:true, jami, fotolar:[...], razdellar:[...]}` -> list; anything else -> null. */
fun parseFotoRoyxat(body: JsonElement?): FotoRoyxat? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val fotolar = o["fotolar"].arr()?.mapNotNull { e ->
        val f = e.obj() ?: return@mapNotNull null
        FotoElement(
            f["id"].num()?.toLong() ?: return@mapNotNull null, f["document_id"].num()?.toLong() ?: return@mapNotNull null, f["manba_turi"].str() ?: "umumiy", f["manba_id"].num()?.toLong(),
            f["razdel_id"].num()?.toLong(), f["razdel_nom"].str(), f["sana"].str() ?: return@mapNotNull null, f["izoh"].str(), f["ai_izoh"].str(), f["original_filename"].str(), f["manba_nom"].str(),
        )
    } ?: return null
    val razdellar = o["razdellar"].arr()?.mapNotNull { e -> e.obj()?.let { FotoRazdel(it["razdel_id"].num()?.toLong(), it["nom"].str(), it["soni"].num()?.toInt() ?: 0) } }.orEmpty()
    return FotoRoyxat(o["jami"].num()?.toInt() ?: fotolar.size, fotolar, razdellar)
}

fun fotoPath(kompaniyaId: Long, obyektId: Long, razdelId: Long?, dan: String?, gacha: String?, limit: Int = 200): String =
    "/api/foto-dalil?kompaniya_id=$kompaniyaId&obyekt_id=$obyektId" + (razdelId?.let { "&razdel_id=$it" } ?: "") + (dan?.let { "&dan=$it" } ?: "") + (gacha?.let { "&gacha=$it" } ?: "") + "&limit=$limit"

class FotoGuruh(val kalit: String, val sarlavha: String, val fotolar: List<FotoElement>)

/** Group the feed: by date (newest first) or by section (no-section last). */
fun fotoGuruhla(fotolar: List<FotoElement>, rejimSana: Boolean): List<FotoGuruh> {
    val m = LinkedHashMap<String, Pair<String, MutableList<FotoElement>>>()
    for (f in fotolar) {
        val kalit = if (rejimSana) f.sana else (f.razdelId?.let { "r$it" } ?: "_yoq")
        val sar = if (rejimSana) f.sana else (f.razdelNom?.takeIf { it.isNotEmpty() } ?: "Razdelsiz")
        m.getOrPut(kalit) { sar to ArrayList() }.second.add(f)
    }
    val l = m.map { (k, v) -> FotoGuruh(k, v.first, v.second) }
    return if (rejimSana) l.sortedByDescending { it.kalit }
    else l.sortedWith(Comparator { a, b -> if (a.kalit == "_yoq") 1 else if (b.kalit == "_yoq") -1 else a.sarlavha.compareTo(b.sarlavha, ignoreCase = true) })
}

private val MANBA_NOMI = mapOf("qator" to "Smeta qatori", "fakt" to "Fakt yozuvi", "aosr" to "AOSR", "predpisaniya" to "Predpisaniya", "murojaat" to "Murojaat", "umumiy" to "Umumiy")
fun manbaNomi(t: String): String = MANBA_NOMI[t] ?: t

/** Caption: the user's note, otherwise the confirmed AI note. */
fun fotoIzohi(f: FotoElement): String = f.izoh?.takeIf { it.isNotEmpty() } ?: f.aiIzoh.orEmpty()

/** "2026-02" -> ("2026-02-01", "2026-02-28"); anything else -> null. */
fun oyOraligi(oy: String): Pair<String, String>? {
    val m = Regex("^(\\d{4})-(\\d{2})$").find(oy) ?: return null
    val y = m.groupValues[1].toInt(); val mo = m.groupValues[2].toInt()
    if (mo < 1 || mo > 12) return null
    val oxirgi = YearMonth.of(y, mo).lengthOfMonth()
    return "${m.groupValues[1]}-${m.groupValues[2]}-01" to "${m.groupValues[1]}-${m.groupValues[2]}-${oxirgi.toString().padStart(2, '0')}"
}

/** Longest side never above [maxTomon] (not enlarged). */
fun olchamHisobla(w: Double, h: Double, maxTomon: Double = 1600.0): Triple<Int, Int, Boolean> {
    if (!(w > 0) || !(h > 0)) return Triple(0, 0, false)
    val k = maxOf(w, h) / maxTomon
    if (k <= 1) return Triple(Math.round(w).toInt(), Math.round(h).toInt(), false)
    return Triple(maxOf(1, Math.round(w / k).toInt()), maxOf(1, Math.round(h / k).toInt()), true)
}

/** Today's date as a file date fallback: a future or invalid date falls to today. */
fun faylSanasi(lastModifiedMs: Long?, hozir: LocalDate = LocalDate.now()): String {
    if (lastModifiedMs == null || lastModifiedMs <= 0) return hozir.toString()
    val d = java.time.Instant.ofEpochMilli(lastModifiedMs).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
    return if (d.isAfter(hozir)) hozir.toString() else d.toString()
}
