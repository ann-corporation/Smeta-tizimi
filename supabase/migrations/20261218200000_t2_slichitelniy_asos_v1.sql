-- 20261218200000 - FAKT ASOSLI SLICHITELNIY: har farq qatoriga ASOS (АОСР, texnadzor qarori) + tayyorlik hisobi (ijro, mavjud t2_aosr oqimi kengaytiriladi).
-- Egasi (PTO muhandisi): fakt hajm -> ijro hujjati (АОСР) -> texnadzor tasdig'i -> slichitelniy vedomostda HAR FARQ QATORIDA ASOS.
-- Yangi JADVAL YO'Q: mavjud t2_aosr_bog (АОСР <-> smeta qatori, ko'p-ko'p) ga bitta ixcham ustun `hajm` qo'shiladi
-- (АОСР qatorning QANCHA hajmini tasdiqlaydi). Baza hajmi bahosi (migratsiya boshida): prodda t2_aosr_bog ~10 qator,
-- yangi ustun numeric (~8 bayt/qator); har akt-ish juftligi ~60-80 bayt; 10 000 juftlik < 1 MB (baza ~466/500 MB — tor, shu sabab faqat shu ustun).
-- Funksiyalar (hammasi t2_aosr* prefiksi = ijro domeni, lib/reestr/domen.ts da yangi prefiks KERAK EMAS):
--   t2_aosr_slichitelniy_v1   (stable, o'qish) - farqli ish qatorlari, ularning asoslari, tayyorlik sanog'i, "nima yetishmaydi" ro'yxati
--   t2_aosr_bog_hajm_v1       (yozish)         - АОСР <-> qator bog'ini hajm bilan saqlash/olib tashlash (qaror kutilayotgan/tasdiqlangan akt qulflanadi)
--   t2_aosr_asos_qoralama_v1  (yozish)         - tanlangan ish qatorlari uchun АОСР qoralamalarini ommiy yaratish (hajm = fakt - allaqachon asoslangan)
-- Pul hisobi YO'Q (summa lib/hisob-yadro da); smeta qatorlari O'ZGARMAYDI (faqat o'qiladi); tenant: kompaniya a'zoligi + obyekt shu kompaniyaniki.
-- Texnadzor/buyurtmachi (boshqa kompaniya) bu funksiyalarni o'z kompaniyasi nomidan chaqirsa obyekt topilmaydi (TOPILMADI);
-- yozish amali faqat 'taqdim' huquqli rollar (pto, boss, ...) - 'inspektor' (texnadzor) yoza olmaydi.
-- Rollback: 20261218200000_t2_slichitelniy_asos_v1.rollback.sql. Acceptance: ...acceptance.sql.
set local statement_timeout = '300s';

-- 1. Ixcham ustun: АОСР shu qatorning qancha hajmini tasdiqlaydi (NULL = hajm ko'rsatilmagan, 0 emas)
alter table public.t2_aosr_bog add column if not exists hajm numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_aosr_bog'::regclass and conname = 't2_aosr_bog_hajm_check') then
    alter table public.t2_aosr_bog add constraint t2_aosr_bog_hajm_check check (hajm is null or (hajm >= 0 and hajm <> 'NaN'::numeric));
  end if;
end $$;
comment on column public.t2_aosr_bog.hajm is 'АОСР shu smeta qatorining qancha hajmini tasdiqlaydi (qator birligida). NULL = hajm ko''rsatilmagan (0 emas).';

-- 2. O'qish: slichitelniy asoslari va tayyorlik (faqat faol smeta; АОСР/taqdim tarixi filtrsiz).
--    Farq chegarasi 0.0005: fakt hajmi 3 xonagacha yoziladi, smeta 4 xonagacha - yaxlitlash shovqini farq hisoblanmaydi (lib: FARQ_CHEGARA).
create or replace function public.t2_aosr_slichitelniy_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '120s'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_res jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Obyekt topilmadi');
  end if;

  with u as (   -- ish birliklari: rz emas; ish (bl) ichidagi resurslar alohida birlik emas (ular otasining asosini oladi)
    select h.qator_id as id, h.tur, h.kod, h.nom, h.birlik, h.smeta_hajm, coalesce(h.fakt_hajm, 0) as fakt_hajm
      from public.t2_qator_holat h
      left join public.t2_qator p on p.id = h.ota_id
     where h.obyekt_id = p_obyekt_id and h.versiya_holat = 'faol' and h.tur <> 'rz'
       and not (h.tur in ('rs', 'mat', 'ob') and p.tur = 'bl')
  ),
  ax as (       -- bog'langan АОСР lar va ularning oxirgi taqdimi (texnadzor qarori)
    select a.id, a.raqam, a.sana, a.tur, a.holat, a.ish_nomi, a.tasdiq_vaqti,
           t.id as taqdim_id, t.holat as taqdim_holat, t.qaror_vaqti, t.qaror_izoh, t.qaror_actor_id,
           t.qabul_qiluvchi_kompaniya_id as qaror_kompaniya_id,
           to_jsonb(t.*)->>'nazorat_turi' as nazorat_turi,
           nullif(to_jsonb(t.*)->>'nomidan_kompaniya_id', '')::bigint as nomidan_id,
           case when a.holat = 'tasdiqlangan' and coalesce(to_jsonb(t.*)->>'nazorat_turi', '') ilike '%ichki%' then 'ichki'   -- ichki nazorat (pudratchining o'zi): tashqi tasdiq o'rnini bosmaydi
                when a.holat = 'tasdiqlangan' then 'tasdiqlangan'
                when a.holat = 'qogoz' then 'qogoz'
                when t.holat in ('yuborilgan', 'ko_rilmoqda') then 'kutilmoqda'
                when t.holat in ('tuzatish', 'rad') then t.holat
                else 'qoralama' end as asos_holat
      from public.t2_aosr a
      left join lateral (select t0.* from public.t2_tomon_taqdim t0
                          where t0.manba_jadval = 't2_aosr' and t0.manba_id = a.id and t0.taqdim_etuvchi_kompaniya_id = p_kompaniya_id
                          order by t0.id desc limit 1) t on true
     where a.obyekt_id = p_obyekt_id and a.kompaniya_id = p_kompaniya_id and a.holat <> 'bekor'
       and exists (select 1 from public.t2_aosr_bog b where b.aosr_id = a.id)
  ),
  bg as (       -- bog' -> ish birligi (resurs qatoriga bog'langan bo'lsa, ish qatoriga ko'chiriladi; hajm faqat to'g'ridan-to'g'ri bog'dan)
    select coalesce(case when qq.tur in ('rs', 'mat', 'ob') and pq.tur = 'bl' then pq.id end, qq.id) as u_id,
           b.aosr_id, b.hajm,
           (qq.tur not in ('rs', 'mat', 'ob') or pq.tur is distinct from 'bl') as direkt
      from public.t2_aosr_bog b
      join ax on ax.id = b.aosr_id
      join public.t2_qator qq on qq.id = b.qator_id
      left join public.t2_qator pq on pq.id = qq.ota_id
  ),
  ub as (
    select g.u_id, g.aosr_id, g.hajm, ax.asos_holat
      from (select u_id, aosr_id, max(hajm) filter (where direkt) as hajm from bg group by u_id, aosr_id) g
      join ax on ax.id = g.aosr_id
  ),
  ua as (
    select u_id, count(*) as aosr_soni, sum(hajm) as asoslangan,
           count(*) filter (where asos_holat in ('tasdiqlangan', 'qogoz')) as tasdiq_soni,
           sum(hajm) filter (where asos_holat in ('tasdiqlangan', 'qogoz')) as tasdiq_hajm,
           count(*) filter (where asos_holat in ('tasdiqlangan', 'qogoz') and hajm is null) as tasdiq_hajmsiz,
           count(*) filter (where asos_holat = 'ichki') as ichki_soni,
           count(*) filter (where asos_holat = 'kutilmoqda') as kutilmoqda,
           count(*) filter (where asos_holat in ('tuzatish', 'rad')) as tuzatish,
           count(*) filter (where asos_holat = 'qoralama') as qoralama
      from ub group by u_id
  ),
  r as (
    select u.id, u.tur, u.kod, u.nom, u.birlik, u.smeta_hajm, u.fakt_hajm,
           (u.fakt_hajm - coalesce(u.smeta_hajm, 0)) as farq_hajm,
           (u.fakt_hajm <> 0 and (u.smeta_hajm is null or abs(u.fakt_hajm - u.smeta_hajm) > 0.0005)) as farqli,
           ua.aosr_soni, ua.asoslangan, ua.tasdiq_hajm,
           case when ua.u_id is null then 'yoq'
                when ua.tasdiq_soni > 0 and (ua.tasdiq_hajmsiz > 0 or coalesce(ua.tasdiq_hajm, 0) >= abs(u.fakt_hajm) - 0.000001) then 'tasdiqlangan'
                when ua.ichki_soni > 0 then 'ichki'
                when ua.kutilmoqda > 0 then 'kutilmoqda'
                when ua.tuzatish > 0 then 'tuzatish'
                when ua.qoralama > 0 then 'qoralama'
                else 'hajm_yetmaydi' end as asos_holat
      from u left join ua on ua.u_id = u.id
  )
  select jsonb_build_object(
    'ok', true, 'obyekt_id', p_obyekt_id,
    'tayyorlik', (select jsonb_build_object(
        'farqli', count(*), 'ortiq', count(*) filter (where farq_hajm > 0), 'kam', count(*) filter (where farq_hajm < 0),
        'smetada_yoq', count(*) filter (where smeta_hajm is null or smeta_hajm = 0),
        'asosli', count(*) filter (where asos_holat <> 'yoq'),
        'tasdiqlagan', count(*) filter (where asos_holat = 'tasdiqlangan'),
        'ichki_nazorat', count(*) filter (where asos_holat = 'ichki'),
        'kutilmoqda', count(*) filter (where asos_holat = 'kutilmoqda'),
        'tuzatish', count(*) filter (where asos_holat = 'tuzatish'),
        'qoralama', count(*) filter (where asos_holat = 'qoralama'),
        'hajm_yetmaydi', count(*) filter (where asos_holat = 'hajm_yetmaydi'),
        'asossiz', count(*) filter (where asos_holat = 'yoq'))
       from r where farqli),
    'yetishmaydi_jami', (select count(*) from r where farqli and asos_holat <> 'tasdiqlangan'),
    'yetishmaydi', (select coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb)
                      from (select r.id, jsonb_build_object(
                              'qator_id', r.id, 'tur', r.tur, 'kod', r.kod, 'nom', r.nom, 'birlik', r.birlik,
                              'smeta_hajm', r.smeta_hajm, 'fakt_hajm', r.fakt_hajm, 'farq_hajm', r.farq_hajm,
                              'asos_holat', r.asos_holat, 'aosr_soni', coalesce(r.aosr_soni, 0),
                              'amal', case r.asos_holat when 'yoq' then 'aosr_yarat' when 'qoralama' then 'texnadzorga_yubor'
                                                         when 'ichki' then 'tashqi_nazorat_kerak' when 'kutilmoqda' then 'javob_kutilmoqda' when 'tuzatish' then 'tuzatish_kiriting'
                                                         else 'hajm_toldir' end) as j
                              from r where r.farqli and r.asos_holat <> 'tasdiqlangan' order by r.id limit v_lim) x),
    'asoslar', (select coalesce(jsonb_agg(jsonb_build_object(
                          'qator_id', r.id, 'asos_holat', r.asos_holat, 'farqli', r.farqli,
                          'smeta_hajm', r.smeta_hajm, 'fakt_hajm', r.fakt_hajm,
                          'asoslangan_hajm', r.asoslangan, 'tasdiq_hajm', r.tasdiq_hajm,
                          'aosr', (select jsonb_agg(jsonb_build_object('id', ub.aosr_id, 'hajm', ub.hajm) order by ub.aosr_id) from ub where ub.u_id = r.id)
                        ) order by r.id), '[]'::jsonb)
                  from r where r.aosr_soni is not null),
    'aosrlar', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', ax.id, 'raqam', ax.raqam, 'sana', ax.sana, 'tur', ax.tur, 'holat', ax.holat, 'ish_nomi', ax.ish_nomi,
                          'asos_holat', ax.asos_holat, 'tasdiq_vaqti', ax.tasdiq_vaqti,
                          'taqdim_id', ax.taqdim_id, 'taqdim_holat', ax.taqdim_holat,
                          'qaror_vaqti', ax.qaror_vaqti, 'qaror_izoh', ax.qaror_izoh,
                          'qaror_kompaniya', k.nom, 'qaror_kim', f.ism,
                          'nomidan_kompaniya', nk.nom, 'nazorat_turi', ax.nazorat_turi,
                          'qaror_egasi', case when ax.qaror_vaqti is null then null else concat_ws(', ', f.ism, k.nom, case when nk.nom is not null then 'nomidan: ' || nk.nom end, ax.nazorat_turi) end
                        ) order by ax.id), '[]'::jsonb)
                  from ax
                  left join public.t2_kompaniya k on k.id = ax.qaror_kompaniya_id and ax.qaror_vaqti is not null
                  left join public.t2_foydalanuvchi f on f.id = ax.qaror_actor_id
                  left join public.t2_kompaniya nk on nk.id = ax.nomidan_id)
  ) into v_res;
  return v_res;
end $$;

-- 3. Yozish: АОСР <-> qator bog'ini hajm bilan saqlash. Idempotentlik: tabiiy kalit (aosr_id, qator_id) bo'yicha upsert - bir xil so'rovni qayta yuborish
--    ikkinchi yozuv yaratmaydi; p_operation_id shlyuzdan qabul qilinadi (kelajakda command_log uchun), hozir natijaga ta'sir qilmaydi.
create or replace function public.t2_aosr_bog_hajm_v1(p_actor_id bigint, p_kompaniya_id bigint, p_aosr_id bigint, p_bog jsonb, p_operation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.t2_aosr; e jsonb; v_q bigint; v_h numeric; v_son integer := 0; v_chiq integer := 0;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');   -- texnadzor ('inspektor') yoza olmaydi
  select * into a from public.t2_aosr where id = p_aosr_id and kompaniya_id = p_kompaniya_id and holat <> 'bekor' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Akt topilmadi');
  end if;
  if a.holat = 'tasdiqlangan' then
    return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN', 'error', 'Tasdiqlangan aktning bog''i o''zgarmaydi');
  end if;
  if exists (select 1 from public.t2_tomon_taqdim q where q.manba_jadval = 't2_aosr' and q.manba_id = p_aosr_id and q.holat in ('yuborilgan', 'ko_rilmoqda')) then
    return jsonb_build_object('ok', false, 'code', 'TAQDIMDA', 'error', 'Akt qarshi tomonga yuborilgan, qaror kutilmoqda - avval qaytarib oling');
  end if;
  if p_bog is null or jsonb_typeof(p_bog) <> 'array' or jsonb_array_length(p_bog) = 0 or jsonb_array_length(p_bog) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BOG_KERAK', 'error', '1 dan 500 tagacha qator tanlang');
  end if;
  for e in select x from jsonb_array_elements(p_bog) x loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'qator_id', '') !~ '^\d{1,18}$' then
      return jsonb_build_object('ok', false, 'code', 'BOG_NOTOGRI', 'error', 'qator_id raqam bo''lishi shart');
    end if;
    v_q := (e->>'qator_id')::bigint;
    if not exists (select 1 from public.t2_qator q where q.id = v_q and q.obyekt_id = a.obyekt_id and coalesce(q.versiya_holat, 'faol') = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'QATOR_YOQ', 'error', 'Qator bu obyektning joriy smetasida topilmadi: ' || v_q);
    end if;
    if coalesce((e->>'ochir')::boolean, false) then
      delete from public.t2_aosr_bog where aosr_id = p_aosr_id and qator_id = v_q;
      if found then v_chiq := v_chiq + 1; end if;
      continue;
    end if;
    v_h := null;
    if jsonb_typeof(e->'hajm') = 'number' then
      v_h := (e->>'hajm')::numeric;
      if v_h < 0 then return jsonb_build_object('ok', false, 'code', 'HAJM_NOTOGRI', 'error', 'Hajm manfiy bo''lmasin: qator ' || v_q); end if;
    elsif e ? 'hajm' and jsonb_typeof(e->'hajm') <> 'null' then
      return jsonb_build_object('ok', false, 'code', 'HAJM_NOTOGRI', 'error', 'Hajm raqam bo''lishi shart: qator ' || v_q);
    end if;
    insert into public.t2_aosr_bog (aosr_id, qator_id, kompaniya_id, hajm) values (p_aosr_id, v_q, p_kompaniya_id, v_h)
      on conflict (aosr_id, qator_id) do update set hajm = excluded.hajm;
    v_son := v_son + 1;
  end loop;
  return jsonb_build_object('ok', true, 'aosr_id', p_aosr_id, 'saqlandi', v_son, 'olib_tashlandi', v_chiq);
end $$;

-- 4. Yozish: tanlangan ish qatorlari uchun АОСР qoralamalarini ommaviy yaratish. Hajm taklifi = fakt - allaqachon asoslangan hajm.
-- Mavjud t2_aosr_yoz_v2 (yagona yozuvchi) chaqiriladi; qoralama 'yangi' holatda, tasdiq faqat qarshi tomon qarori bilan.
create or replace function public.t2_aosr_asos_qoralama_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_ids bigint[], p_operation_id uuid, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q bigint; h record; v_op uuid; v_id bigint; r jsonb; v_taklif numeric; v_n integer; v_raqam text; v_nom text;
  v_yar jsonb := '[]'::jsonb; v_otk jsonb := '[]'::jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_KERAK', 'error', 'operation_id majburiy');
  end if;
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Obyekt topilmadi');
  end if;
  if coalesce(array_length(p_qator_ids, 1), 0) = 0 or array_length(p_qator_ids, 1) > 200 then
    return jsonb_build_object('ok', false, 'code', 'QATOR_KERAK', 'error', '1 dan 200 tagacha qator tanlang');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_aosr_raqam:' || p_obyekt_id::text, 0));
  for v_q in select distinct x from unnest(p_qator_ids) x order by x loop
    v_op := md5(p_operation_id::text || ':' || v_q::text)::uuid;
    if exists (select 1 from public.t2_aosr where operation_id = v_op) then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'allaqachon');
      continue;
    end if;
    select hh.qator_id, hh.tur, hh.kod, hh.nom, hh.fakt_hajm, p.tur as ota_tur into h
      from public.t2_qator_holat hh
      left join public.t2_qator p on p.id = hh.ota_id
     where hh.qator_id = v_q and hh.obyekt_id = p_obyekt_id and hh.versiya_holat = 'faol';
    if not found or h.tur = 'rz' then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'qator_yoq'); continue;
    end if;
    if h.tur in ('rs', 'mat', 'ob') and h.ota_tur = 'bl' then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'resurs_qatori'); continue;   -- АОСР ishga bog'lanadi, resursga emas
    end if;
    if coalesce(h.fakt_hajm, 0) <= 0 then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'fakt_yoq'); continue;
    end if;
    v_taklif := h.fakt_hajm - coalesce((select sum(b.hajm) from public.t2_aosr_bog b join public.t2_aosr a on a.id = b.aosr_id and a.holat <> 'bekor' where b.qator_id = v_q), 0);
    if v_taklif <= 0.000001 then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'qoplangan'); continue;
    end if;
    select coalesce(max((substring(a.raqam from '^A-(\d+)$'))::integer), 0) + 1 into v_n from public.t2_aosr a where a.obyekt_id = p_obyekt_id and a.tur = 'aosr';
    v_raqam := 'A-' || lpad(v_n::text, 4, '0');
    v_nom := left(coalesce(nullif(btrim(h.nom), ''), nullif(btrim(h.kod), ''), 'qator ' || v_q::text), 300);
    r := public.t2_aosr_yoz_v2(p_kompaniya_id, p_obyekt_id,
           jsonb_build_object('tur', 'aosr', 'raqam', v_raqam, 'ish_nomi', v_nom, 'sana', current_date,
                              'izoh', 'avto: slichitelniy asosi (hajm fakt jurnalidan taklif qilingan)'),
           null, null, v_op, coalesce(p_kim, 'slichitelniy'));
    if r is null or coalesce((r->>'ok')::boolean, false) is not true then
      v_otk := v_otk || jsonb_build_object('qator_id', v_q, 'sabab', 'yozilmadi', 'tafsilot', left(coalesce(r::text, ''), 300)); continue;
    end if;
    v_id := (r->>'id')::bigint;
    insert into public.t2_aosr_bog (aosr_id, qator_id, kompaniya_id, hajm) values (v_id, v_q, p_kompaniya_id, v_taklif)
      on conflict (aosr_id, qator_id) do update set hajm = excluded.hajm;
    v_yar := v_yar || jsonb_build_object('qator_id', v_q, 'aosr_id', v_id, 'raqam', v_raqam, 'hajm', v_taklif);
  end loop;
  return jsonb_build_object('ok', true, 'yaratildi', v_yar, 'otkazildi', v_otk);
end $$;

comment on function public.t2_aosr_slichitelniy_v1(bigint, bigint, bigint, integer) is 'versiya: faol smeta qatorlari (versiya_holat = ''faol''); АОСР va taqdim tarixi filtrsiz. Slichitelniy asoslari va tayyorlik (fakt - smeta farqi bo''yicha).';
comment on function public.t2_aosr_bog_hajm_v1(bigint, bigint, bigint, jsonb, uuid) is 'versiya: faol smeta qatorlari (versiya_holat = ''faol'') bilan bog''lanadi; АОСР <-> qator bog''i hajm bilan.';
comment on function public.t2_aosr_asos_qoralama_v1(bigint, bigint, bigint, bigint[], uuid, text) is 'versiya: faol smeta qatorlari (versiya_holat = ''faol''); ish qatorlari uchun АОСР qoralamalari, hajm = fakt - asoslangan.';

-- 5. Ruxsatlar: faqat service_role (shlyuz); anon/authenticated yo'q
do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_aosr_slichitelniy_v1(bigint,bigint,bigint,integer)',
    'public.t2_aosr_bog_hajm_v1(bigint,bigint,bigint,jsonb,uuid)',
    'public.t2_aosr_asos_qoralama_v1(bigint,bigint,bigint,bigint[],uuid,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
