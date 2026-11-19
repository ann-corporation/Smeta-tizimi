-- 20270119000200 - TEXNADZOR TEKSHIRUVI, PTO TOMONI (PR-b): har taklif bo'yicha QAROR (qabul / rad sabab bilan / keyinroq), "hujjat kerak" ro'yxati
-- (Diskdagi hujjatni biriktirish) va F-2 muharriri uchun akt bo'yicha takliflar ro'yxati.
-- MUHIM: bu migratsiya F-2 jadvallariga YOZMAYDI. "Qabul" ning F-2 ga ta'siri (hajm o'zgartirish, olib tashlash + bajarilmadi) mavjud
-- /api/f2-buyruq preview->tasdiq yo'lida bajariladi (t2_f2_qoralama_yangila_v1 / t2_bajarilmadi_belgila_v1); shu yerda faqat qaror yoziladi.
-- Talab: 20270119000100.

-- PTO qarori: faqat hujjat kompaniyasi a'zosi. Rad - sabab majburiy (tekshiruvchi ko'radi). Qaror qo'yilgan taklifni tekshiruvchi o'zgartirmaydi (saqla_v1).
create or replace function public.t2_f2_tekshiruv_qaror_v1(p_actor_id bigint, p_taklif_id bigint, p_qaror text, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.t2_f2_tekshiruv_taklif%rowtype; t public.t2_f2_tekshiruv%rowtype; b public.t2_f2_tekshiruv_bog%rowtype; v_sabab text := nullif(btrim(coalesce(p_sabab, '')), '');
begin
  if p_taklif_id is null or p_taklif_id <= 0 or p_qaror is null or p_qaror not in ('kutilmoqda', 'qabul', 'rad', 'keyinroq') or length(coalesce(v_sabab, '')) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI');
  end if;
  select * into k from public.t2_f2_tekshiruv_taklif where id = p_taklif_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into t from public.t2_f2_tekshiruv where id = k.tekshiruv_id;
  select * into b from public.t2_f2_tekshiruv_bog where id = t.bog_id;
  if public._t2_f2_tekshiruv_rol_v1(p_actor_id, b.id) is distinct from 'pto' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_qaror = 'rad' and length(coalesce(v_sabab, '')) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  update public.t2_f2_tekshiruv_taklif set qaror = p_qaror, qaror_sabab = case when p_qaror in ('rad', 'keyinroq') then v_sabab else qaror_sabab end,
         qaror_id = case when p_qaror = 'kutilmoqda' then null else p_actor_id end, qaror_vaqt = case when p_qaror = 'kutilmoqda' then null else now() end, yangilandi = now()
   where id = k.id;
  perform public.t2_audit_yoz(b.kompaniya_id, 'tekshiruv_qaror', 'tekshiruv', k.id, format('taklif=%s qator=%s qaror=%s', k.id, k.qator_id, p_qaror), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qaror', p_qaror);
end $$;

-- "Hujjat kerak" talabiga Diskdagi hujjatni biriktirish (yoki p_hujjat_id = null: olib tashlash). Hujjat shu kompaniyaniki va saqlangan bo'lsin.
create or replace function public.t2_f2_tekshiruv_hujjat_v1(p_actor_id bigint, p_taklif_id bigint, p_hujjat_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.t2_f2_tekshiruv_taklif%rowtype; t public.t2_f2_tekshiruv%rowtype; b public.t2_f2_tekshiruv_bog%rowtype;
begin
  if p_taklif_id is null or p_taklif_id <= 0 then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  select * into k from public.t2_f2_tekshiruv_taklif where id = p_taklif_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into t from public.t2_f2_tekshiruv where id = k.tekshiruv_id;
  select * into b from public.t2_f2_tekshiruv_bog where id = t.bog_id;
  if public._t2_f2_tekshiruv_rol_v1(p_actor_id, b.id) is distinct from 'pto' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if k.bayroq is distinct from 'hujjat_kerak' then return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI'); end if;
  if p_hujjat_id is not null and not exists (select 1 from public.t2_hm_fayl d where d.id = p_hujjat_id and d.kompaniya_id = b.kompaniya_id and d.savatda is null) then
    return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI');
  end if;
  update public.t2_f2_tekshiruv_taklif set hm_fayl_id = p_hujjat_id, yangilandi = now() where id = k.id;
  perform public.t2_audit_yoz(b.kompaniya_id, 'tekshiruv_hujjat', 'tekshiruv', k.id, format('taklif=%s hujjat=%s', k.id, coalesce(p_hujjat_id::text, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'hujjat_id', p_hujjat_id);
end $$;

-- F-2 muharriri uchun: shu aktga (barcha QR/versiyalar bo'yicha) kelgan takliflar, qator nomi va joriy F-2 hajmi bilan. Faqat kompaniya a'zosi.
create or replace function public.t2_f2_tekshiruv_akt_takliflari_v1(p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.t2_akt%rowtype; v_tek jsonb; v_tak jsonb;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_akt_id is null
     or not exists (select 1 from public.t2_azolik z where z.kompaniya_id = p_kompaniya_id and z.foydalanuvchi_id = p_actor_id and z.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  select * into a from public.t2_akt where id = p_akt_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_TOPILMADI'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tekshiruvchi', left(coalesce(nullif(btrim(u.ism), ''), u.login), 120), 'holat', t.holat, 'izoh', t.izoh,
           'akt_versiya', b.akt_versiya, 'eskirgan', b.akt_versiya is distinct from a.versiya, 'yangilandi', t.yangilandi, 'token', n.token) order by t.id desc), '[]'::jsonb) into v_tek
    from public.t2_f2_tekshiruv t join public.t2_f2_tekshiruv_bog b on b.id = t.bog_id left join public.t2_nashr n on n.id = b.nashr_id join public.t2_foydalanuvchi u on u.id = t.tekshiruvchi_id
   where b.akt_id = a.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'tekshiruv_id', k.tekshiruv_id, 'qator_id', k.qator_id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'bayroq', k.bayroq, 'izoh', k.izoh,
           'taklif_hajm', k.taklif_hajm, 'rang', k.rang, 'hujjat_turi', k.hujjat_turi, 'qosh', k.qosh, 'qaror', k.qaror, 'qaror_sabab', k.qaror_sabab,
           'hujjat_id', k.hm_fayl_id, 'joriy_hajm', (select coalesce(aq.certified_quantity, aq.hajm) from public.t2_akt_qator aq where aq.akt_id = a.id and aq.qator_id = k.qator_id and aq.manba_akt_qator_id is null limit 1),
           'akt_versiya', b.akt_versiya, 'eskirgan', b.akt_versiya is distinct from a.versiya) order by q.tartib nulls last, k.id), '[]'::jsonb) into v_tak
    from public.t2_f2_tekshiruv_taklif k join public.t2_f2_tekshiruv t on t.id = k.tekshiruv_id join public.t2_f2_tekshiruv_bog b on b.id = t.bog_id join public.t2_qator q on q.id = k.qator_id
   where b.akt_id = a.id;
  return jsonb_build_object('ok', true, 'akt', jsonb_build_object('id', a.id, 'versiya', a.versiya, 'holat', a.holat, 'lifecycle_status', a.lifecycle_status), 'tekshiruvlar', v_tek, 'takliflar', v_tak);
end $$;
comment on function public.t2_f2_tekshiruv_akt_takliflari_v1(bigint, bigint, bigint) is 'versiya: tarix - F-2 qatori akt orqali; taklif qatori nomi smeta tarixidan ham olinadi.';

do $g$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('t2_f2_tekshiruv_qaror_v1', 't2_f2_tekshiruv_hujjat_v1', 't2_f2_tekshiruv_akt_takliflari_v1') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $g$;
