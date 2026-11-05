-- T2 ZAMENA STORNO NETTO v1 (egasi 2026-11-05, pereraschet: «storno qilingan zamena aslni qulflab turibdi»).
--
-- ILDIZ SABAB: zamena (change_type='REPLACEMENT') aslni o'z PROGRESSI bo'yicha yopadi:
--   progress = greatest(tasdiqlangan F2 ning ISHORALI yig'indisi, fakt)   (t2_zamena_qoplash.progress_hajm).
-- Tasdiqlangan storno o'zini allaqachon o'chiradi (yig'indi ishorali). Lekin pereraschet oqimida storno avval
-- QORALAMA bo'ladi: egasi shu paytda faktni to'g'rilaydi va asl qatorga fakt % qo'yadi. Qoralamadagi storno
-- hisobga olinmagani uchun eski F2 (zamena 40) hamon «olingan» — asl qator 40 ga yopiq qoladi, % qo'yib bo'lmaydi.
--
-- QOIDA (zamena «kuchda»ligi; frontend: lib/zamena-qoldiq.ts `zamenaProgress` bilan AYNAN bir xil):
--   sof F2 = tasdiqlangan F2 qatorlari (ishorali)
--          + faol F2 qoralamalaridagi STORNO qatorlari (raw_snapshot->>'source' = 'storno'; akt bekor/rad emas,
--            lifecycle cancelled/rejected/superseded emas);
--   progress = greatest(sof F2, fakt).
--   => zamena to'liq stornolangan va fakti 0/NULL bo'lsa progress 0, asl to'liq hajmiga qaytadi; fakti bor zamena kuchda;
--      hech bajarilmagan rejali zamena aslni yopmaydi (2026-10-24 qarori o'zgarmaydi).
-- Faqat HISOBLANGAN qatlam: asl smeta, tasdiqlangan F2 va t2_qator_holat.f2_hajm (yuridik «olingan») O'ZGARMAYDI.
-- Storno qoralamasi bekor qilinsa — yopish avtomatik qaytadi (hosila holat).
-- Usul: joriy (prod) view ta'rifidan replace(); langar aynan 1 marta topilmasa EXCEPTION (jim o'tmaydi).
-- Ustunlar, ruxsatlar va izoh o'zgarmaydi (create or replace view).
begin;

do $do$
declare d text; n text;
  eski constant text := 'FILTER (WHERE a.tur = ''f2''::text AND a.holat = ''tasdiqlangan''::text)';
  yangi constant text := 'FILTER (WHERE a.tur = ''f2''::text AND (a.holat = ''tasdiqlangan''::text OR (a.holat <> ALL (ARRAY[''bekor''::text, ''rad''::text]) AND COALESCE(a.lifecycle_status, ''draft''::text) <> ALL (ARRAY[''cancelled''::text, ''rejected''::text, ''superseded''::text]) AND (aq.raw_snapshot ->> ''source''::text) = ''storno''::text)))';
begin
  d := pg_get_viewdef('public.t2_zamena_qoplash'::regclass, true);
  if position('raw_snapshot' in d) > 0 then raise exception 'ZAMENA_STORNO: view allaqachon yangilangan'; end if;
  if (length(d) - length(replace(d, eski, ''))) / length(eski) <> 1 then
    raise exception 'ZAMENA_STORNO: t2_zamena_qoplash F2 progress langari aynan 1 marta topilmadi (ta''rif o''zgargan)';
  end if;
  n := replace(d, eski, yangi);
  execute 'create or replace view public.t2_zamena_qoplash as ' || n;
end $do$;

commit;
