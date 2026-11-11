-- 20261215300000_t2_esf_tayyorlash_v1  (P4 «E-faktura tayyorlash»)
-- Forma 3 dan ESF (elektron hisob-faktura) paketini tayyorlash uchun MINIMAL saqlash:
--   * t2_shartnoma: ESF ID maydonlari (my3.soliq.uz shartnoma ID / kapital.imv.uz ID / kadastr raqami) + qaysi biri talab qilinishi.
--   * t2_forma3: FAQAT holat + tashqi ID (didox/faktura.uz dagi hujjat ID). ESF mazmuni bazada saqlanmaydi (brauzerda quriladi).
-- Qaysi ID majburiy ekani yuridik da'vo sifatida qotirilmagan: shartnomadagi esf_id_turi (NULL = hali tanlanmagan) — «T — tekshirilsin».
-- DB hajmi: ~0 MB/oy (bir nechta ustun, qator qo'shilmaydi). Hech qanday tashqi servis chaqirilmaydi, kalit saqlanmaydi.
-- versiya: tarix
-- BEGIN/COMMIT yo'q (migratsiya yuritgichi o'zi o'raydi).

alter table public.t2_shartnoma
  add column if not exists esf_id_turi        text,
  add column if not exists my3_shartnoma_id   text,
  add column if not exists kapital_imv_id     text,
  add column if not exists kadastr_raqam      text;

alter table public.t2_shartnoma drop constraint if exists t2_shartnoma_esf_id_turi_chk;
alter table public.t2_shartnoma add constraint t2_shartnoma_esf_id_turi_chk
  check (esf_id_turi is null or esf_id_turi in ('my3','kapital','kadastr'));

alter table public.t2_forma3
  add column if not exists esf_holat       text,
  add column if not exists esf_tashqi_id   text,
  add column if not exists esf_yangilandi  timestamptz;

alter table public.t2_forma3 drop constraint if exists t2_forma3_esf_holat_chk;
alter table public.t2_forma3 add constraint t2_forma3_esf_holat_chk
  check (esf_holat is null or esf_holat in ('tayyor','yuborildi','qabul','rad'));

-- Shartnomaning ESF ID maydonlarini yozish (rahbar/bugalter/boss). Bo'sh matn → NULL.
create or replace function public.t2_shartnoma_esf_id_v1(
  p_actor_id bigint, p_shartnoma_id bigint, p_id_turi text,
  p_my3 text, p_kapital text, p_kadastr text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_rol text;
begin
  if p_id_turi is not null and p_id_turi not in ('my3','kapital','kadastr') then
    return jsonb_build_object('ok',false,'code','ESF_ID_TURI_INVALID');
  end if;
  select kompaniya_id into v_komp from public.t2_shartnoma where id = p_shartnoma_id and holat <> 'bekor';
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss','superadmin','rahbar','bugalter') then
    return jsonb_build_object('ok',false,'code','ESF_DENIED');
  end if;
  update public.t2_shartnoma
     set esf_id_turi = p_id_turi,
         my3_shartnoma_id = nullif(btrim(left(coalesce(p_my3,''),64)),''),
         kapital_imv_id   = nullif(btrim(left(coalesce(p_kapital,''),64)),''),
         kadastr_raqam    = nullif(btrim(left(coalesce(p_kadastr,''),64)),'')
   where id = p_shartnoma_id;
  return jsonb_build_object('ok',true,'shartnoma_id',p_shartnoma_id);
end $function$;

-- Forma 3 ESF holati + tashqi ID (faqat shu ikki maydon; summa/qator tegilmaydi).
create or replace function public.t2_forma3_esf_holat_v1(
  p_actor_id bigint, p_forma3_id bigint, p_holat text, p_tashqi_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_rol text;
begin
  if p_holat is not null and p_holat not in ('tayyor','yuborildi','qabul','rad') then
    return jsonb_build_object('ok',false,'code','ESF_HOLAT_INVALID');
  end if;
  select kompaniya_id into v_komp from public.t2_forma3 where id = p_forma3_id and coalesce(holat,'') <> 'bekor';
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss','superadmin','rahbar','bugalter') then
    return jsonb_build_object('ok',false,'code','ESF_DENIED');
  end if;
  update public.t2_forma3
     set esf_holat = p_holat,
         esf_tashqi_id = nullif(btrim(left(coalesce(p_tashqi_id,''),128)),''),
         esf_yangilandi = now()
   where id = p_forma3_id;
  perform public.t2_audit_yoz(v_komp, 'forma3_esf_holat', 'smeta', null,
    format('forma3_id=%s esf_holat=%s', p_forma3_id, coalesce(p_holat,'-')), 'actor:'||p_actor_id, null);
  return jsonb_build_object('ok',true,'forma3_id',p_forma3_id,'esf_holat',p_holat);
end $function$;

revoke all on function public.t2_shartnoma_esf_id_v1(bigint,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.t2_forma3_esf_holat_v1(bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.t2_shartnoma_esf_id_v1(bigint,bigint,text,text,text,text) to service_role;
grant execute on function public.t2_forma3_esf_holat_v1(bigint,bigint,text,text) to service_role;
