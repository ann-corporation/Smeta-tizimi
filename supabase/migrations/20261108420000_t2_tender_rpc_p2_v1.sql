-- P2 TENDER RPC (E7 §3.2) — e'lon, taklif, g'olib (qator darajasida), yopish, ro'yxat, tafsilot.
-- Egasi: tomon-yetkazuvchi. Jadvallar: 20261108400000 (birja baseline + kengaytma). Buyurtma: 20261108410000.
-- Kanonik imzolar E7 §3.2; kengaytma = oxirida DEFAULT li ixtiyoriy parametr (t2_tender_taklif_ber_v1.p_shart, t2_tender_golib_v1.p_qator_idlar/p_shart).
--
-- Ko'rinish (E2 §1): egasi — o'z tenderi; chaqirilgan (doira='taklif') — oluvchi qatori + FAOL aloqa (aloqa yopilsa ko'rinish ham yopiladi);
-- ochiq (doira='ochiq', L3) — minimal maydonlar (nom, tur, muddat, qator nomi/miqdori); obyekt, zayavka, smeta havolasi, rekvizit YO'Q.
-- G'olib: qator darajasida (bir RFQ ning turli qatorlari turli yetkazuvchiga) -> har g'olib taklif uchun alohida buyurtma.
-- Faol aloqa yo'q g'olib (ochiq tenderdan) -> 'ALOQA_KERAK': avval tomon yadrosi orqali kontakt/aloqa taklifi (handshake), keyin g'olib belgilanadi.
-- Narx doim NDS siz; bir nechta narx o'rtachasi va eng yaxshisi mijozda (lib/yetkazuvchi/taqqoslash.ts) hisoblanadi.

-- RFQ shu kompaniyaga ko'rinadimi?
create or replace function public._t2_tender_korinadi(p_rfq_id bigint, p_kompaniya_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.t2_birja_rfq r
     where r.id = p_rfq_id
       and (r.kompaniya_id = p_kompaniya_id
            or (r.doira = 'ochiq' and r.holat in ('ochiq', 'elon', 'golib_tanlandi', 'yopildi', 'yopiq'))
            or (r.doira = 'taklif'
                and exists (select 1 from public.t2_birja_rfq_oluvchi o where o.rfq_id = r.id and o.oluvchi_kompaniya_id = p_kompaniya_id and o.holat <> 'rad')
                and public._t2_yet_aloqa_faol(r.kompaniya_id, p_kompaniya_id) is not null)))
$$;

create or replace function public.t2_tender_elon_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_tur text, p_doira text, p_qabul_kompaniya_idlar bigint[],
  p_obyekt_id bigint, p_muddat timestamptz, p_qatorlar jsonb, p_shart jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.t2_birja_rfq; v_xato text; v_q jsonb; v_no integer := 0; v_n integer; v_id bigint; v_rec bigint[]; v_k bigint;
  v_shart jsonb := coalesce(p_shart, '{}'::jsonb); v_nom text; v_birlik text; v_hajm numeric; v_z bigint;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'xarid_yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_birja_rfq where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id, 'versiya', v_old.versiya); end if;
  if jsonb_typeof(v_shart) <> 'object' then return jsonb_build_object('ok', false, 'code', 'SHART_NOTOGRI'); end if;
  if not public._t2_yet_tur_ok('tender', p_tur) then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if p_doira not in ('ochiq', 'taklif') then return jsonb_build_object('ok', false, 'code', 'DOIRA_NOTOGRI'); end if;
  v_xato := public._t2_yet_qator_xato(p_qatorlar);
  if v_xato is not null then return jsonb_build_object('ok', false, 'code', v_xato); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  if not (p_obyekt_id is null or public._t2_obyekt_doira_ok(p_actor_id, p_kompaniya_id, p_obyekt_id)) then return jsonb_build_object('ok', false, 'code', 'DOIRA_YOQ'); end if;
  if p_muddat is not null and p_muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if p_doira = 'taklif' then
    select coalesce(array_agg(distinct x), '{}') into v_rec from unnest(coalesce(p_qabul_kompaniya_idlar, '{}')) x where x is not null;
    if cardinality(v_rec) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'OLUVCHILAR_NOTOGRI'); end if;
    foreach v_k in array v_rec loop
      if v_k = p_kompaniya_id or public._t2_yet_aloqa_faol(p_kompaniya_id, v_k) is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'kompaniya_id', v_k); end if;
    end loop;
  else v_rec := '{}'; end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_q->>'zayavka_id', '') <> '' then
      if v_q->>'zayavka_id' !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'ZAYAVKA_BEGONA'); end if;
      v_z := (v_q->>'zayavka_id')::bigint;
      if not exists (select 1 from public.t2_erp_taminot z where z.id = v_z and z.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'ZAYAVKA_BEGONA'); end if;
    end if;
  end loop;
  v_n := jsonb_array_length(p_qatorlar);
  v_nom := left(coalesce(nullif(btrim(v_shart->>'sarlavha'), ''), btrim(p_qatorlar->0->>'nom') || case when v_n > 1 then ' +' || (v_n - 1) || ' ta' else '' end), 300);
  if v_n = 1 then v_birlik := btrim(p_qatorlar->0->>'birlik'); v_hajm := (p_qatorlar->0->>'miqdor')::numeric; end if;   -- eski UI uchun; ko'p qatorda NULL
  insert into public.t2_birja_rfq (kompaniya_id, nom, birlik, hajm, izoh, holat, operation_id, kim, tur, doira, obyekt_id, muddat, shart, yaratdi_actor_id)
  values (p_kompaniya_id, v_nom, v_birlik, v_hajm, left(nullif(btrim(coalesce(v_shart->>'izoh', '')), ''), 2000), 'elon', p_operation_id, p_actor_id::text,
          p_tur, p_doira, p_obyekt_id, p_muddat, v_shart, p_actor_id)
  returning id into v_id;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    v_no := v_no + 1;
    insert into public.t2_birja_rfq_qator (kompaniya_id, rfq_id, qator_no, nom, birlik, miqdor, resurs_kodi, zayavka_id, smeta_qator_id, izoh)
    values (p_kompaniya_id, v_id, v_no, btrim(v_q->>'nom'), btrim(v_q->>'birlik'), (v_q->>'miqdor')::numeric, nullif(v_q->>'resurs_kodi', ''),
            nullif(v_q->>'zayavka_id', '')::bigint, nullif(v_q->>'smeta_qator_id', '')::bigint, nullif(left(v_q->>'izoh', 1000), ''));
  end loop;
  if cardinality(v_rec) > 0 then
    foreach v_k in array v_rec loop
      insert into public.t2_birja_rfq_oluvchi (kompaniya_id, rfq_id, oluvchi_kompaniya_id, aloqa_id)
      values (p_kompaniya_id, v_id, v_k, public._t2_yet_aloqa_faol(p_kompaniya_id, v_k));
    end loop;
  end if;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.elon', 't2_birja_rfq', v_id, jsonb_build_object('tur', p_tur, 'doira', p_doira, 'qator_soni', v_n),
            p_actor_id, p_operation_id, p_obyekt_id, null, v_rec);
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1, 'qator_soni', v_n);
end $$;

create or replace function public.t2_tender_taklif_ber_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_qatorlar jsonb, p_izoh text, p_shart jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_old public.t2_birja_taklif; v_q jsonb; v_id bigint; v_tid bigint; v_qs bigint[] := '{}'; v_n integer;
  v_yet numeric; v_qqs numeric; v_shart jsonb := coalesce(p_shart, '{}'::jsonb); v_narx1 numeric; v_say integer;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'taklif');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_birja_taklif where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id, 'versiya', v_old.versiya); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id for update;
  if not found or not public._t2_tender_korinadi(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'OZI'); end if;
  if v_rfq.holat not in ('elon', 'ochiq') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.muddat is not null and v_rfq.muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  if jsonb_typeof(v_shart) <> 'object' then return jsonb_build_object('ok', false, 'code', 'SHART_NOTOGRI'); end if;
  if coalesce(v_shart->>'yetkazish_narx', '') <> '' then
    if v_shart->>'yetkazish_narx' !~ '^[0-9]+(\.[0-9]+)?$' then return jsonb_build_object('ok', false, 'code', 'YETKAZISH_NARX'); end if;
    v_yet := (v_shart->>'yetkazish_narx')::numeric;
  end if;
  if coalesce(v_shart->>'qqs_foiz', '') <> '' then
    if v_shart->>'qqs_foiz' !~ '^[0-9]+(\.[0-9]+)?$' or (v_shart->>'qqs_foiz')::numeric > 100 then return jsonb_build_object('ok', false, 'code', 'QQS_NOTOGRI'); end if;
    v_qqs := (v_shart->>'qqs_foiz')::numeric;
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) not between 1 and 200 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    if jsonb_typeof(v_q) <> 'object' or coalesce(v_q->>'rfq_qator_id', '') !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
    if coalesce(v_q->>'narx', '') !~ '^[0-9]+(\.[0-9]+)?$' then return jsonb_build_object('ok', false, 'code', 'QATOR_NARX'); end if;   -- narxsiz qator yozilmaydi (NULL ≠ 0)
    if coalesce(v_q->>'muddat_kun', '') <> '' and (v_q->>'muddat_kun' !~ '^[0-9]{1,4}$' or (v_q->>'muddat_kun')::integer > 3650) then return jsonb_build_object('ok', false, 'code', 'QATOR_MUDDAT'); end if;
    if coalesce(v_q->>'mavjud_miqdor', '') <> '' and (v_q->>'mavjud_miqdor' !~ '^[0-9]+(\.[0-9]+)?$' or (v_q->>'mavjud_miqdor')::numeric <= 0) then return jsonb_build_object('ok', false, 'code', 'QATOR_MIQDOR'); end if;
    if (v_q->>'rfq_qator_id')::bigint = any (v_qs) then return jsonb_build_object('ok', false, 'code', 'QATOR_TAKROR'); end if;
    if not exists (select 1 from public.t2_birja_rfq_qator q where q.id = (v_q->>'rfq_qator_id')::bigint and q.rfq_id = v_rfq.id) then return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA'); end if;
    v_qs := v_qs || (v_q->>'rfq_qator_id')::bigint;
  end loop;
  -- Oldingi faol taklifni almashtirish (g'olib bo'lgan qatori bo'lsa o'zgartirib bo'lmaydi)
  select * into v_old from public.t2_birja_taklif where rfq_id = v_rfq.id and kompaniya_id = p_kompaniya_id and holat in ('berildi', 'faol') for update;
  if found then
    if exists (select 1 from public.t2_birja_rfq_qator q join public.t2_birja_taklif_qator tq on tq.id = q.golib_taklif_qator_id where tq.taklif_id = v_old.id) then
      return jsonb_build_object('ok', false, 'code', 'TAKLIF_GOLIB'); end if;
    update public.t2_birja_taklif set holat = 'qaytarib_olindi', versiya = versiya + 1, yangilandi = now() where id = v_old.id;
  end if;
  select count(*) into v_say from public.t2_birja_rfq_qator where rfq_id = v_rfq.id;
  if v_say = 1 then v_narx1 := (p_qatorlar->0->>'narx')::numeric; end if;   -- bir qatorli RFQ: eski UI uchun yagona narx
  insert into public.t2_birja_taklif (rfq_id, kompaniya_id, narx, izoh, holat, operation_id, kim, yetkazish_narx, qqs_foiz, yaratdi_actor_id)
  values (v_rfq.id, p_kompaniya_id, v_narx1, left(nullif(btrim(coalesce(p_izoh, '')), ''), 2000), 'berildi', p_operation_id, p_actor_id::text, v_yet, v_qqs, p_actor_id)
  returning id into v_tid;
  for v_q in select * from jsonb_array_elements(p_qatorlar) loop
    insert into public.t2_birja_taklif_qator (kompaniya_id, taklif_id, rfq_qator_id, narx, muddat_kun, mavjud_miqdor, izoh)
    values (p_kompaniya_id, v_tid, (v_q->>'rfq_qator_id')::bigint, (v_q->>'narx')::numeric, nullif(v_q->>'muddat_kun', '')::integer,
            nullif(v_q->>'mavjud_miqdor', '')::numeric, nullif(left(v_q->>'izoh', 500), ''));
  end loop;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.taklif', 't2_birja_taklif', v_tid, jsonb_build_object('rfq_id', v_rfq.id, 'holat', 'berildi', 'qator_soni', jsonb_array_length(p_qatorlar)),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, public._t2_yet_aloqa_faol(p_kompaniya_id, v_rfq.kompaniya_id), array[v_rfq.kompaniya_id]);
  return jsonb_build_object('ok', true, 'id', v_tid, 'versiya', 1);
end $$;

create or replace function public.t2_tender_taklif_qaytar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_taklif_id bigint, p_kutilgan_versiya integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.t2_birja_taklif; v_rfq public.t2_birja_rfq; v_n integer;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'taklif');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_t from public.t2_birja_taklif where id = p_taklif_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_t.holat = 'qaytarib_olindi' then return jsonb_build_object('ok', true, 'takror', true, 'versiya', v_t.versiya); end if;
  if v_t.holat not in ('berildi', 'faol') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_t.holat); end if;
  if v_t.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_t.versiya); end if;
  if exists (select 1 from public.t2_birja_rfq_qator q join public.t2_birja_taklif_qator tq on tq.id = q.golib_taklif_qator_id where tq.taklif_id = v_t.id) then return jsonb_build_object('ok', false, 'code', 'TAKLIF_GOLIB'); end if;
  update public.t2_birja_taklif set holat = 'qaytarib_olindi', versiya = versiya + 1, yangilandi = now() where id = v_t.id and versiya = p_kutilgan_versiya;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = v_t.rfq_id;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.taklif', 't2_birja_taklif', v_t.id, jsonb_build_object('rfq_id', v_t.rfq_id, 'holat', 'qaytarib_olindi'),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, public._t2_yet_aloqa_faol(p_kompaniya_id, v_rfq.kompaniya_id), array[v_rfq.kompaniya_id]);
  return jsonb_build_object('ok', true, 'id', v_t.id, 'versiya', p_kutilgan_versiya + 1);
end $$;

-- G'olib: taklif (yoki uning ayrim qatorlari) tanlanadi -> buyurtma. PTO/boss ('xarid_tasdiq').
create or replace function public.t2_tender_golib_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer, p_taklif_id bigint,
  p_qator_idlar bigint[] default null, p_shart jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rfq public.t2_birja_rfq; v_t public.t2_birja_taklif; v_b public.t2_buyurtma; v_aloqa bigint; v_lines jsonb; v_tqs bigint[]; v_rqs bigint[];
  v_res jsonb; v_yet numeric; v_qat_son integer; v_golib_son integer; v_n integer;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'xarid_tasdiq');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_b from public.t2_buyurtma where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'buyurtma_id', v_b.id); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.holat not in ('elon', 'ochiq') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  select * into v_t from public.t2_birja_taklif where id = p_taklif_id and rfq_id = v_rfq.id and holat in ('berildi', 'faol', 'golib') for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_YOQ'); end if;
  select array_agg(tq.id order by q.qator_no), array_agg(q.id order by q.qator_no) into v_tqs, v_rqs
    from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id
   where tq.taklif_id = v_t.id and (p_qator_idlar is null or q.id = any (p_qator_idlar));
  if v_rqs is null then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
  if p_qator_idlar is not null and cardinality(v_rqs) <> (select count(distinct x) from unnest(p_qator_idlar) x) then return jsonb_build_object('ok', false, 'code', 'QATOR_BEGONA'); end if;
  if exists (select 1 from public.t2_birja_rfq_qator q where q.id = any (v_rqs) and q.golib_taklif_qator_id is not null) then return jsonb_build_object('ok', false, 'code', 'QATOR_BAND'); end if;
  v_aloqa := public._t2_yet_aloqa_faol(p_kompaniya_id, v_t.kompaniya_id);
  if v_aloqa is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_KERAK', 'kompaniya_id', v_t.kompaniya_id); end if;
  select coalesce(jsonb_agg(jsonb_build_object('nom', q.nom, 'birlik', q.birlik, 'miqdor', coalesce(tq.mavjud_miqdor, q.miqdor), 'narx', tq.narx, 'muddat_kun', tq.muddat_kun,
           'resurs_kodi', q.resurs_kodi, 'zayavka_id', q.zayavka_id, 'rfq_qator_id', q.id, 'taklif_qator_id', tq.id) order by q.qator_no), '[]'::jsonb) into v_lines
    from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id where tq.id = any (v_tqs);
  -- yetkazish haqi taklifning birinchi buyurtmasiga yoziladi (qisman g'olibda takrorlanmasin)
  v_yet := case when exists (select 1 from public.t2_buyurtma x where x.taklif_id = v_t.id) then null else v_t.yetkazish_narx end;
  v_res := public._t2_buyurtma_yarat_ichki(p_actor_id, p_kompaniya_id, p_operation_id, v_rfq.tur, v_t.kompaniya_id, v_aloqa, v_rfq.id, v_t.id, v_rfq.obyekt_id,
                                           v_lines, coalesce(p_shart, '{}'::jsonb), v_yet, v_t.qqs_foiz, null);
  update public.t2_birja_rfq_qator q set golib_taklif_qator_id = tq.id
    from public.t2_birja_taklif_qator tq where tq.id = any (v_tqs) and q.id = tq.rfq_qator_id;
  update public.t2_birja_taklif set holat = 'golib', versiya = versiya + 1, yangilandi = now() where id = v_t.id;
  select count(*), count(golib_taklif_qator_id) into v_qat_son, v_golib_son from public.t2_birja_rfq_qator where rfq_id = v_rfq.id;
  if v_qat_son = v_golib_son then
    update public.t2_birja_rfq set holat = 'golib_tanlandi', yopilgan_vaqt = now(), versiya = versiya + 1, yangilandi = now() where id = v_rfq.id;
    update public.t2_birja_taklif set holat = 'yutqazdi', versiya = versiya + 1, yangilandi = now()
     where rfq_id = v_rfq.id and holat in ('berildi', 'faol');
  else
    update public.t2_birja_rfq set versiya = versiya + 1, yangilandi = now() where id = v_rfq.id;
  end if;
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.golib', 't2_birja_rfq', v_rfq.id,
            jsonb_build_object('taklif_id', v_t.id, 'buyurtma_id', (v_res->>'id')::bigint, 'qator_soni', cardinality(v_rqs), 'toliq', v_qat_son = v_golib_son),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, v_aloqa, array[v_t.kompaniya_id]);
  return jsonb_build_object('ok', true, 'buyurtma_id', (v_res->>'id')::bigint, 'rfq_holat', case when v_qat_son = v_golib_son then 'golib_tanlandi' else v_rfq.holat end,
                            'rfq_versiya', v_rfq.versiya + 1);
end $$;

-- Yopish / bekor qilish (g'olibsiz).
create or replace function public.t2_tender_yop_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_rfq_id bigint, p_kutilgan_versiya integer, p_bekor boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_ga text := case when coalesce(p_bekor, false) then 'bekor' else 'yopildi' end;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'xarid_tasdiq');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_rfq.holat in ('yopildi', 'bekor', 'yopiq', 'golib_tanlandi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_rfq.holat); end if;
  if v_rfq.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_rfq.versiya); end if;
  update public.t2_birja_rfq set holat = v_ga, yopilgan_vaqt = now(), versiya = versiya + 1, yangilandi = now() where id = v_rfq.id;
  update public.t2_birja_taklif set holat = 'yutqazdi', versiya = versiya + 1, yangilandi = now() where rfq_id = v_rfq.id and holat in ('berildi', 'faol');
  perform public._t2_yet_hodisa(p_kompaniya_id, 'tender.golib', 't2_birja_rfq', v_rfq.id, jsonb_build_object('holat', v_ga, 'taklif_id', null),
            p_actor_id, p_operation_id, v_rfq.obyekt_id, null,
            coalesce((select array_agg(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = v_rfq.id), '{}'));
  return jsonb_build_object('ok', true, 'id', v_rfq.id, 'versiya', p_kutilgan_versiya + 1, 'holat', v_ga);
end $$;

-- Ro'yxat: 'meniki' | 'menga' (chaqirilgan, faol aloqada) | 'ochiq' (L3, minimal maydon). Keyset sahifalash.
create or replace function public.t2_tenderlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_tur text, p_limit integer, p_keyin_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100); v_res jsonb;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  if p_yonalish not in ('meniki', 'menga', 'ochiq') then return jsonb_build_object('ok', false, 'code', 'YONALISH_NOTOGRI'); end if;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v_res from (
    select jsonb_build_object('id', r.id, 'nom', r.nom, 'tur', r.tur, 'holat', r.holat, 'doira', r.doira, 'muddat', r.muddat,
             'muddat_otgan', r.muddat is not null and r.muddat <= now(), 'versiya', r.versiya, 'yaratildi', r.yaratilgan_vaqt,
             'egasi_kompaniya_id', r.kompaniya_id,
             'obyekt_id', case when r.kompaniya_id = p_kompaniya_id then r.obyekt_id end,
             'qator_soni', (select count(*) from public.t2_birja_rfq_qator q where q.rfq_id = r.id),
             'takliflar_soni', case when r.kompaniya_id = p_kompaniya_id then (select count(*) from public.t2_birja_taklif t where t.rfq_id = r.id and t.holat in ('berildi', 'faol', 'golib')) end,
             'mening_taklifim', (select jsonb_build_object('id', t.id, 'holat', t.holat, 'versiya', t.versiya) from public.t2_birja_taklif t
                                  where t.rfq_id = r.id and t.kompaniya_id = p_kompaniya_id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi') order by t.id desc limit 1)) as x
      from public.t2_birja_rfq r
     where (case p_yonalish
              when 'meniki' then r.kompaniya_id = p_kompaniya_id
              when 'menga' then r.kompaniya_id <> p_kompaniya_id and r.doira = 'taklif' and public._t2_tender_korinadi(r.id, p_kompaniya_id)
              else r.kompaniya_id <> p_kompaniya_id and r.doira = 'ochiq' and r.holat in ('ochiq', 'elon') and (r.muddat is null or r.muddat > now()) end)
       and (p_tur is null or r.tur = p_tur) and (p_keyin_id is null or r.id < p_keyin_id)
     order by r.id desc limit v_lim) s;
  return jsonb_build_object('ok', true, 'qatorlar', v_res, 'keyingi_id', case when jsonb_array_length(v_res) = v_lim then (v_res->(v_lim - 1)->>'id')::bigint end);
end $$;

-- Tafsilot: egasi — hamma takliflar (taqqoslash uchun); boshqa tomon — faqat o'z taklifi. Egasining obyekt/zayavka/smeta havolalari yashirin.
create or replace function public.t2_tender_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_rfq_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rfq public.t2_birja_rfq; v_egasi boolean;
begin
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into v_rfq from public.t2_birja_rfq where id = p_rfq_id;
  if not found or not public._t2_tender_korinadi(p_rfq_id, p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  v_egasi := v_rfq.kompaniya_id = p_kompaniya_id;
  return jsonb_build_object('ok', true, 'egasi', v_egasi,
    'rfq', jsonb_build_object('id', v_rfq.id, 'nom', v_rfq.nom, 'tur', v_rfq.tur, 'holat', v_rfq.holat, 'doira', v_rfq.doira, 'muddat', v_rfq.muddat,
             'izoh', v_rfq.izoh, 'shart', v_rfq.shart, 'versiya', v_rfq.versiya, 'obyekt_id', case when v_egasi then v_rfq.obyekt_id end),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'qator_no', q.qator_no, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor, 'resurs_kodi', q.resurs_kodi,
             'zayavka_id', case when v_egasi then q.zayavka_id end, 'golib_taklif_qator_id', case when v_egasi then q.golib_taklif_qator_id end) order by q.qator_no)
             from public.t2_birja_rfq_qator q where q.rfq_id = v_rfq.id), '[]'::jsonb),
    'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'yetkazuvchi_kompaniya_id', t.kompaniya_id,
             'yetkazuvchi_nom', case when v_egasi then (select k.nom from public.t2_kompaniya k where k.id = t.kompaniya_id) end,
             'holat', t.holat, 'versiya', t.versiya, 'narx', t.narx, 'yetkazish_narx', t.yetkazish_narx, 'qqs_foiz', t.qqs_foiz, 'izoh', t.izoh, 'yaratildi', t.yaratilgan_vaqt,
             'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('rfq_qator_id', tq.rfq_qator_id, 'taklif_qator_id', tq.id, 'narx', tq.narx, 'muddat_kun', tq.muddat_kun,
                          'mavjud_miqdor', tq.mavjud_miqdor, 'izoh', tq.izoh) order by tq.rfq_qator_id) from public.t2_birja_taklif_qator tq where tq.taklif_id = t.id), '[]'::jsonb)) order by t.id)
             from public.t2_birja_taklif t
            where t.rfq_id = v_rfq.id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi') and (v_egasi or t.kompaniya_id = p_kompaniya_id)), '[]'::jsonb));
end $$;

revoke all on function public._t2_tender_korinadi(bigint,bigint) from public, anon, authenticated;
revoke all on function public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb),
  public.t2_tender_taklif_ber_v1(bigint,bigint,uuid,bigint,jsonb,text,jsonb),
  public.t2_tender_taklif_qaytar_v1(bigint,bigint,uuid,bigint,integer),
  public.t2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb),
  public.t2_tender_yop_v1(bigint,bigint,uuid,bigint,integer,boolean),
  public.t2_tenderlar_v1(bigint,bigint,text,text,integer,bigint),
  public.t2_tender_tafsilot_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamptz,jsonb,jsonb),
  public.t2_tender_taklif_ber_v1(bigint,bigint,uuid,bigint,jsonb,text,jsonb),
  public.t2_tender_taklif_qaytar_v1(bigint,bigint,uuid,bigint,integer),
  public.t2_tender_golib_v1(bigint,bigint,uuid,bigint,integer,bigint,bigint[],jsonb),
  public.t2_tender_yop_v1(bigint,bigint,uuid,bigint,integer,boolean),
  public.t2_tenderlar_v1(bigint,bigint,text,text,integer,bigint),
  public.t2_tender_tafsilot_v1(bigint,bigint,bigint) to service_role;
