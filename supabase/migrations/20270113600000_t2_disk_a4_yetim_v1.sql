-- Disk A4: "Biriktirilmagan" papka - har fayl uchun "Qaysi obyekt/loyihaga?" (taklif + bir bosishda ko'chirish).
--  * t2_disk_yetim_royxat_v1: papkadagi fayllar + taklif uchun metama'lumot (registry: asl nom, tur, oy, loyiha/obyekt) + nomzodlar (obyekt/loyiha/shartnoma).
--  * t2_disk_yetim_kochir_v1: faylni tanlangan loyiha/obyekt yo'liga ko'chiradi (A1 ning _t2_disk_yol_v1 si bilan: tizim papkalari idempotent yaratiladi).
--    Versiyalar, R2 va registry qatorlari O'ZGARMAYDI (faqat t2_hm_fayl.papka_id va - to'qnashmasa - hujjat_kalit dagi obyekt qismi).
--  * Faqat service_role (server: /api/hujjat-maydoni?amal=yetim ...). Ruxsat: a'zolik + papka/fayl darajasi (>= 3 ko'chirish uchun).
create or replace function public._t2_disk_yetim_papka_v1(p_kompaniya bigint)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.t2_fayl_papka where kompaniya_id = p_kompaniya and tizim_kalit = 'biriktirilmagan' $$;

create or replace function public.t2_disk_yetim_royxat_v1(p_actor bigint, p_kompaniya bigint, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_p bigint; v_d integer; v_fay jsonb; v_oby jsonb; v_loy jsonb; v_lim integer := least(greatest(coalesce(p_limit, 300), 1), 500);
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya, p_actor);
  v_p := public._t2_disk_yetim_papka_v1(p_kompaniya);
  if v_p is null then return jsonb_build_object('ok', true, 'papka_id', null, 'daraja', 0, 'fayllar', '[]'::jsonb, 'obyektlar', '[]'::jsonb, 'loyihalar', '[]'::jsonb); end if;
  v_d := public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, v_p, null);
  if v_d < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;

  select coalesce(jsonb_agg(x order by x->>'nom'), '[]'::jsonb) into v_fay from (
    select jsonb_build_object('id', f.id, 'nom', f.nom, 'mime', f.mime, 'bayt', vv.bayt, 'versiya', vv.raqam, 'yangilandi', f.yangilandi,
        'manba_turi', f.manba_turi, 'manba_id', f.manba_id, 'hujjat_kalit', f.hujjat_kalit,
        'asl_nom', rg.original_filename, 'hujjat_turi', rg.document_type, 'revision', rg.revision, 'slot', rg.source_slot_key,
        'registry_loyiha_id', rg.loyiha_id, 'registry_obyekt_id', rg.obyekt_id) as x
      from public.t2_hm_fayl f
      left join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id
      left join lateral (select d.original_filename, d.document_type, d.revision, d.source_slot_key, d.loyiha_id, d.obyekt_id
                           from public.t2_hm_versiya z join public.t2_document_registry d on d.id = z.registry_id
                          where z.fayl_id = f.id and z.registry_id is not null order by z.raqam desc limit 1) rg on true
     where f.kompaniya_id = p_kompaniya and f.papka_id = v_p and f.savatda is null
     order by f.nom limit v_lim) q;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'loyiha_id', o.loyiha_id, 'loyiha_nom', l.nom, 'shartnoma_id', sh.id, 'shartnoma_raqam', sh.raqam) order by o.id), '[]'::jsonb) into v_oby
    from public.t2_obyekt o join public.t2_loyiha l on l.id = o.loyiha_id and l.kompaniya_id = p_kompaniya
    left join public.t2_shartnoma sh on sh.id = public._t2_disk_shartnoma_v1(p_kompaniya, o.id)
   where o.kompaniya_id = p_kompaniya;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom) order by l.id), '[]'::jsonb) into v_loy from public.t2_loyiha l where l.kompaniya_id = p_kompaniya;

  return jsonb_build_object('ok', true, 'papka_id', v_p, 'daraja', v_d, 'fayllar', v_fay, 'obyektlar', v_oby, 'loyihalar', v_loy);
end $$;

create or replace function public.t2_disk_yetim_kochir_v1(p_actor bigint, p_kompaniya bigint, p_fayl_id bigint, p_loyiha_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.t2_hm_fayl%rowtype; d public.t2_document_registry%rowtype; v_p bigint; v_l bigint := p_loyiha_id; v_o bigint := p_obyekt_id; v_ol bigint; v_s bigint; v_leaf bigint;
  v_tur text; v_oy text; v_daraja text; v_nom text; v_yangi text; v_eski text; v_obnom text; v_loynom text;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya, p_actor);
  v_p := public._t2_disk_yetim_papka_v1(p_kompaniya);
  select * into f from public.t2_hm_fayl where id = p_fayl_id and kompaniya_id = p_kompaniya for update;
  if not found or f.savatda is not null then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if v_p is null or f.papka_id is distinct from v_p then return jsonb_build_object('ok', false, 'code', 'YETIM_EMAS'); end if;
  if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if public._t2_hm_pinli_fayl_v1(f.id) then return jsonb_build_object('ok', false, 'code', 'TAQDIMDA'); end if;

  if v_o is not null then
    select o.loyiha_id, o.nom into v_ol, v_obnom from public.t2_obyekt o where o.id = v_o and o.kompaniya_id = p_kompaniya;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBYEKT_TOPILMADI'); end if;
    if v_l is not null and v_ol is distinct from v_l then return jsonb_build_object('ok', false, 'code', 'LOYIHA_MOS_EMAS'); end if;
    v_l := coalesce(v_l, v_ol);
  end if;
  if v_l is null then return jsonb_build_object('ok', false, 'code', 'LOYIHA_KERAK'); end if;
  select l.nom into v_loynom from public.t2_loyiha l where l.id = v_l and l.kompaniya_id = p_kompaniya;
  if not found then return jsonb_build_object('ok', false, 'code', 'LOYIHA_TOPILMADI'); end if;
  if v_o is not null then v_s := public._t2_disk_shartnoma_v1(p_kompaniya, v_o); end if;

  -- hujjat turi/oyi: oxirgi versiyaning registry qatoridan; bo'lmasa (foydalanuvchi yuklagan fayl) - umumiy 'hujjat'
  select dd.* into d from public.t2_hm_versiya z join public.t2_document_registry dd on dd.id = z.registry_id where z.fayl_id = f.id and z.registry_id is not null order by z.raqam desc limit 1;
  v_tur := coalesce(d.document_type, 'hujjat');
  v_oy := case when d.id is not null then public._t2_disk_oy_v1(d) end;
  v_daraja := case when v_tur in ('f3', 'sverka', 'shartnoma_oylik_paket') or f.manba_turi in ('forma3', 'f3', 'sverka', 'oylik_paket', 'shartnoma_oylik_paket', 'shartnoma_svod') then 'shartnoma' else 'obyekt' end;
  v_leaf := public._t2_disk_yol_v1(p_kompaniya, v_l, v_s, v_o, v_daraja, v_tur, v_oy, p_actor);

  v_nom := f.nom;
  if exists (select 1 from public.t2_hm_fayl x where x.kompaniya_id = p_kompaniya and x.papka_id is not distinct from v_leaf and lower(x.nom) = lower(v_nom) and x.savatda is null and x.id <> f.id) then
    v_nom := left(v_nom, 180) || ' (#' || f.id || ')';
  end if;

  -- kalit qoidasi: obyekt qismi bor kalit (<tur>:<obyekt>:...) yangi obyekt bilan qayta hisoblanadi; to'qnashsa yoki f2:/f3:/tmp: bo'lsa o'zgarmaydi
  v_eski := f.hujjat_kalit; v_yangi := v_eski;
  if v_eski is not null and v_eski !~ '^(f2|f3|tmp):' and d.id is not null and v_o is not null then
    v_yangi := public._t2_disk_kalit_v1(null, null, d.document_type, v_o, v_oy, d.original_filename, d.source_slot_key);
    if v_yangi is distinct from v_eski and exists (select 1 from public.t2_hm_fayl x where x.kompaniya_id = p_kompaniya and x.hujjat_kalit = v_yangi and x.id <> f.id) then v_yangi := v_eski; end if;
  end if;

  update public.t2_hm_fayl set papka_id = v_leaf, nom = v_nom, hujjat_kalit = v_yangi, yangilandi = now() where id = f.id;
  perform public._t2_hm_log_v1(p_kompaniya, null, f.id, p_actor, 'kochirildi', left(v_nom || ' -> ' || coalesce(v_obnom, v_loynom), 200));
  return jsonb_build_object('ok', true, 'fayl_id', f.id, 'papka_id', v_leaf, 'loyiha_id', v_l, 'obyekt_id', v_o, 'shartnoma_id', v_s, 'nom', v_nom, 'kalit', v_yangi);
end $$;

do $g$ declare s text; begin
  foreach s in array array['_t2_disk_yetim_papka_v1(bigint)', 't2_disk_yetim_royxat_v1(bigint, bigint, integer)', 't2_disk_yetim_kochir_v1(bigint, bigint, bigint, bigint, bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
