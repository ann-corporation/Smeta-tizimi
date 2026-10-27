-- Qabul (BEGIN..ROLLBACK): migratsiyani qo'llab, jadval/funksiyalar, ruxsatlar va hisoblangan ko'rsatkichlarning NULL tarqalishini tekshiradi.
begin;
\i 20261113800000_t2_moliya_tahlil_v1.sql
do $t$
declare v_komp bigint; v_actor bigint; r jsonb; v_k jsonb;
begin
  if to_regclass('public.t2_moliya_qolda') is null then raise exception 'ACCEPT_FAIL: jadval yo''q'; end if;
  if to_regprocedure('public.t2_moliya_tahlil_v1(bigint,bigint,bigint)') is null then raise exception 'ACCEPT_FAIL: o''qish funksiyasi yo''q'; end if;
  if to_regprocedure('public.t2_moliya_qolda_yoz_v1(bigint,bigint,bigint,text,numeric,date,text,uuid)') is null then raise exception 'ACCEPT_FAIL: yozish funksiyasi yo''q'; end if;
  if has_function_privilege('anon','public.t2_moliya_tahlil_v1(bigint,bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: anon ruxsati'; end if;
  if has_function_privilege('authenticated','public.t2_moliya_qolda_yoz_v1(bigint,bigint,bigint,text,numeric,date,text,uuid)','execute') then raise exception 'ACCEPT_FAIL: authenticated ruxsati'; end if;
  if not has_function_privilege('service_role','public.t2_moliya_tahlil_v1(bigint,bigint,bigint)','execute') then raise exception 'ACCEPT_FAIL: service_role yo''q'; end if;
  if has_table_privilege('anon','public.t2_moliya_qolda','select') then raise exception 'ACCEPT_FAIL: jadval anon ga ochiq'; end if;

  -- Boss a'zo bo'lgan biror kompaniyada: qarz kiritilmaguncha 10/12/13/14/16 noma'lum (null), 0 emas.
  select a.kompaniya_id, a.foydalanuvchi_id into v_komp, v_actor from public.t2_azolik a where a.rol = 'boss' and a.holat = 'faol' order by a.id limit 1;
  if v_komp is null then raise notice 'boss a''zo topilmadi — funksional qism o''tkazib yuborildi'; return; end if;
  delete from public.t2_moliya_qolda where kompaniya_id = v_komp; -- tranzaksiya ichida (rollback)
  r := public.t2_moliya_tahlil_v1(v_komp, v_actor, null);
  if r->>'ok' <> 'true' or jsonb_array_length(r->'korsatkichlar') <> 16 then raise exception 'ACCEPT_FAIL: 16 ko''rsatkich yo''q: %', r; end if;
  select x into v_k from jsonb_array_elements(r->'korsatkichlar') x where x->>'kod' = 'umumiy_sarf';
  if v_k->'qiymat' <> 'null'::jsonb then raise exception 'ACCEPT_FAIL: qarz noma''lum, lekin 10 hisoblandi: %', v_k; end if;

  -- Qo'lda kiritish → manba 'qolda', almashtirish → bitta faol, null → bekor
  r := public.t2_moliya_qolda_yoz_v1(v_komp, v_actor, null, 'qarz', 100, current_date, 'test', gen_random_uuid());
  r := public.t2_moliya_qolda_yoz_v1(v_komp, v_actor, null, 'qarz', 200, current_date, 'test2', gen_random_uuid());
  if (select count(*) from public.t2_moliya_qolda where kompaniya_id = v_komp and kod = 'qarz' and holat = 'faol') <> 1 then raise exception 'ACCEPT_FAIL: faol yozuv bitta emas'; end if;
  r := public.t2_moliya_tahlil_v1(v_komp, v_actor, null);
  select x into v_k from jsonb_array_elements(r->'korsatkichlar') x where x->>'kod' = 'qarz';
  if (v_k->>'qiymat')::numeric <> 200 or v_k->>'manba' <> 'qolda' then raise exception 'ACCEPT_FAIL: qo''lda qarz: %', v_k; end if;
  r := public.t2_moliya_qolda_yoz_v1(v_komp, v_actor, null, 'qarz', null, current_date, null, gen_random_uuid());
  if exists (select 1 from public.t2_moliya_qolda where kompaniya_id = v_komp and kod = 'qarz' and holat = 'faol') then raise exception 'ACCEPT_FAIL: bekor ishlamadi'; end if;
  r := public.t2_moliya_qolda_yoz_v1(v_komp, v_actor, null, 'boshqa', 1, current_date, null, gen_random_uuid());
  if r->>'code' <> 'KOD_INVALID' then raise exception 'ACCEPT_FAIL: noto''g''ri kod qabul qilindi'; end if;
end $t$;
rollback;
