-- T2-MOLIYA-QARZDORLIK-001 (2/2) - Qarzdorlik RPC lari (security definer, a'zolik + financial.read/write).
--   t2_qarzdorlik_royxat_v1  - O'QISH: kontragent shartnomalari (asosiy=false) + asos qatorlari + hisoblangan qarz/farq.
--   t2_qarzdorlik_saqla_v1   - YOZISH: bitta shartnoma asoslari (qo'shish/tahrir/bekor) + spravka, bitta tranzaksiya, versiya CAS, operation_id.
--   t2_qarzdorlik_import_v1  - YOZISH: Excel importi (shablon / spravka formati): kontragent+shartnoma+asos, takrorsiz (operation_id + tabiiy kalit).
-- Hisob (yagona qoida, frontend lib/qarzdorlik/hisob.ts bilan bir xil):
--   qabul    = yetkazib_berish + bajarilgan_ish (qatorlari summa si; hammasi NULL bo'lsa NULL)
--   tolangan = tolov qatorlari (t2_tolov ga bog'lanmaganlari) + t2_tolov (qaytarim -) ; hammasi NULL bo'lsa NULL
--   qarz     = boshlangich_qoldiq + qabul - tolangan   (+ biz qarzmiz, - ular qarz / avans); uchala qism NULL bo'lsa NULL
--   farq     = qarz - spravka_qarz                     (ikkalasidan biri NULL bo'lsa NULL)
begin;

create or replace function public.t2_qarzdorlik_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb; v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  -- Kreditor qarzi ichki ma'lumot: buyurtmachi / prorab kabi rollar ko'rmaydi (financial.read ularda ham bor).
  if v_rol is null or v_rol not in ('admin', 'superadmin', 'boss', 'director', 'rahbar', 'pto', 'bugalter') then
    raise exception 'PERMISSION_DENIED: qarzdorlik' using errcode = '42501';
  end if;
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  with asos as (
    select a.shartnoma_id,
      sum(a.summa) filter (where a.tur = 'boshlangich_qoldiq') as boshlangich,
      sum(a.summa) filter (where a.tur = 'yetkazib_berish') as yetkazilgan,
      sum(a.summa) filter (where a.tur = 'bajarilgan_ish') as bajarilgan,
      sum(a.summa) filter (where a.tur = 'tolov' and a.tolov_id is null) as tolov_asos,
      count(*) filter (where a.summa is null) as noma_lumot,
      count(*) as soni,
      coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tur', a.tur, 'hujjat_raqam', a.hujjat_raqam, 'sana', a.sana, 'nomi', a.nomi,
        'birlik', a.birlik, 'hajm', a.hajm, 'narx', a.narx, 'summa', a.summa, 'izoh', a.izoh,
        'sklad_harakat_id', a.sklad_harakat_id, 'tolov_id', a.tolov_id, 'versiya', a.versiya) order by a.tartib, a.id), '[]'::jsonb) as qatorlar
      from public.t2_qarz_asos a
     where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol'
     group by a.shartnoma_id
  ), tl as (
    select t.shartnoma_id, sum(case when t.tur = 'qaytarim' then -t.summa else t.summa end) as tolov_t2
      from public.t2_tolov t where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' group by t.shartnoma_id
  ), x as (
    select s.*, ag.boshlangich, ag.yetkazilgan, ag.bajarilgan, ag.tolov_asos, tl.tolov_t2,
           coalesce(ag.noma_lumot, 0) as noma_lumot, coalesce(ag.soni, 0) as soni, coalesce(ag.qatorlar, '[]'::jsonb) as qatorlar,
           (select t.kontragent_id from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id order by t.tartib, t.id limit 1) as k_id,
           (select t.nom from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id order by t.tartib, t.id limit 1) as k_nom,
           (select t.inn from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id order by t.tartib, t.id limit 1) as k_inn,
           case when ag.yetkazilgan is null and ag.bajarilgan is null then null else coalesce(ag.yetkazilgan, 0) + coalesce(ag.bajarilgan, 0) end as qabul,
           case when ag.tolov_asos is null and tl.tolov_t2 is null then null else coalesce(ag.tolov_asos, 0) + coalesce(tl.tolov_t2, 0) end as tolangan
      from public.t2_shartnoma s
      left join asos ag on ag.shartnoma_id = s.id
      left join tl on tl.shartnoma_id = s.id
     where s.kompaniya_id = p_kompaniya_id and s.asosiy = false and s.holat <> 'bekor'
  ), y as (
    select x.*, case when x.boshlangich is null and x.qabul is null and x.tolangan is null then null
                     else coalesce(x.boshlangich, 0) + coalesce(x.qabul, 0) - coalesce(x.tolangan, 0) end as qarz
      from x
  )
  select jsonb_build_object('ok', true, 'generated_at', now(),
    'obyektlar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
                    from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'),
    'shartnomalar', coalesce(jsonb_agg(jsonb_build_object(
      'shartnoma_id', y.id, 'versiya', y.versiya, 'raqam', y.raqam, 'sana', y.sana, 'nom', y.nom, 'predmet', y.predmet, 'turi', y.turi,
      'holat', y.holat, 'izoh', y.izoh,
      'kontragent_id', y.k_id, 'kontragent', coalesce(y.k_nom, y.taraf), 'kontragent_inn', y.k_inn,
      'shartnoma_summa', y.jami_nds_bilan,
      'obyektlar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
                      from public.t2_shartnoma_qoshimcha_bog b join public.t2_obyekt o on o.id = b.obyekt_id
                     where b.shartnoma_id = y.id and b.holat = 'faol'),
      'boshlangich', y.boshlangich, 'yetkazilgan', y.yetkazilgan, 'bajarilgan', y.bajarilgan,
      'qabul', y.qabul, 'tolov_asos', y.tolov_asos, 'tolov_t2', y.tolov_t2, 'tolangan', y.tolangan,
      'qarz', y.qarz,
      'spravka_qarz', y.spravka_qarz, 'spravka_tolangan', y.spravka_tolangan, 'spravka_prognoz', y.spravka_prognoz, 'spravka_sana', y.spravka_sana,
      'farq', case when y.qarz is null or y.spravka_qarz is null then null else y.qarz - y.spravka_qarz end,
      'noma_lumot_qator', y.noma_lumot, 'qator_soni', y.soni, 'qatorlar', y.qatorlar
    ) order by coalesce(y.k_nom, y.taraf), y.raqam, y.id), '[]'::jsonb))
    into v_res
    from y;
  return v_res;
end $$;

create or replace function public.t2_qarzdorlik_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shartnoma_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_ochirilgan jsonb, p_spravka jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_sh public.t2_shartnoma%rowtype; v_q jsonb; v_i int := 0; v_id bigint; v_tur text; v_hajm numeric; v_narx numeric; v_summa numeric;
  v_sklad bigint; v_tolov bigint; v_res jsonb; v_n_yangi int := 0; v_n_tahrir int := 0; v_n_bekor int := 0; v_c int;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_qatorlar is not null and (jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 2000) then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_0_2000');
  end if;
  if p_ochirilgan is not null and (jsonb_typeof(p_ochirilgan) <> 'array' or jsonb_array_length(p_ochirilgan) > 2000) then
    return jsonb_build_object('ok', false, 'code', 'OCHIRILGAN_0_2000');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_qarzdorlik:' || p_shartnoma_id, 0));
  select * into v_sh from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
  if v_sh.asosiy then return jsonb_build_object('ok', false, 'code', 'ASOSIY_SHARTNOMA', 'xabar', 'Asosiy (buyurtmachi) shartnoma qarzdorlik moduliga tegishli emas.'); end if;
  if p_kutilgan_versiya is null or v_sh.versiya <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_sh.versiya);
  end if;

  for v_q in select value from jsonb_array_elements(coalesce(p_qatorlar, '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_tur := v_q->>'tur';
    if v_tur is null or v_tur not in ('yetkazib_berish', 'bajarilgan_ish', 'tolov', 'boshlangich_qoldiq') then
      raise exception 'ASOS_TUR_INVALID: % qator', v_i;
    end if;
    v_hajm := nullif(btrim(coalesce(v_q->>'hajm', '')), '')::numeric;
    v_narx := nullif(btrim(coalesce(v_q->>'narx', '')), '')::numeric;
    v_summa := nullif(btrim(coalesce(v_q->>'summa', '')), '')::numeric;
    if v_summa is null and v_hajm is not null and v_narx is not null then v_summa := round(v_hajm * v_narx, 2); end if;
    v_sklad := nullif(v_q->>'sklad_harakat_id', '')::bigint;
    if v_sklad is not null and not exists (select 1 from public.t2_sklad_harakat h where h.id = v_sklad and h.kompaniya_id = p_kompaniya_id) then
      raise exception 'SKLAD_NOT_FOUND: % qator', v_i;
    end if;
    v_tolov := nullif(v_q->>'tolov_id', '')::bigint;
    if v_tolov is not null and not exists (select 1 from public.t2_tolov t where t.id = v_tolov and t.kompaniya_id = p_kompaniya_id and t.shartnoma_id = p_shartnoma_id) then
      raise exception 'TOLOV_NOT_FOUND: % qator', v_i;
    end if;
    v_id := nullif(v_q->>'id', '')::bigint;
    if v_id is null then
      insert into public.t2_qarz_asos(kompaniya_id, shartnoma_id, tur, hujjat_raqam, sana, nomi, birlik, hajm, narx, summa, izoh, sklad_harakat_id, tolov_id, tartib, operation_id, kim)
      values (p_kompaniya_id, p_shartnoma_id, v_tur, nullif(btrim(coalesce(v_q->>'hujjat_raqam', '')), ''), nullif(v_q->>'sana', '')::date,
              nullif(btrim(coalesce(v_q->>'nomi', '')), ''), nullif(btrim(coalesce(v_q->>'birlik', '')), ''), v_hajm, v_narx, v_summa,
              nullif(btrim(coalesce(v_q->>'izoh', '')), ''), v_sklad, v_tolov, v_i, p_operation_id, 'actor:' || p_actor_id);
      v_n_yangi := v_n_yangi + 1;
    else
      update public.t2_qarz_asos set tur = v_tur, hujjat_raqam = nullif(btrim(coalesce(v_q->>'hujjat_raqam', '')), ''), sana = nullif(v_q->>'sana', '')::date,
             nomi = nullif(btrim(coalesce(v_q->>'nomi', '')), ''), birlik = nullif(btrim(coalesce(v_q->>'birlik', '')), ''), hajm = v_hajm, narx = v_narx, summa = v_summa,
             izoh = nullif(btrim(coalesce(v_q->>'izoh', '')), ''), sklad_harakat_id = v_sklad, tolov_id = v_tolov, tartib = v_i,
             versiya = versiya + 1, yangilandi = now(), kim = 'actor:' || p_actor_id
       where id = v_id and shartnoma_id = p_shartnoma_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
      get diagnostics v_c = row_count;
      if v_c = 0 then raise exception 'ASOS_NOT_FOUND: % qator (id %)', v_i, v_id; end if;
      v_n_tahrir := v_n_tahrir + 1;
    end if;
  end loop;

  if p_ochirilgan is not null and jsonb_array_length(p_ochirilgan) > 0 then
    update public.t2_qarz_asos set holat = 'bekor', versiya = versiya + 1, yangilandi = now(), kim = 'actor:' || p_actor_id
     where shartnoma_id = p_shartnoma_id and kompaniya_id = p_kompaniya_id and holat = 'faol'
       and id in (select (e)::bigint from jsonb_array_elements_text(p_ochirilgan) e);
    get diagnostics v_n_bekor = row_count;
  end if;

  if p_spravka is not null and jsonb_typeof(p_spravka) = 'object' then
    update public.t2_shartnoma set
      spravka_qarz = case when p_spravka ? 'qarz' then nullif(btrim(coalesce(p_spravka->>'qarz', '')), '')::numeric else spravka_qarz end,
      spravka_tolangan = case when p_spravka ? 'tolangan' then nullif(btrim(coalesce(p_spravka->>'tolangan', '')), '')::numeric else spravka_tolangan end,
      spravka_prognoz = case when p_spravka ? 'prognoz' then nullif(btrim(coalesce(p_spravka->>'prognoz', '')), '')::numeric else spravka_prognoz end,
      spravka_sana = case when p_spravka ? 'sana' then nullif(p_spravka->>'sana', '')::date else spravka_sana end
     where id = p_shartnoma_id;
  end if;

  update public.t2_shartnoma set versiya = versiya + 1, yangilandi = now() where id = p_shartnoma_id returning versiya into v_c;
  perform public.t2_audit_yoz(p_kompaniya_id, 'qarz_asos_saqla', 'shartnoma', null,
    format('shartnoma=%s yangi=%s tahrir=%s bekor=%s', p_shartnoma_id, v_n_yangi, v_n_tahrir, v_n_bekor), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'versiya', v_c, 'yangi', v_n_yangi, 'tahrir', v_n_tahrir, 'bekor', v_n_bekor);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'qarzdorlik_saqla_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_qarzdorlik_import_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shartnomalar jsonb, p_obyekt_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; it jsonb; q jsonb; v_idx int := 0; v_qi int; v_jami_qator int := 0;
  v_nom text; v_inn text; v_turi text; v_raqam text; v_summa numeric; v_kid bigint; v_sid bigint; v_sh public.t2_shartnoma%rowtype;
  v_tur text; v_hajm numeric; v_narx numeric; v_qsumma numeric; v_sana date; v_hujjat text; v_qnomi text; v_rol text; v_sp jsonb;
  c_yangi int := 0; c_yangilandi int := 0; c_qator int := 0; c_takror int := 0; c_kontragent int := 0; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_shartnomalar is null or jsonb_typeof(p_shartnomalar) <> 'array' or jsonb_array_length(p_shartnomalar) = 0 or jsonb_array_length(p_shartnomalar) > 300 then
    return jsonb_build_object('ok', false, 'code', 'SHARTNOMALAR_1_300');
  end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_qarzdorlik_import:' || p_kompaniya_id, 0));

  for it in select value from jsonb_array_elements(p_shartnomalar) loop
    v_idx := v_idx + 1;
    v_nom := nullif(btrim(coalesce(it->>'kontragent', '')), '');
    v_raqam := nullif(btrim(coalesce(it->>'raqam', '')), '');
    if v_nom is null or v_raqam is null then raise exception 'IMPORT_INVALID: % shartnoma (kontragent va raqam majburiy)', v_idx; end if;
    v_inn := nullif(btrim(coalesce(it->>'inn', '')), '');
    v_turi := coalesce(nullif(btrim(coalesce(it->>'turi', '')), ''), 'postavshik');
    if v_turi not in ('postavshik', 'subpudrat', 'xizmat') then raise exception 'IMPORT_TURI_INVALID: % shartnoma', v_idx; end if;
    v_summa := nullif(btrim(coalesce(it->>'summa', '')), '')::numeric;
    v_qi := case when jsonb_typeof(it->'qatorlar') = 'array' then jsonb_array_length(it->'qatorlar') else 0 end;
    v_jami_qator := v_jami_qator + v_qi;
    if v_jami_qator > 5000 then raise exception 'IMPORT_QATORLAR_5000'; end if;

    -- Kontragent: INN bo'yicha, bo'lmasa nom bo'yicha; yo'q bo'lsa yaratiladi.
    v_kid := null;
    if v_inn is not null then select id into v_kid from public.t2_kontragent where kompaniya_id = p_kompaniya_id and inn = v_inn and holat = 'faol' limit 1; end if;
    if v_kid is null then select id into v_kid from public.t2_kontragent where kompaniya_id = p_kompaniya_id and holat = 'faol' and lower(btrim(nom)) = lower(v_nom) order by id limit 1; end if;
    if v_kid is null then
      insert into public.t2_kontragent(kompaniya_id, inn, nom, mavqe) values (p_kompaniya_id, v_inn, v_nom, case when v_turi = 'subpudrat' then 'subpudratchi' else 'taminotchi' end)
      returning id into v_kid;
      c_kontragent := c_kontragent + 1;
    end if;

    -- Shartnoma: (kompaniya, raqam) bo'yicha topiladi; asosiy shartnoma ustiga yozilmaydi.
    select * into v_sh from public.t2_shartnoma where kompaniya_id = p_kompaniya_id and raqam = v_raqam for update;
    if found then
      if v_sh.asosiy then raise exception 'ASOSIY_SHARTNOMA_BAND: % raqam asosiy shartnomada', v_raqam; end if;
      v_sid := v_sh.id;
      update public.t2_shartnoma set
        nom = coalesce(nullif(btrim(coalesce(it->>'nom', '')), ''), nom), predmet = coalesce(nullif(btrim(coalesce(it->>'predmet', '')), ''), predmet),
        turi = v_turi, sana = coalesce(nullif(it->>'sana', '')::date, sana), jami_nds_bilan = coalesce(v_summa, jami_nds_bilan),
        versiya = versiya + 1, yangilandi = now()
       where id = v_sid;
      c_yangilandi := c_yangilandi + 1;
    else
      insert into public.t2_shartnoma(kompaniya_id, raqam, nom, predmet, turi, asosiy, taraf, sana, jami_nds_bilan, kim)
      values (p_kompaniya_id, v_raqam, nullif(btrim(coalesce(it->>'nom', '')), ''), nullif(btrim(coalesce(it->>'predmet', '')), ''), v_turi, false, v_nom,
              nullif(it->>'sana', '')::date, v_summa, 'actor:' || p_actor_id)
      returning id into v_sid;
      c_yangi := c_yangi + 1;
    end if;

    if not exists (select 1 from public.t2_shartnoma_tomon where shartnoma_id = v_sid) then
      v_rol := case v_turi when 'subpudrat' then 'Subpudratchi' when 'xizmat' then 'Xizmat ko''rsatuvchi' else 'Yetkazib beruvchi' end;
      insert into public.t2_shartnoma_tomon(kompaniya_id, shartnoma_id, rol, kontragent_id, nom, inn, tartib) values (p_kompaniya_id, v_sid, v_rol, v_kid, v_nom, v_inn, 1);
    end if;
    if p_obyekt_id is not null then
      insert into public.t2_shartnoma_qoshimcha_bog(kompaniya_id, shartnoma_id, obyekt_id, holat) values (p_kompaniya_id, v_sid, p_obyekt_id, 'faol')
      on conflict (shartnoma_id, obyekt_id) do update set holat = 'faol';
    end if;

    v_sp := it->'spravka';
    if v_sp is not null and jsonb_typeof(v_sp) = 'object' then
      update public.t2_shartnoma set
        spravka_qarz = case when v_sp ? 'qarz' then nullif(btrim(coalesce(v_sp->>'qarz', '')), '')::numeric else spravka_qarz end,
        spravka_tolangan = case when v_sp ? 'tolangan' then nullif(btrim(coalesce(v_sp->>'tolangan', '')), '')::numeric else spravka_tolangan end,
        spravka_prognoz = case when v_sp ? 'prognoz' then nullif(btrim(coalesce(v_sp->>'prognoz', '')), '')::numeric else spravka_prognoz end,
        spravka_sana = case when v_sp ? 'sana' then nullif(v_sp->>'sana', '')::date else spravka_sana end
       where id = v_sid;
    end if;

    -- Asos qatorlari: tabiiy kalit bo'yicha takrorlari o'tkazib yuboriladi.
    v_qi := 0;
    if jsonb_typeof(it->'qatorlar') = 'array' then
      for q in select value from jsonb_array_elements(it->'qatorlar') loop
        v_qi := v_qi + 1;
        v_tur := q->>'tur';
        if v_tur is null or v_tur not in ('yetkazib_berish', 'bajarilgan_ish', 'tolov', 'boshlangich_qoldiq') then
          raise exception 'ASOS_TUR_INVALID: % shartnoma, % qator', v_idx, v_qi;
        end if;
        v_hajm := nullif(btrim(coalesce(q->>'hajm', '')), '')::numeric;
        v_narx := nullif(btrim(coalesce(q->>'narx', '')), '')::numeric;
        v_qsumma := nullif(btrim(coalesce(q->>'summa', '')), '')::numeric;
        if v_qsumma is null and v_hajm is not null and v_narx is not null then v_qsumma := round(v_hajm * v_narx, 2); end if;
        v_sana := nullif(q->>'sana', '')::date;
        v_hujjat := nullif(btrim(coalesce(q->>'hujjat_raqam', '')), '');
        v_qnomi := nullif(btrim(coalesce(q->>'nomi', '')), '');
        if exists (select 1 from public.t2_qarz_asos a where a.shartnoma_id = v_sid and a.holat = 'faol' and a.tur = v_tur
                     and a.hujjat_raqam is not distinct from v_hujjat and a.sana is not distinct from v_sana
                     and a.summa is not distinct from v_qsumma and a.nomi is not distinct from v_qnomi) then
          c_takror := c_takror + 1;
        else
          insert into public.t2_qarz_asos(kompaniya_id, shartnoma_id, tur, hujjat_raqam, sana, nomi, birlik, hajm, narx, summa, izoh, tartib, operation_id, kim)
          values (p_kompaniya_id, v_sid, v_tur, v_hujjat, v_sana, v_qnomi, nullif(btrim(coalesce(q->>'birlik', '')), ''), v_hajm, v_narx, v_qsumma,
                  nullif(btrim(coalesce(q->>'izoh', '')), ''),
                  coalesce((select max(tartib) from public.t2_qarz_asos where shartnoma_id = v_sid), 0) + 1, p_operation_id, 'actor:' || p_actor_id);
          c_qator := c_qator + 1;
        end if;
      end loop;
    end if;
  end loop;

  perform public.t2_audit_yoz(p_kompaniya_id, 'qarzdorlik_import', 'shartnoma', null,
    format('yangi=%s yangilandi=%s qator=%s takror=%s kontragent=%s', c_yangi, c_yangilandi, c_qator, c_takror, c_kontragent), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'shartnoma_yangi', c_yangi, 'shartnoma_yangilandi', c_yangilandi, 'qator_qoshildi', c_qator,
                              'qator_takror', c_takror, 'kontragent_yangi', c_kontragent);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'qarzdorlik_import_v1', v_res);
  return v_res;
end $$;

revoke all on function public.t2_qarzdorlik_royxat_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_qarzdorlik_saqla_v1(bigint, bigint, bigint, integer, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_qarzdorlik_import_v1(bigint, bigint, jsonb, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_qarzdorlik_royxat_v1(bigint, bigint) to service_role;
grant execute on function public.t2_qarzdorlik_saqla_v1(bigint, bigint, bigint, integer, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.t2_qarzdorlik_import_v1(bigint, bigint, jsonb, bigint, uuid) to service_role;

commit;
