package uz.anncorp.smeta.core.fakt

/*
 * "Bajarilish tahlili" (site FaktJurnal.tsx `fakt-tahlil` -> FaktXulosaPanel of components/fakt/FaktKorinish.tsx): the object's completion (sections weighted by their
 * smeta sum, else by their work count), finished top-level sections and the works by status. Pure assembly of the already ported rules
 * (jurnalQur, jurnalXulosa, obyektUlushi, bolimSummalari, bolimMaxraji) - NO new formula.
 */

/** Status order of the legend / the split bar (site HOLAT_TARTIB). */
val HOLAT_TARTIB: List<HolatTur> = listOf(HolatTur.Tugadi, HolatTur.Qisman, HolatTur.Yangi, HolatTur.Oshdi, HolatTur.Smetasiz)

class BajarilishTahlili(val xulosa: JurnalXulosa, val obyekt: ObyektUlushi)

/** [baj] = active "not done" volumes per row (empty = none known); [svod] = round-svod summary of the markup context (null = none). */
fun bajarilishTahlili(d: JurnalMalumot, baj: Map<Long, Double> = emptyMap(), svod: SvodYaxlit? = null): BajarilishTahlili {
    val model = jurnalQur(d.rows, d.states, null, baj)
    val chiqarilgan = chiqarilganlarOl(d.rows, d.states, baj)
    val summalar = bolimSummalari(d.rows, d.states, chiqarilgan, svod)
    return BajarilishTahlili(jurnalXulosa(model.bolimlar, model.bolimIshlari), obyektUlushi(model.bolimlar) { id -> bolimMaxraji(summalar[id]) })
}

/** "usul" text key of the site: how the object share was weighed. */
fun tahlilUsulMatnKalit(u: ObyektUlushi): String = when (u.usul) {
    "summa" -> "bo‘limlar smeta summasi bo‘yicha tortilgan"
    "ish" -> "bo‘limlardagi ishlar soni bo‘yicha tortilgan (smeta summasi to‘liq emas)"
    else -> "smeta hajmi yo‘q — hisoblab bo‘lmaydi"
}
