-- Rollback: 20261203000300 — t2_qator_ota_jami_rollup_v1.
-- 1) Bir martalik tuzatish qaytariladi: faqat hozirgi summasi tuzatish qiymatiga teng qatorlar (keyin o'zgarganlari tegilmaydi).
-- 2) RPC patchlari olib tashlanadi; t2_rollup 20261115100000 ta'rifiga qaytadi; yordamchi funksiya va jadval o'chiriladi.
begin;

update public.t2_qator q set summa = t.eski_summa, yangilandi = now()
  from public.t2_qator_ota_jami_tuzatish_v1 t
 where q.id = t.qator_id and q.summa is not distinct from t.yangi_summa and q.summa is distinct from t.eski_summa;

do $rollback$
declare spec record; original text; patched text;
begin
  for spec in select * from (values
    ('t2_ish_abc_saqla_v1', '    perform public.t2_qator_ota_jami_yangila_v1(array[v_id]); -- ota_jami_rollup_v1' || chr(10)),
    ('t2_ish_abc_saqla_v1', '  perform public.t2_qator_ota_jami_yangila_v1(array[v_id] || v_ids); -- ota_jami_rollup_v1' || chr(10)),
    ('t2_ish_abc_ochir_ichki', '  if v_ota is not null then perform public.t2_qator_ota_jami_yangila_v1(array[v_ota]); end if; -- ota_jami_rollup_v1' || chr(10)),
    ('t2_fakt_smetadan_tashqari_v1', '  perform public.t2_qator_ota_jami_yangila_v1(array[v_qator_id] || v_res_ids); -- ota_jami_rollup_v1' || chr(10))
  ) as x(fn, qator) loop
    select pg_get_functiondef(p.oid) into strict original from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = spec.fn;
    if position(spec.qator in original) = 0 then continue; end if;
    patched := replace(original, spec.qator, '');
    execute patched;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname <> 't2_qator_ota_jami_yangila_v1'
                and pg_get_functiondef(p.oid) like '%t2_qator_ota_jami_yangila_v1%') then
    raise exception 'ROLLBACK_BLOCKED: t2_qator_ota_jami_yangila_v1 ni boshqa funksiya chaqiradi';
  end if;
end $rollback$;

CREATE OR REPLACE FUNCTION public.t2_rollup(p_obyekt_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_jami numeric; v_toliq boolean; v_miss int; v_yetim int;
begin
  perform t2_manba_belgila('rollup');

  update t2_qator b set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur='rs' and ota_id is not null
        group by ota_id) c
  where b.id = c.ota_id and b.tur = 'bl'
    and b.summa is distinct from c.jami;

  update t2_qator b set summa = null
  where b.obyekt_id = p_obyekt_id and b.tur='bl'
    and b.summa is not null
    and not exists (select 1 from t2_qator c where c.ota_id = b.id);

  /* ⚠️ 'rs' SHU YERDA QO'SHILDI — busiz rz ostidagi yakka resurs
     jimgina yo'qolardi. */
  update t2_qator r set summa = c.jami, yangilandi = now()
  from (select ota_id, sum(summa) jami from t2_qator
        where obyekt_id = p_obyekt_id and tur in ('bl','mat','ob','rs')
          and ota_id is not null
        group by ota_id) c
  where r.id = c.ota_id and r.tur = 'rz'
    and r.summa is distinct from c.jami;

  select sum(summa) into v_jami
  from t2_qator where obyekt_id = p_obyekt_id and tur = 'rz' and versiya_holat = 'faol';

  select count(*) into v_miss
  from t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob') and narx is null and versiya_holat = 'faol';

  /* ⚠️ YETIM QATOR NAZORATI: otasi yo'q (rz emas) qator jamiga
     KIRMAYDI. Soni javobda qaytadi — jim qolmasin. */
  select count(*) into v_yetim
  from t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur <> 'rz' and q.ota_id is null;

  v_toliq := (v_miss = 0);

  return jsonb_build_object('ok', true, 'jami', v_jami, 'toliq', v_toliq,
    'narxsiz_qator', v_miss, 'yetim_qator', v_yetim,
    'izoh', case when v_toliq then 'Barcha qator narxlangan — jami ishonchli.'
                 else v_miss || ' qatorda narx topilmadi. JAMI TO''LIQ EMAS — ' ||
                      'bu raqam ustida moliyaviy qaror qabul qilmang.' end ||
           case when v_yetim > 0 then ' ⚠️ ' || v_yetim ||
                     ' ta otasiz qator jamiga KIRMADI.' else '' end);
end $function$;

drop function if exists public.t2_qator_ota_jami_yangila_v1(bigint[]);
drop table if exists public.t2_qator_ota_jami_tuzatish_v1;

commit;
