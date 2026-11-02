-- Qabul (BEGIN..ROLLBACK, o'zi ma'lumot yaratadi — sintetik obyekt; prod ma'lumotiga yozuv qolmaydi).
-- Avval asosiy migratsiya qo'llangan bo'lishi kerak (shu tranzaksiyada yoki prodda).
-- Tekshiradi: ruxsatlar; summa paketi = t2_obyekt_nakrutka view (belgisiz va svod/subpudrat belgisi bilan);
-- Σ kesim = прямые; subpudrat ustamasiz; ichma-ich belgi rad; _t2_f2_ustamali eski kalitlari; rahbar paneli shakli va NULL ≠ 0.
begin;
do $t$
declare
  v_komp bigint; v_actor bigint; v_ob bigint; q_bl bigint; q_sub bigint; q_rz bigint; v_akt bigint;
  p jsonb; r jsonb; v record; s numeric; v_tolov_soni int;
begin
  -- 1. Obyektlar va ruxsatlar
  if to_regprocedure('public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)') is null then raise exception 'ACCEPT_FAIL: t2_rahbar_panel_v1 yo''q'; end if;
  if to_regprocedure('public.t2_ustamasiz_belgila_v1(bigint,bigint,bigint,text,bigint,text,text,jsonb,uuid)') is null then raise exception 'ACCEPT_FAIL: belgila yo''q'; end if;
  if to_regprocedure('public._t2_summa_paket_v1(bigint[],text,bigint[],date,date)') is null then raise exception 'ACCEPT_FAIL: paket yo''q'; end if;
  if has_function_privilege('anon', 'public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_ustamasiz_belgila_v1(bigint,bigint,bigint,text,bigint,text,text,jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public._t2_summa_paket_v1(bigint[],text,bigint[],date,date)', 'execute') then
    raise exception 'ACCEPT_FAIL: anon/authenticated ruxsati bor';
  end if;
  if not has_function_privilege('service_role', 'public.t2_rahbar_panel_v1(bigint,bigint,date,date,bigint)', 'execute') then raise exception 'ACCEPT_FAIL: service_role yo''q'; end if;
  if exists (select 1 from public.t2_svod_yaxlit where turi is distinct from 'svod' and svod_summa is not null) then raise exception 'ACCEPT_FAIL: turi/svod_summa'; end if;

  select a.kompaniya_id, a.foydalanuvchi_id into v_komp, v_actor
    from public.t2_azolik a where a.rol = 'boss' and a.holat = 'faol' order by a.id limit 1;
  if v_komp is null then raise notice 'boss a''zo topilmadi — funksional qism o''tkazib yuborildi'; return; end if;

  -- 2. Sintetik obyekt: oddiy blok, subpudrat bo'ladigan blok, svod bo'limi
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACCEPT rahbar panel (sintetik)', v_komp) returning id into v_ob;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_ob, v_komp, 'bl', 'blok') returning id into q_bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx, summa) values
    (v_ob, v_komp, q_bl, 'rs', 'ЧЕЛ', 'ish', 'ЧЕЛ.-Ч', 10, 10, 100),
    (v_ob, v_komp, q_bl, 'rs', 'МАШ', 'kran', 'МАШ-Ч', 5, 40, 200),
    (v_ob, v_komp, q_bl, 'mat', 'МАТ', 'beton', 'м3', 3, 100, 300),
    (v_ob, v_komp, q_bl, 'ob', 'ОБ', 'nasos', 'шт', 1, 400, 400);
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_ob, v_komp, 'bl', 'haykal') returning id into q_sub;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx, summa) values
    (v_ob, v_komp, q_sub, 'rs', 'ЧЕЛ', 'haykaltarosh', 'ЧЕЛ.-Ч', 5, 10, 50),
    (v_ob, v_komp, q_sub, 'mat', 'МАТ', 'bronza', 'кг', 1, 70, 70);
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_ob, v_komp, 'rz', 'svod bo''limi') returning id into q_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kat, nom, birlik, hajm, narx, summa) values
    (v_ob, v_komp, q_rz, 'rs', 'ЧЕЛ', 'svod ishi', 'ЧЕЛ.-Ч', 1, 500, 500);

  -- 3. Belgisiz: paket = view; Σ kesim = прямые; soat
  select x.paket into p from public._t2_summa_paket_v1(array[v_ob], 'smeta') x;
  select * into v from public.t2_obyekt_nakrutka where obyekt_id = v_ob;
  if (p->>'qqs_bilan')::numeric <> v.vsego or (p->>'ustamali')::numeric <> v.itogo4 then
    raise exception 'ACCEPT_FAIL: paket ≠ view (belgisiz): % / % %', p->>'qqs_bilan', v.vsego, v.itogo4;
  end if;
  select sum(value::numeric) into s from jsonb_each_text(p->'kesim');
  if s <> (p->>'ustamasiz')::numeric or s <> 1620 then raise exception 'ACCEPT_FAIL: Σ kesim % ≠ прямые %', s, p->>'ustamasiz'; end if;
  if (p->'soat'->>'chel')::numeric <> 16 or (p->'soat'->>'mash')::numeric <> 5 then raise exception 'ACCEPT_FAIL: soat %', p->'soat'; end if;

  -- 4. Svod (svod summasi bilan) + subpudrat: hali ham paket = view; ustamasiz qism = 560/1.12 + 120
  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, svod_summa, qqs_stavka, dalil, sabab)
  values (v_komp, v_ob, q_rz, 560, 12, '{"test": true}', 'acceptance');
  r := public.t2_ustamasiz_belgila_v1(v_komp, v_actor, q_sub, 'subpudrat', null, 'Sintetik subpudratchi', 'acceptance', null, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: subpudrat belgilanmadi: %', r; end if;
  r := public.t2_ustamasiz_belgila_v1(v_komp, v_actor, (select id from public.t2_qator where ota_id = q_sub limit 1), 'ustamasiz', null, null, 'acceptance', null, gen_random_uuid());
  if r->>'code' <> 'ICHMA_ICH_BELGI' then raise exception 'ACCEPT_FAIL: ichma-ich belgi rad etilmadi: %', r; end if;
  r := public.t2_ustamasiz_belgila_v1(v_komp, v_actor, q_bl, 'subpudrat', null, null, 'acceptance', null, gen_random_uuid());
  if r->>'code' <> 'KONTRAGENT_REQUIRED' then raise exception 'ACCEPT_FAIL: kontragentsiz subpudrat: %', r; end if;
  select x.paket into p from public._t2_summa_paket_v1(array[v_ob], 'smeta') x;
  select * into v from public.t2_obyekt_nakrutka where obyekt_id = v_ob;
  if (p->>'qqs_bilan')::numeric <> v.vsego or (p->>'ustamali')::numeric <> v.itogo4 then
    raise exception 'ACCEPT_FAIL: paket ≠ view (belgili): % / % %', p->>'qqs_bilan', v.vsego, v.itogo4;
  end if;
  if (p->'kesim'->>'subpudrat')::numeric <> 120 or (p->'kesim'->>'svod')::numeric <> 500 or (p->>'ustamasiz_qism')::numeric <> 620 then
    raise exception 'ACCEPT_FAIL: kesim/ustamasiz qism: %', p;
  end if;
  if p->'subpudratchilar'->0->>'kontragent' <> 'Sintetik subpudratchi' then raise exception 'ACCEPT_FAIL: kontragent %', p->'subpudratchilar'; end if;

  -- 5. F2 (qoralama akt): _t2_f2_ustamali eski kalitlari + paket; subpudrat qatori ustamasiz
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, raqam, oy, holat) values (v_ob, v_komp, 'f2', 'ACCEPT-F2', date_trunc('month', current_date), 'qoralama')
  returning id into v_akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx)
  select v_akt, q.id, v_ob, v_komp, q.hajm, q.narx from public.t2_qator q where q.obyekt_id = v_ob and q.tur in ('rs', 'mat', 'ob');
  p := public._t2_f2_ustamali(v_komp, null, array[v_akt]);
  if not (p ? 'pryamye' and p ? 'katsiz' and p ? 'narxsiz_qator' and p ? 'ustamali' and p->'podval' ? 'vsego' and p ? 'paket') then
    raise exception 'ACCEPT_FAIL: _t2_f2_ustamali kalitlari: %', p;
  end if;
  if (p->>'pryamye')::numeric <> 1620 or (p->'paket'->'kesim'->>'subpudrat')::numeric <> 120 then raise exception 'ACCEPT_FAIL: F2 paket: %', p; end if;

  -- 6. Rahbar paneli: shakl; bitta obyekt kesimi; qoralama F2 tasdiq navbatida; to'lov yo'q → null (0 emas)
  r := public.t2_rahbar_panel_v1(v_komp, v_actor, null, null, v_ob);
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: panel: %', r; end if;
  if not (r->'kartalar' ? 'portfel' and r->'kartalar' ? 'bajarildi' and r->'kartalar' ? 'tolandi' and r->'kartalar' ? 'debitor'
          and r->'kartalar' ? 'kreditor' and r->'kartalar' ? 'rentabellik' and r ? 'pul_oqimi' and r ? 'obyektlar' and r ? 'diqqat'
          and r ? 'tasdiq_kutmoqda' and r ? 'signal_guruh') then
    raise exception 'ACCEPT_FAIL: panel kalitlari: %', (select array_agg(k) from jsonb_object_keys(r) k);
  end if;
  if jsonb_array_length(r->'obyektlar') <> 1 then raise exception 'ACCEPT_FAIL: obyekt kesimi'; end if;
  if (r->'obyektlar'->0->'smeta'->>'qqs_bilan')::numeric <> v.vsego then raise exception 'ACCEPT_FAIL: obyekt smeta ≠ view'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'tasdiq_kutmoqda') e where (e->>'id')::bigint = v_akt) then
    raise exception 'ACCEPT_FAIL: qoralama F2 tasdiq navbatida yo''q';
  end if;
  if (r->'f2_qoralama'->>'qqs_bilan')::numeric <> (p->'paket'->>'qqs_bilan')::numeric then raise exception 'ACCEPT_FAIL: qoralama paket'; end if;
  if r->'kartalar'->'tolandi'->'jami' <> 'null'::jsonb or r->'kartalar'->'debitor'->'qiymat' <> 'null'::jsonb
     or r->'kartalar'->'kreditor'->'qiymat' <> 'null'::jsonb or r->'kartalar'->'rentabellik'->'tannarx' <> 'null'::jsonb then
    raise exception 'ACCEPT_FAIL: kiritilmagan qiymat 0 bo''lib chiqdi: %', r->'kartalar';
  end if;
  r := public.t2_rahbar_panel_v1(v_komp, v_actor, date '2026-12-01', date '2026-01-01', null);
  if r->>'code' <> 'DAVR_NOTOGRI' then raise exception 'ACCEPT_FAIL: davr tekshiruvi: %', r; end if;

  -- 7. Kompaniya kesimi (haqiqiy ma'lumot, faqat shakl): Bajarildi = obyekt F2 paketlari yig'indisi
  r := public.t2_rahbar_panel_v1(v_komp, v_actor);
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: kompaniya paneli: %', r; end if;
  select round(sum((e->'f2'->>'qqs_bilan')::numeric), 2) into s from jsonb_array_elements(r->'obyektlar') e;
  if abs(coalesce(s, 0) - coalesce((r->'kartalar'->'bajarildi'->'jami'->>'qqs_bilan')::numeric, 0)) > 1 then
    raise exception 'ACCEPT_FAIL: Bajarildi ≠ Σ obyekt F2: % / %', s, r->'kartalar'->'bajarildi'->'jami'->>'qqs_bilan';
  end if;
  raise notice 'ACCEPT_OK rahbar_panel_v1';
end $t$;
rollback;
