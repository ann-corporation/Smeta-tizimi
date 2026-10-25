# DIZAYN-FIRUZA-V1 → Codex (T2-SMETACHI-RELIABILITY-20261009): smeta ekranlari bo'yicha taklif

Egasi 2026-10-25: «har bir smeta va F2 ni vizual ko'rib tushunish» — dizayn audit natijasi. Quyidagi fayllar sizning
qulfingizda, shuning uchun men TEGMADIM; tayyor qismlar yangi fayllarda:

**Tayyor (ulash uchun bir qator):**
- `frontend/src/components/smeta-hujjat/SmetaAnatomiya.tsx` — `<SmetaAnatomiya tree={tree} obyektId={obyektId} />`
  (`useT2Daraxt().tree`). Umumiy holat (smeta=100%: F2 / fakt / qoldiq chizig'i, SummaJuft), smeta tarkibi
  (ЧЕЛ/МАШ/МАТ/ОБ), bo'limlar kesimi, smetadan oshgan qatorlar. Hisob: `lib/smeta-korinish.ts` (+test).
  Taklif: `HolatNative.tsx` da smeta tabidagi `SmetaTree` ustiga qo'yish va hozirgi 3 xil jami (L332 strip,
  ObjectMoneySummary, ProjectNavigator) o'rniga shu bitta blok.

**SmetaTree.tsx bo'yicha takliflar (sizning qulfingiz tugagach — men qilishim mumkin):**
1. Sarlavha/kataklardagi kamalak ranglar (blue/purple/cyan/amber/emerald, `text-white`, `bg-black/40`, `#a855f7`)
   → Firuza tokenlari; ustun ma'nosi rang bilan emas, sarlavha matni bilan.
2. Razdel qatori alohida ko'rinish (`fz-row-rz`: surface-2 fon, qalin, oraliq jami), ish qatori `fz-row-bl`.
3. `kat` yuklanadi, lekin ko'rsatilmaydi → resurs qatorida `KatNishon`.
4. 4px vertikal progress o'rniga `fz-meter` (smeta=100%: F2 firuza + fakt lojuvard), oshganda sariq + foiz.
5. Standart preset TOLIQ (12 ustun, ~1900px) → ASOSIY; qisqartmalar (Sm. Vol, F2 M. Sum) to'liq yorliq + title.
6. Drawer'dagi bo'sh «F2 tarixi / Narx» tablari — yashirish yoki ulash.

**NakopitelniyVedomost.tsx:** `text-success` aniqlanmagan token (musbat qoldiq rangsiz chiqadi) → `text-ok`.

Yangi umumiy klasslar: `firuza.css` §6–7 (fz-table, fz-meter, fz-doc, fz-panel, fz-split, fz-bars, fz-check, fz-note, fz-chip, fz-kpis, fz-bolim).
