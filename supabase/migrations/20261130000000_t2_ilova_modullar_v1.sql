-- T2-EKOTIZIM-ILOVALAR-001 (P1): ilovalar modeli - kompaniya o'ziga kerak ILOVALARNI yoqadi, o'chirilgan ilova menyuda
-- ko'rinmaydi va serverda amallari rad etiladi (ILOVA_YOQILMAGAN). Yangi JADVAL YO'Q: mavjud t2_capability (turi='module')
-- + t2_capability_override (scope='company') + t2_modul_holat_v1 ishlatiladi (20261106730000_t2_modul_katalog_v1).
-- FAQAT MA'LUMOT: 7 ta yangi modul kodi. Sukut 'on' - hech bir mavjud kompaniya hech narsani yo'qotmaydi.
-- PTO yadrosi (obyekt, smeta, narx, fakt, F2, nakopitelniy, M-29) va Yadro (kompaniya, tokenlar) modul EMAS - doim yoqiq.
-- Hujjat: docs/architecture/EKOTIZIM_ILOVALAR_V1.md (B bo'lim). Qaytarish: .rollback.sql
begin;

insert into public.t2_capability (kod, nom, izoh, turi, default_holat, owner_domain, kill_switch, versiya) values
  ('module.moliya',    'Moliya',              'Moliya, shartnoma liniyasi, qarzdorlik, kontragentlar (buxgalteriya)', 'module', 'on', 'modul', false, 1),
  ('module.sotuv',     'Uy sotish',           'Ko''chmas mulk sotuvi: shaxmatka, bron, bitim, to''lov grafigi', 'module', 'on', 'modul', false, 1),
  ('module.xarid',     'Xarid va tender',     'Zayavkalar, tender, birja, taklif va baholash', 'module', 'on', 'modul', false, 1),
  ('module.hr',        'Kadrlar va KPI',      'Xodimlar, tabel, texnika va mexanizmlar', 'module', 'on', 'modul', false, 1),
  ('module.logistika', 'Logistika va ombor',  'Ta''minot, sklad, reys, mashina va haydovchilar', 'module', 'on', 'modul', false, 1),
  ('module.hujjat',    'Hujjat aylanishi',    'Hujjatlar, AOSR, laboratoriya, tomonlar va buyurtmachi kabineti', 'module', 'on', 'modul', false, 1),
  ('module.desktop',   'Desktop (oflayn)',    'Windows ilovasi va oflayn obyekt paketi', 'module', 'on', 'modul', false, 1)
on conflict (kod) do nothing;

commit;