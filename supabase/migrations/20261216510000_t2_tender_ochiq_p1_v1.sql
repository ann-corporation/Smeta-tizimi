-- T2 TENDER — Phase 1, OCHIQ REJIM (docs/architecture/BOZOR_TENDER_LOGISTIKA.md §B). ADDITIVE: mavjud t2_birja_rfq/t2_birja_taklif/t2_tender_* (17 RPC), t2_tender_jurnal O'ZGARMAYDI.
-- Mavjud modul allaqachon beradi (acceptance shuni TEKSHIRADI, qayta yozilmaydi): doira 'ochiq'|'taklif', MUHRLANGAN takliflar (egasi tafsilot_v2 da narxni faqat ochilgandan keyin ko'radi),
--   muddatdan keyingi taklif rad (MUDDAT_OTGAN), taklifni almashtirish/qaytarib olish, ochish = alohida audit hodisasi (t2_tender_otish_v1 'baholash', muddat o'tgach), o'zgarmas jurnal, g'olib -> buyurtma.
-- Bu migratsiya qo'shadi:
--   1. OCHIQ O'QISH (kirmasdan): faqat doira='ochiq' va holat='elon' lotlar; hajm/talab/muddat/shartlar; NARX, smeta/zayavka identifikatorlari va egasi nomi YO'Q.
--   2. Lot smeta bo'limidan: t2_tn_lot_smetadan_v1 — FAQAT hajm (nom, birlik, miqdor); smeta narxi/ustama nusxalanmaydi.
--   3. G'olibdan keyingi bog'lash (har qadam xaridor tasdig'i bilan, idempotent): aloqa (rol), material -> bozor bilan bir xil o'rtacha narx manbasi, ish/subpudrat -> t2_sub_topshir_v1 + shartnoma havolasi.
--   4. Kelishuv signallari (ogohlantirish, blok emas) va tender bayonnomasi ma'lumoti — ikkalasi FAQAT ochilgandan keyin (muhr SQL da).
-- Bog'liqlik: 20261216500000 (yordamchi _t2_bz_matn/_t2_bz_son). Prodga: AVVAL SQL (acceptance BEGIN..ROLLBACK), KEYIN merge. Rollback: .rollback.sql. BEGIN/COMMIT yo'q.
set local statement_timeout = '300s';

-- 1. Ichki: lot ochilganmi (muhr ochilgan)
create or replace function public._t2_tn_ochilgan(p_rfq_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_birja_rfq r where r.id = p_rfq_id and r.ochilgan_vaqt is not null
                   and r.holat in ('baholash', 'golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi', 'bekor'))
$$;

-- 1b. ERTA YOPISH MUHRNI OCHMAYDI (SQL darajasi). Mavjud t2_tender_otish_v1 'takliflar_yopildi' muddatni now() ga tushiradi va shundan keyin ochish mumkin bo'lib qolardi.
--     asl_muddat: e'lon qilingan muddat saqlanadi; ochish (ochilgan_vaqt null -> not null) asl muddat o'tmaguncha MUDDAT_OTMAGAN bilan rad etiladi.
--     Erta yopish faqat yangi takliflarni to'xtatadi (muddat <= now() => MUDDAT_OTGAN); narxlar asl muddatgacha muhrlangan. Muddatni uzaytirish (raund) asl muddatni qayta hisoblaydi.
alter table public.t2_birja_rfq add column if not exists asl_muddat timestamptz;
create or replace function public._t2_tn_muddat_muhr_trg() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.asl_muddat is not distinct from old.asl_muddat and new.muddat is distinct from old.muddat then
    if new.muddat is not null and old.muddat is not null and new.muddat < old.muddat and old.muddat > now() then
      new.asl_muddat := coalesce(old.asl_muddat, old.muddat);
    elsif new.muddat is null or (old.muddat is not null and new.muddat > old.muddat) then
      new.asl_muddat := case when old.asl_muddat is not null and new.muddat is not null and old.asl_muddat > new.muddat then old.asl_muddat end;
    end if;
  end if;
  if old.ochilgan_vaqt is null and new.ochilgan_vaqt is not null and coalesce(new.asl_muddat, new.muddat) > now() then
    raise exception 'MUDDAT_OTMAGAN' using errcode = 'P0001', detail = 'Erta yopilgan tenderda ham narxlar e''lon qilingan muddatgacha muhrlangan';
  end if;
  return new;
end $$;
drop trigger if exists t2_birja_rfq_muddat_muhr on public.t2_birja_rfq;
create trigger t2_birja_rfq_muddat_muhr before update on public.t2_birja_rfq for each row execute function public._t2_tn_muddat_muhr_trg();

-- 2. OCHIQ RO'YXAT va LOT (kirmasdan). doira='ochiq', holat='elon', muddat o'tmagan. Takliflar faqat SONI.
--    OQ RO'YXAT (aniq jsonb_build_object): byudjet va baholash mezoni (meyor) HECH QACHON ochiq emas (null sifatida ham). Egasi nomi faqat lotda `egasini_korsat` belgisi bo'lsa.
create or replace function public.t2_tn_ochiq_royxat_v1(p_filtr jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tur text := public._t2_bz_matn(p_filtr, 'tur', 40); v_q text := public._t2_bz_kalit(p_filtr ->> 'q');
  v_lim integer := least(greatest(coalesce(public._t2_bz_son(p_filtr, 'limit')::integer, 40), 1), 100);
begin
  return jsonb_build_object('ok', true, 'lotlar', coalesce((select jsonb_agg(
      jsonb_build_object('id', r.id, 'raqam', r.raqam, 'nom', r.nom, 'tur', r.tur, 'muddat', r.muddat, 'valyuta', r.valyuta,
        'qator_soni', (select count(*) from public.t2_birja_rfq_qator q where q.rfq_id = r.id),
        'takliflar_soni', (select count(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = r.id and t.holat in ('berildi', 'faol')))
      || case when r.shart ->> 'egasini_korsat' = 'true' then jsonb_build_object('egasi_nom', (select k.nom from public.t2_kompaniya k where k.id = r.kompaniya_id)) else '{}'::jsonb end
      order by r.muddat, r.id)
    from (select * from public.t2_birja_rfq r0
           where r0.protsess_v2 and r0.doira = 'ochiq' and r0.holat = 'elon' and (r0.muddat is null or r0.muddat > now())
             and (v_tur is null or r0.tur = v_tur) and (v_q = '' or public._t2_bz_kalit(r0.nom) like '%' || v_q || '%')
           order by r0.muddat, r0.id limit v_lim) r), '[]'::jsonb));
end $$;

create or replace function public.t2_tn_ochiq_lot_v1(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq;
begin
  select * into r from public.t2_birja_rfq where id = p_id and protsess_v2 and doira = 'ochiq' and holat = 'elon';
  if not found then return jsonb_build_object('ok', false, 'code', 'LOT_TOPILMADI'); end if;
  return jsonb_build_object('ok', true,
    'lot', jsonb_build_object('id', r.id, 'raqam', r.raqam, 'nom', r.nom, 'tur', r.tur, 'muddat', r.muddat, 'muddat_otgan', r.muddat is not null and r.muddat <= now(), 'izoh', r.izoh,
      'tolov_sharti', r.tolov_sharti, 'valyuta', r.valyuta, 'qqs_foiz', r.qqs_foiz, 'baholash_usuli', r.baholash_usuli,
      'takliflar_soni', (select count(distinct t.kompaniya_id) from public.t2_birja_taklif t where t.rfq_id = r.id and t.holat in ('berildi', 'faol')))
      || case when r.shart ->> 'egasini_korsat' = 'true' then jsonb_build_object('egasi_nom', (select k.nom from public.t2_kompaniya k where k.id = r.kompaniya_id)) else '{}'::jsonb end,
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('qator_no', q.qator_no, 'lot_no', q.lot_no, 'lot_nom', q.lot_nom, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor,
      'talab_sana', q.talab_sana, 'yetkazish_joyi', q.yetkazish_joyi, 'spets', q.spets) order by q.qator_no) from public.t2_birja_rfq_qator q where q.rfq_id = r.id), '[]'::jsonb));
end $$;

-- 3. LOT smeta bo'limidan: FAQAT hajm. Mavjud t2_tender_saqla_v1 chaqiriladi (qoralama yaratadi; elon — mavjud oqim: tasdiqlashda -> elon).
create or replace function public.t2_tn_lot_smetadan_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ob bigint := public._t2_bz_son(p_data, 'obyekt_id')::bigint; v_bo bigint := public._t2_bz_son(p_data, 'bolim_id')::bigint;
  v_tur text := coalesce(public._t2_bz_matn(p_data, 'tur', 30), 'subpudrat'); v_doira text := coalesce(public._t2_bz_matn(p_data, 'doira', 10), 'ochiq');
  v_nom text := public._t2_bz_matn(p_data, 'nom', 200); v_muddat timestamptz; v_qat jsonb; v_n integer; v_bn text; v_rec bigint[] := '{}'; v_r jsonb; v_turlar text[];
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  if v_tur not in ('material', 'subpudrat', 'texnika_ijara') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_doira not in ('ochiq', 'taklif') then return jsonb_build_object('ok', false, 'code', 'DOIRA_NOTOGRI'); end if;
  if v_ob is null or not public._t2_obyekt_doira_ok(p_actor_id, p_kompaniya_id, v_ob) or not exists (select 1 from public.t2_obyekt where id = v_ob and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  begin v_muddat := (p_data ->> 'muddat')::timestamptz; exception when others then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end;
  if v_muddat is null or v_muddat <= now() then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end if;
  if v_doira = 'taklif' and jsonb_typeof(p_data -> 'qabul') = 'array' then
    select coalesce(array_agg(x::bigint), '{}'::bigint[]) into v_rec from jsonb_array_elements_text(p_data -> 'qabul') x where x ~ '^[0-9]+$';
  end if;
  v_turlar := case v_tur when 'subpudrat' then array['bl'] when 'material' then array['mat'] else array['rs'] end;
  if v_bo is not null then
    select nom into v_bn from public.t2_qator where id = v_bo and obyekt_id = v_ob and kompaniya_id = p_kompaniya_id and versiya_holat = 'faol';
    if not found then return jsonb_build_object('ok', false, 'code', 'BOLIM_BEGONA'); end if;
  end if;
  with recursive d(id) as (
    select q.id from public.t2_qator q where v_bo is not null and q.id = v_bo and q.obyekt_id = v_ob and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol'
    union all select c.id from public.t2_qator c join d on c.ota_id = d.id where c.obyekt_id = v_ob and c.versiya_holat = 'faol')
  select jsonb_agg(jsonb_build_object('nom', coalesce(nullif(btrim(q.nom), ''), 'Pozitsiya ' || q.id::text), 'birlik', coalesce(nullif(btrim(q.birlik), ''), 'dona'), 'miqdor', q.hajm,
           'smeta_qator_id', q.id, 'lot_no', 1, 'lot_nom', v_bn) order by q.tartib, q.id), count(*)
    into v_qat, v_n
    from public.t2_qator q
   where q.obyekt_id = v_ob and q.kompaniya_id = p_kompaniya_id and q.versiya_holat = 'faol' and q.tur = any (v_turlar) and coalesce(q.hajm, 0) > 0
     and (v_bo is null or q.id in (select id from d));
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_YOQ'); end if;
  if v_n > 200 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_KOP', 'soni', v_n); end if;
  v_r := public.t2_tender_saqla_v1(p_actor_id, p_kompaniya_id, p_operation_id, null, null, v_tur, v_doira, v_rec, v_ob, v_muddat,
           jsonb_build_object('sarlavha', coalesce(v_nom, v_bn, 'Lot'), 'izoh', public._t2_bz_matn(p_data, 'izoh', 1000), 'baholash_usuli', 'narx'), v_qat);
  if coalesce((v_r ->> 'ok')::boolean, false) and not coalesce((v_r ->> 'takror')::boolean, false) then
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, (v_r ->> 'id')::bigint, 'lot_smetadan', p_actor_id, p_kompaniya_id, jsonb_build_object('obyekt_id', v_ob, 'bolim_id', v_bo, 'qator_soni', v_n));
  end if;
  return v_r || jsonb_build_object('qator_soni', v_n);
end $$;
comment on function public.t2_tn_lot_smetadan_v1(bigint, bigint, uuid, jsonb) is 'versiya: joriy - lot faqat faol smeta qatorlari hajmidan quriladi (narx va ustama O''QILMAYDI, nusxalanmaydi).';

-- 4. G'olibdan keyin ALOQA (xaridor tasdig'i, procurement.approve). Mavjud faol aloqa qayta ishlatiladi; yo'q bo'lsa ochiq tender javobi sifatida faol aloqa yaratiladi.
create or replace function public.t2_tn_aloqa_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq; t public.t2_birja_taklif; v_qrol text; v_trol text; v_a bigint;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'tasdiq');
  select * into r from public.t2_birja_rfq where id = public._t2_bz_son(p_data, 'rfq_id')::bigint and kompaniya_id = p_kompaniya_id and protsess_v2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if not public._t2_tn_ochilgan(r.id) then return jsonb_build_object('ok', false, 'code', 'MUHRLANGAN'); end if;
  select * into t from public.t2_birja_taklif where id = public._t2_bz_son(p_data, 'taklif_id')::bigint and rfq_id = r.id and holat in ('berildi', 'faol', 'golib');
  if not found or t.kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TAKLIF_YOQ'); end if;
  v_trol := case when r.tur = 'subpudrat' then 'pudratchi' else 'buyurtmachi' end;
  v_qrol := case when r.tur = 'subpudrat' then 'subpudratchi' else 'yetkazuvchi' end;
  select a.id into v_a from public.t2_tomon_aloqa a where a.holat = 'faol' and a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = t.kompaniya_id and lower(a.qabul_rol) = v_qrol and a.turi not like 'obyekt:%' order by a.id limit 1;
  if v_a is null and r.tur <> 'subpudrat' then v_a := public._t2_yet_aloqa_faol(p_kompaniya_id, t.kompaniya_id); end if;
  if v_a is not null then return jsonb_build_object('ok', true, 'takror', true, 'aloqa_id', v_a); end if;
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, nom, holat, taklif_actor_id, javob_actor_id, javob_vaqti, izoh, operation_id)
  values (p_kompaniya_id, t.kompaniya_id, v_trol, v_qrol, case when r.tur = 'subpudrat' then 'subpudrat' else 'tender' end, left('Tender ' || coalesce(r.raqam, r.id::text), 200), 'faol', p_actor_id,
          coalesce(t.yaratdi_actor_id, p_actor_id), now(), 'Ochiq tender taklifi asosida (taklif #' || t.id::text || ')', md5('tn_aloqa:' || r.id::text || ':' || t.kompaniya_id::text)::uuid)
  returning id into v_a;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'aloqa', p_actor_id, p_kompaniya_id, jsonb_build_object('aloqa_id', v_a, 'taklif_id', t.id, 'rol', v_qrol));
  return jsonb_build_object('ok', true, 'aloqa_id', v_a);
end $$;

-- 5. NARX MANBASI (material / texnika ijarasi): har qator bo'yicha YAROQLI takliflarning arifmetik o'rtachasi (QQS siz); qaytarib olingan taklif kirmaydi. G'olibdan keyin; bitta manba (idempotent).
create or replace function public.t2_tn_narx_manba_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq; v_q jsonb; v_res jsonb; v_id bigint; v_kop boolean;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'tasdiq');
  select * into r from public.t2_birja_rfq where id = public._t2_bz_son(p_data, 'rfq_id')::bigint and kompaniya_id = p_kompaniya_id and protsess_v2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if r.tur not in ('material', 'texnika_ijara') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if r.holat not in ('golib_tanlandi', 'shartnoma', 'bajarilmoqda', 'yopildi') then return jsonb_build_object('ok', false, 'code', 'GOLIB_KERAK', 'holat', r.holat); end if;
  select n.id into v_id from public.t2_narx_manba n where n.kompaniya_id = p_kompaniya_id and n.raqam = 'tender #' || r.id::text limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'takror', true, 'narx_manba_id', v_id); end if;
  select jsonb_agg(jsonb_build_object('kod', q.resurs_kodi, 'nom', q.nom, 'birlik', q.birlik, 'narx', m.urt, 'soni', m.n) order by q.qator_no), coalesce(bool_or(m.n > 1), false)
    into v_q, v_kop
    from public.t2_birja_rfq_qator q
    cross join lateral (select round(avg(tq.narx), 2) urt, count(*) n from public.t2_birja_taklif_qator tq join public.t2_birja_taklif t on t.id = tq.taklif_id
                         where tq.rfq_qator_id = q.id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi')) m
   where q.rfq_id = r.id and m.n > 0;
  if v_q is null then return jsonb_build_object('ok', false, 'code', 'NARX_YOQ'); end if;
  v_res := public.t2_narx_manba_yoz_v1(p_kompaniya_id,
    jsonb_build_object('tur', 'kp', 'nom', left('Tender ' || coalesce(r.raqam, r.id::text), 200), 'raqam', 'tender #' || r.id::text, 'sana', current_date::text, 'nds_holati', 'nds_siz',
      'izoh', 'Ochiq tender takliflarining arifmetik o''rtachasi (QQS siz); qaytarib olingan takliflar kirmaydi'),
    v_q, 'almashtir', null, null, md5('tn_manba:' || r.id::text)::uuid, 'tender:' || p_actor_id::text);
  if not coalesce((v_res ->> 'ok')::boolean, false) then raise exception 'MANBA_RAD: %', coalesce(v_res ->> 'error', 'XATO') using errcode = 'P0001'; end if;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'narx_manba', p_actor_id, p_kompaniya_id, jsonb_build_object('narx_manba_id', (v_res ->> 'id')::bigint));
  return jsonb_build_object('ok', true, 'narx_manba_id', (v_res ->> 'id')::bigint, 'ogohlantirish', case when v_kop then 'urtacha' end, 'qatorlar', v_q);
end $$;

-- 6. ISH / SUBPUDRAT g'olibi: topshiriq (t2_sub_topshir_v1, g'olib narxlari yoki ulgurji summa) va shartnoma havolasi. Har qadam alohida chaqiriladi (xaridor tasdiqlaydi).
create or replace function public.t2_tn_ish_qadam_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq; t public.t2_birja_taklif; v_qadam text := public._t2_bz_matn(p_data, 'qadam', 20); v_a bigint; v_qat jsonb; v_um numeric := public._t2_bz_son(p_data, 'umumiy_summa'); v_n integer;
  v_res jsonb; v_nom text; v_loyiha bigint; v_jami numeric;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'tasdiq');
  if v_qadam is null or v_qadam not in ('topshiriq', 'shartnoma') then return jsonb_build_object('ok', false, 'code', 'QADAM_NOTOGRI'); end if;
  if v_um is not null and v_um < 0 then return jsonb_build_object('ok', false, 'code', 'SUMMA_NOTOGRI'); end if;
  select * into r from public.t2_birja_rfq where id = public._t2_bz_son(p_data, 'rfq_id')::bigint and kompaniya_id = p_kompaniya_id and protsess_v2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if r.tur <> 'subpudrat' then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if r.holat not in ('golib_tanlandi', 'shartnoma', 'bajarilmoqda') then return jsonb_build_object('ok', false, 'code', 'GOLIB_KERAK', 'holat', r.holat); end if;
  if (select count(*) from public.t2_birja_taklif where rfq_id = r.id and holat = 'golib') <> 1 then return jsonb_build_object('ok', false, 'code', 'BIR_GOLIB_KERAK'); end if;
  select * into t from public.t2_birja_taklif where rfq_id = r.id and holat = 'golib';
  select coalesce(jsonb_agg(jsonb_build_object('qator_id', q.smeta_qator_id, 'hajm', q.miqdor) || case when v_um is null then jsonb_build_object('narx', tq.narx) else '{}'::jsonb end order by q.qator_no), '[]'::jsonb),
         count(*), sum(q.miqdor * tq.narx)
    into v_qat, v_n, v_jami
    from public.t2_birja_rfq_qator q join public.t2_birja_taklif_qator tq on tq.id = q.golib_taklif_qator_id
   where q.rfq_id = r.id and q.smeta_qator_id is not null;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'SMETA_QATOR_YOQ'); end if;
  select nom into v_nom from public.t2_kompaniya where id = t.kompaniya_id;
  if v_qadam = 'shartnoma' then
    select loyiha_id into v_loyiha from public.t2_obyekt where id = r.obyekt_id and kompaniya_id = p_kompaniya_id;
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'shartnoma_havola', p_actor_id, p_kompaniya_id, jsonb_build_object('taklif_id', t.id));
    return jsonb_build_object('ok', true, 'shartnoma', jsonb_build_object('turi', 'subpudrat', 'nom', left('Subpudrat: ' || r.nom, 200), 'taraf', v_nom, 'loyiha_id', v_loyiha,
      'summa_bez_nds', coalesce(v_um, v_jami), 'qqs_foiz', coalesce(t.qqs_foiz, r.qqs_foiz), 'rfq_id', r.id));
  end if;
  select a.id into v_a from public.t2_tomon_aloqa a where a.holat = 'faol' and a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = t.kompaniya_id and lower(a.qabul_rol) = 'subpudratchi' and a.turi not like 'obyekt:%' order by a.id limit 1;
  if v_a is null then return jsonb_build_object('ok', false, 'code', 'ALOQA_KERAK'); end if;
  v_res := public.t2_sub_topshir_v1(p_actor_id, p_kompaniya_id, v_a, r.obyekt_id, v_qat, null, null, coalesce(t.qqs_foiz, r.qqs_foiz), v_um);
  if coalesce((v_res ->> 'ok')::boolean, false) then
    perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'sub_topshiriq', p_actor_id, p_kompaniya_id, jsonb_build_object('aloqa_id', v_a, 'taklif_id', t.id, 'qator_soni', v_n, 'ulgurji', v_um is not null));
  end if;
  return v_res;
end $$;

-- 7. KELISHUV SIGNALLARI (ogohlantirish, BLOK EMAS). FAQAT ochilgandan keyin (muhr).
create or replace function public._t2_tn_flaglar(p_rfq_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (
    select t.id, t.kompaniya_id, t.yaratdi_actor_id,
      (select sum(q.miqdor * tq.narx) from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id where tq.taklif_id = t.id) as jami
      from public.t2_birja_taklif t where t.rfq_id = p_rfq_id and t.holat in ('berildi', 'faol', 'golib', 'yutqazdi')),
  f1 as (select 'bir_foydalanuvchi'::text as tur, array_agg(id order by id) as idlar from b where yaratdi_actor_id is not null
          group by yaratdi_actor_id having count(distinct kompaniya_id) > 1),
  f2 as (select 'bir_xil_jami'::text, array_agg(id order by id) from b where jami is not null group by jami having count(*) > 1),
  f3 as (select 'bir_xil_nisbat'::text, array[x.a, x.b] from (
          select t1.taklif_id as a, t2.taklif_id as b
            from public.t2_birja_taklif_qator t1 join public.t2_birja_taklif_qator t2 on t2.rfq_qator_id = t1.rfq_qator_id and t2.taklif_id > t1.taklif_id
            join b b1 on b1.id = t1.taklif_id join b b2 on b2.id = t2.taklif_id and b2.kompaniya_id <> b1.kompaniya_id
           where t1.narx > 0 group by t1.taklif_id, t2.taklif_id
          having count(*) >= 3 and (max(t2.narx / t1.narx) - min(t2.narx / t1.narx)) < 0.0001) x)
  select coalesce(jsonb_agg(jsonb_build_object('tur', u.tur, 'taklif_idlar', to_jsonb(u.idlar))), '[]'::jsonb) from (select * from f1 union all select * from f2 union all select * from f3) u(tur, idlar)
$$;

create or replace function public.t2_tn_ogohlantirish_v1(p_kompaniya_id bigint, p_actor_id bigint, p_rfq_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  if not exists (select 1 from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2) then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if not public._t2_tn_ochilgan(p_rfq_id) then return jsonb_build_object('ok', false, 'code', 'MUHRLANGAN'); end if;
  return jsonb_build_object('ok', true, 'ogohlantirishlar', public._t2_tn_flaglar(p_rfq_id), 'eslatma', 'signal, hukm emas: g''olibni egasi tanlaydi');
end $$;

-- 8. TENDER BAYONNOMASI (hujjat ma'lumoti): FAQAT ochilgandan keyin; har chaqiruv jurnalga yoziladi, lekin bayonnoma mazmuni/xeshiga kirmaydi (qayta yuklash bir xil xesh — token mijozda xesh bo'yicha bepul).
create or replace function public.t2_tn_bayonnoma_v1(p_kompaniya_id bigint, p_actor_id bigint, p_rfq_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq; v_t jsonb; v_j jsonb; v_x text;
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'korish');
  select * into r from public.t2_birja_rfq where id = p_rfq_id and kompaniya_id = p_kompaniya_id and protsess_v2;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if not public._t2_tn_ochilgan(r.id) then return jsonb_build_object('ok', false, 'code', 'MUHRLANGAN'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('taklif_id', t.id, 'kompaniya', k.nom, 'holat', t.holat, 'qqs_foiz', coalesce(t.qqs_foiz, r.qqs_foiz), 'amal_kun', t.amal_kun, 'kafolat_oy', t.kafolat_oy,
      'yetkazish_narx', t.yetkazish_narx, 'yaratildi', t.yaratilgan_vaqt,
      'qatorlar', (select jsonb_agg(jsonb_build_object('qator_no', q.qator_no, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor, 'narx', tq.narx, 'muddat_kun', tq.muddat_kun) order by q.qator_no)
                     from public.t2_birja_taklif_qator tq join public.t2_birja_rfq_qator q on q.id = tq.rfq_qator_id where tq.taklif_id = t.id)) order by t.id), '[]'::jsonb)
    into v_t from public.t2_birja_taklif t join public.t2_kompaniya k on k.id = t.kompaniya_id where t.rfq_id = r.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'hodisa', j.hodisa, 'vaqt', j.yaratildi, 'actor_id', j.actor_id, 'payload', j.payload) order by j.id), '[]'::jsonb) into v_j
    from public.t2_tender_jurnal j where j.rfq_id = r.id and j.hodisa <> 'bayonnoma';   -- yuklab olish hodisasi mazmunga kirmaydi: qayta yuklash bir xil xesh (token yechilmaydi)
  v_x := md5(v_t::text || v_j::text);
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'bayonnoma', p_actor_id, p_kompaniya_id, jsonb_build_object('xesh', v_x));
  return jsonb_build_object('ok', true, 'xesh', v_x, 'tender', jsonb_build_object('id', r.id, 'raqam', r.raqam, 'nom', r.nom, 'tur', r.tur, 'doira', r.doira, 'holat', r.holat, 'muddat', r.muddat,
      'ochilgan_vaqt', r.ochilgan_vaqt, 'ochgan_actor_id', r.ochgan_actor_id, 'valyuta', r.valyuta, 'qqs_foiz', r.qqs_foiz, 'baholash_usuli', r.baholash_usuli, 'golib_asos', r.golib_asos, 'golib_vaqt', r.golib_vaqt),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object('qator_no', q.qator_no, 'nom', q.nom, 'birlik', q.birlik, 'miqdor', q.miqdor, 'golib_taklif_qator_id', q.golib_taklif_qator_id) order by q.qator_no)
                           from public.t2_birja_rfq_qator q where q.rfq_id = r.id), '[]'::jsonb),
    'takliflar', v_t, 'jurnal', v_j, 'ogohlantirishlar', public._t2_tn_flaglar(r.id));
end $$;

-- 9. Egasi nomini ochiq lotda ko'rsatish (lot bo'yicha belgi; sukut — YASHIRIN). Faqat egasi, faqat e'londan oldin/e'londa.
create or replace function public.t2_tn_korsatish_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_birja_rfq; v_k boolean := coalesce((p_data ->> 'korsat')::boolean, false);
begin
  perform public._t2_tender_azo(p_actor_id, p_kompaniya_id, 'yoz');
  select * into r from public.t2_birja_rfq where id = public._t2_bz_son(p_data, 'rfq_id')::bigint and kompaniya_id = p_kompaniya_id and protsess_v2 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if r.holat not in ('qoralama', 'tasdiqlashda', 'elon') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', r.holat); end if;
  update public.t2_birja_rfq set shart = coalesce(shart, '{}'::jsonb) || jsonb_build_object('egasini_korsat', v_k) where id = r.id;
  perform public._t2_tender_jurnal_yoz(p_kompaniya_id, r.id, 'egasi_korsatish', p_actor_id, p_kompaniya_id, jsonb_build_object('korsat', v_k));
  return jsonb_build_object('ok', true, 'rfq_id', r.id, 'korsat', v_k);
end $$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_tn_ochilgan(bigint)', 'public._t2_tn_flaglar(bigint)',
    'public.t2_tn_ochiq_royxat_v1(jsonb)', 'public.t2_tn_ochiq_lot_v1(bigint)', 'public.t2_tn_lot_smetadan_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tn_aloqa_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_tn_narx_manba_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tn_ish_qadam_v1(bigint,bigint,uuid,jsonb)', 'public.t2_tn_ogohlantirish_v1(bigint,bigint,bigint)', 'public.t2_tn_bayonnoma_v1(bigint,bigint,bigint)', 'public.t2_tn_korsatish_v1(bigint,bigint,uuid,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;
