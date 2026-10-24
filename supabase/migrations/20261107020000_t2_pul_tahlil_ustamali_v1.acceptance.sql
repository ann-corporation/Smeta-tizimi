-- Acceptance: 20261107020000 — t2_pul_tahlil_v1 (ustamali): P0 orakul + ustamali tekshiruvlar (Nakopitelniy jamiga tiyinigacha mos), kesimlar yig'indisi, scope, ruxsat. BEGIN … ROLLBACK.
begin;
do $acc$
declare v_k bigint; v_o bigint; v_a bigint; r jsonb; n jsonb; v_sum numeric; v_sum_f numeric; v_sh bigint; v_obs bigint[]; v_komp_sum numeric := 0; v_i bigint; rr jsonb;
begin
  select o.kompaniya_id, o.id, z.foydalanuvchi_id into v_k, v_o, v_a
    from public.t2_obyekt o join public.t2_azolik z on z.kompaniya_id = o.kompaniya_id and z.holat = 'faol'
   where exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan')
     and public.t2_platforma_superadmin(z.foydalanuvchi_id)
   limit 1;
  if v_k is null then
    select id into v_a from public.t2_foydalanuvchi where holat = 'faol' and public.t2_platforma_superadmin(id) limit 1;
    select o.kompaniya_id, o.id into v_k, v_o from public.t2_obyekt o
     where exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan') limit 1;
  end if;
  if v_k is null or v_a is null then raise notice 'tasdiqlangan F2 yo''q — tekshiruv o''tkazib yuborildi'; return; end if;

  -- 1) ORAKUL: har obyekt uchun Nakopitelniy jami bilan aynan teng
  for v_i in select distinct a.obyekt_id from public.t2_akt a join public.t2_obyekt o on o.id = a.obyekt_id
              where o.kompaniya_id = v_k and a.tur = 'f2' and a.holat = 'tasdiqlangan' limit 10 loop
    n := public.t2_nakopitelniy_v2(v_i, v_a, null, 1, true, 0);
    r := public.t2_pul_tahlil_v1(v_k, v_a, v_i, null, ((n->>'davr') || '-01')::date);
    if r->>'ok' <> 'true' then raise exception 'ok emas: %', r; end if;
    if (r->'jami'->>'f2_yopilgan')::numeric <> (n->'jami'->>'jami_tasdiqlangan_summa')::numeric then
      raise exception 'ORAKUL: F2 farq obyekt %: % vs %', v_i, r->'jami'->>'f2_yopilgan', n->'jami'->>'jami_tasdiqlangan_summa'; end if;
    if (r->'jami'->>'smeta_ustamasiz')::numeric <> (n->'jami'->>'smeta_summa')::numeric then
      raise exception 'ORAKUL: smeta farq obyekt %', v_i; end if;
    if (r->'jami'->>'f2_nomalum')::int <> (n->'jami'->>'f2_summa_nomalum')::int then raise exception 'ORAKUL: f2_nomalum farq obyekt %', v_i; end if;
    -- 2) kesimlar (МАТ ichki qatorlarisiz) yig'indisi == jami
    select sum((x->>'f2_yopilgan')::numeric), sum((x->>'smeta_ustamasiz')::numeric) into v_sum_f, v_sum
      from jsonb_array_elements(r->'kesimlar') x where x->>'ota' is null and x->>'kat' not in ('SUB','OTK');
    if v_sum_f <> (r->'jami'->>'f2_yopilgan')::numeric or v_sum <> (r->'jami'->>'smeta_ustamasiz')::numeric then
      raise exception 'kesimlar yig''indisi jamiga teng emas obyekt %', v_i; end if;
    -- 3) NULL <> 0: xarajat noma'lum, farq/foiz null
    if r->'jami'->'xarajat' <> 'null'::jsonb or r->'jami'->'farq' <> 'null'::jsonb or r->'jami'->'farq_foiz' <> 'null'::jsonb then raise exception 'xarajat 0 bo''lib qoldi'; end if;
    if exists (select 1 from jsonb_array_elements(r->'kesimlar') x where x->>'kat' in ('SUB','OTK') and x->>'xarajat_holat' <> 'hisoblanmagan') then raise exception 'SUB/OTK belgisi'; end if;
    -- 4) zanjir = t2_obyekt_nakrutka_v1 natijasi
    if (r->'zanjir'->'obyektlar'->0->'nakrutka') is distinct from (public.t2_obyekt_nakrutka_v1(v_i, v_a, null)->'nakrutka') then raise exception 'zanjir manbadan farq qiladi'; end if;
    -- 4b) USTAMALI: kesimlar (МАТ ichki qatorlarisiz, KATSIZ'siz) yig'indisi == jami (yaxlitlash <= 0.05 so'm/kesim); jami == zanjir
    select sum((x->'smeta_ustamali'->>'vsego')::numeric), sum((x->'f2_ustamali'->>'vsego')::numeric) into v_sum, v_sum_f
      from jsonb_array_elements(r->'kesimlar') x where x->>'ota' is null and x->>'kat' not in ('SUB','OTK','KATSIZ');
    if abs(v_sum - (r->'zanjir'->'jami'->>'vsego')::numeric) > 0.05 then raise exception 'smeta ustamali kesimlar <> zanjir obyekt %: % vs %', v_i, v_sum, r->'zanjir'->'jami'->>'vsego'; end if;
    if abs(v_sum_f - (r->'zanjir'->'f2_jami'->>'vsego')::numeric) > 0.05 then raise exception 'F2 ustamali kesimlar <> zanjir obyekt %: % vs %', v_i, v_sum_f, r->'zanjir'->'f2_jami'->>'vsego'; end if;
    if (r->'jami'->'smeta_ustamali'->>'vsego')::numeric <> (r->'zanjir'->'jami'->>'vsego')::numeric then raise exception 'jami smeta ustamali <> zanjir'; end if;
    if (r->'zanjir'->'jami'->>'vsego')::numeric <> (public.t2_obyekt_nakrutka_v1(v_i, v_a, null)->'nakrutka'->>'vsego')::numeric then raise exception 'smeta vsego manbadan farq qiladi'; end if;
    v_komp_sum := v_komp_sum + (r->'jami'->>'f2_yopilgan')::numeric;
  end loop;

  -- 5) dalil qatorlari
  r := public.t2_pul_tahlil_v1(v_k, v_a, v_o, null, null, null, 'МАТ');
  if jsonb_typeof(r->'dalil') <> 'array' then raise exception 'dalil massiv emas'; end if;

  -- 6) scope: begona obyekt va shartnoma rad etiladi
  r := public.t2_pul_tahlil_v1(v_k, v_a, -1, null);
  if r->>'code' <> 'OBYEKT_SCOPE_MISMATCH' then raise exception 'begona obyekt o''tdi: %', r; end if;
  r := public.t2_pul_tahlil_v1(v_k, v_a, null, -1);
  if r->>'code' <> 'SHARTNOMA_SCOPE_MISMATCH' then raise exception 'begona shartnoma o''tdi: %', r; end if;

  -- 7) shartnoma bo'yicha jami = uning obyektlari yig'indisi
  select b.shartnoma_id into v_sh from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
   where b.holat = 'faol' and s.kompaniya_id = v_k limit 1;
  if v_sh is not null then
    r := public.t2_pul_tahlil_v1(v_k, v_a, null, v_sh);
    select array_agg(b.obyekt_id) into v_obs from public.t2_shartnoma_bog b where b.shartnoma_id = v_sh and b.holat = 'faol';
    select sum((public.t2_pul_tahlil_v1(v_k, v_a, x, null)->'jami'->>'f2_yopilgan')::numeric) into v_sum from unnest(v_obs) x;
    if (r->'jami'->>'f2_yopilgan')::numeric <> v_sum then raise exception 'shartnoma jami <> obyektlar yig''indisi'; end if;
  end if;

  -- 8) begona actor rad etiladi
  begin
    perform public.t2_pul_tahlil_v1(v_k, -1, v_o, null);
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
end $acc$;
rollback;