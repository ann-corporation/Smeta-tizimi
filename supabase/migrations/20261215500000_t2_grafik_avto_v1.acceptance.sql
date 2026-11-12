-- Acceptance 20261215500000 (BEGIN..ROLLBACK; hech narsa saqlanmaydi). Oldin forward migratsiya qo'llangan bo'lishi kerak.
begin;
set local statement_timeout = '300s';

do $$
declare
  v_o record; v_actor bigint; v_j jsonb; v_r jsonb; v_sum numeric; v_n int; v_rz bigint; v_ok boolean := false;
begin
  -- 1. Jadval, funksiyalar, resurs
  if to_regclass('public.t2_grafik_sozlama') is null then raise exception 'ACC: t2_grafik_sozlama yo''q'; end if;
  if to_regprocedure('public.t2_grafik_reja_v1(bigint,bigint,bigint)') is null
     or to_regprocedure('public.t2_tomon_grafik_v1(bigint,bigint,bigint,bigint)') is null
     or to_regprocedure('public.t2_grafik_sozlama_saqla_v1(bigint,bigint,bigint,bigint,integer,numeric,date,integer,integer,boolean)') is null then
    raise exception 'ACC: RPC yo''q';
  end if;
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'grafik' and faol) then raise exception 'ACC: grafik resursi faol emas'; end if;

  -- 2. Obyekt (eng ko'p qatorlisi emas - birinchi smetali kichik obyekt, vaqt chegarasi uchun)
  select o.id, o.kompaniya_id into v_o from public.t2_obyekt o
   where exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'rz') order by o.id limit 1;
  if v_o.id is null then raise notice 'ACC: smetali obyekt yo''q - 2..5 o''tkazib yuborildi'; return; end if;

  v_j := public._t2_grafik_json_v1(v_o.id);
  if jsonb_typeof(v_j->'razdellar') <> 'array' or jsonb_array_length(v_j->'razdellar') < 1 then raise exception 'ACC: razdellar bo''sh'; end if;
  if v_j->'paket_smeta' is null then raise exception 'ACC: smeta paketi yo''q'; end if;
  -- Mehnat soati: ОЈ razdel chel_soat == paket.soat.chel (yagona yadro bilan 1 chel-soat aniqlikda)
  select coalesce(sum((e->>'chel_soat')::numeric), 0) into v_sum from jsonb_array_elements(v_j->'razdellar') e;
  if v_j->'paket_smeta'->'soat'->>'chel' is not null
     and abs(v_sum - (v_j->'paket_smeta'->'soat'->>'chel')::numeric) > 1 then
    raise exception 'ACC: chel-soat yadro bilan mos emas % vs %', v_sum, v_j->'paket_smeta'->'soat'->>'chel';
  end if;

  -- 3. A'zo bo'lmagan actor rad etiladi
  begin
    perform public.t2_grafik_reja_v1(-1, v_o.kompaniya_id, v_o.id);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'ACC: begona actor rad etilmadi'; end if;

  -- 4. Yozish: superadmin bo'lsa override yaratadi, versiya oshadi, eski versiya rad etiladi, tozalanadi
  select u.id into v_actor from public.t2_foydalanuvchi u where u.holat = 'faol' and public.t2_platforma_superadmin(u.id) limit 1;
  if v_actor is null then raise notice 'ACC: superadmin yo''q - yozish tekshiruvi o''tkazib yuborildi'; return; end if;
  select (e->>'id')::bigint into v_rz from jsonb_array_elements(v_j->'razdellar') e limit 1;

  v_r := public.t2_grafik_sozlama_saqla_v1(v_actor, v_o.kompaniya_id, v_o.id, v_rz, 12, 8, date '2030-01-01', null, null);
  if (v_r->>'ok')::boolean is not true or (v_r->>'versiya')::int <> 1 then raise exception 'ACC: yaratish %', v_r; end if;
  v_r := public.t2_grafik_sozlama_saqla_v1(v_actor, v_o.kompaniya_id, v_o.id, v_rz, 15, 8, date '2030-01-01', null, 1);
  if (v_r->>'ok')::boolean is not true or (v_r->>'versiya')::int <> 2 then raise exception 'ACC: yangilash %', v_r; end if;
  v_r := public.t2_grafik_sozlama_saqla_v1(v_actor, v_o.kompaniya_id, v_o.id, v_rz, 20, 8, null, null, 1);
  if v_r->>'code' is distinct from 'VERSIYA_ESKI' then raise exception 'ACC: eski versiya o''tib ketdi %', v_r; end if;
  v_j := public.t2_grafik_reja_v1(v_actor, v_o.kompaniya_id, v_o.id);
  select count(*) into v_n from jsonb_array_elements(v_j->'sozlama') e where (e->>'razdel_id')::bigint = v_rz and (e->>'brigada')::int = 15;
  if v_n <> 1 then raise exception 'ACC: override o''qilmadi'; end if;
  v_r := public.t2_grafik_sozlama_saqla_v1(v_actor, v_o.kompaniya_id, v_o.id, v_rz, null, null, null, null, 2, true);
  if (v_r->>'ok')::boolean is not true then raise exception 'ACC: tozalash %', v_r; end if;

  -- 5. Begona razdel_id rad etiladi
  v_ok := false;
  begin
    perform public.t2_grafik_sozlama_saqla_v1(v_actor, v_o.kompaniya_id, v_o.id, 999999999, 5, 8, null, null, null);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'ACC: begona razdel qabul qilindi'; end if;

  -- 6. Tomon ko'rinishi grantsiz rad etiladi
  v_ok := false;
  begin
    perform public.t2_tomon_grafik_v1(v_actor, v_o.kompaniya_id, v_o.kompaniya_id, v_o.id);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'ACC: grantsiz tomon ko''rinishi ochildi'; end if;
end $$;

rollback;
