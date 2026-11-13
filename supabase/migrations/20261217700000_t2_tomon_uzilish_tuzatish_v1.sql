-- 20261217700000 - tomonlararo zanjirdagi uch uzilishni tuzatish.
-- A) Bildirishnoma qabul qiluvchilari: dispetcher faqat boss/admin/rahbar/director/pto ga yozardi. Endi hodisa mavzusi -> kerakli ruxsat (capability)
--    jadvali (t2_outbox_mavzu_ruxsat) orqali: a'zoning roli bergan ruxsatlar (t2_azolik_permissions_v2, t2_role_permissions_v2 manbai) mavzu ruxsatlari bilan
--    kesishsa — qabul qiluvchi. Boshqaruv rollari (boss/admin/rahbar/director/pto) AVVALGIDEK doim oladi (orqaga moslik, additiv). Mavzusi jadvalda yo'q
--    hodisa (tomon.grant/taklif/qabul) — faqat boshqaruv rollariga. outbox.foydalanuvchi_idlar aniq berilsa — o'sha ustun (o'zgarmagan).
--    Takrorlanmaydi: (foydalanuvchi_id, outbox_id) unique + union.
-- B) t2_tender_elon_v1 doira='ochiq' lotni protsess_v2=false bilan yaratar va u t2_tn_ochiq_royxat_v1 ga hech qachon tushmasdi. Bitta yo'l — v2:
--    v1 ochiq doirada aniq OCHIQ_V2_KERAK (obyekt/rol/qator tekshiruvlaridan KEYIN, shuning uchun mavjud kontrakt testlari o'zgarmaydi). UI/shlyuz v1 elon'ni
--    chaqirmaydi (frontend: faqat t2_tender_saqla_v1 / t2_tn_lot_smetadan_v1). Prodda v1 ochiq lot: 0 qator; bo'lsa — o'chirilmaydi, e'londagilari v2 ga belgilanadi.
-- C) Lab protokol fayli: lab_natija granti bor tomon (texnadzor, buyurtmachi) protokol PDF sini t2_tomon_hujjat_ol_v1 orqali oladi (yangi parallel yo'l yo'q):
--    hujjat = t2_lab_sinov_sorov.fayl_document_id, natija yozilgan, a'zoning kompaniyasi t2_tomon_ruxsat_bor(.., 'lab_natija','korish', obyekt) bo'yicha ruxsatli.
--    Grantsiz/begona — DOCUMENT_FORBIDDEN, grant bekor bo'lsa yopiladi. Talab: 20261217500000 (lab_natija resursi) qo'llangan.

-- ===== A. mavzu -> ruxsat =====
create table if not exists public.t2_outbox_mavzu_ruxsat (
  mavzu_naqsh text primary key,
  ruxsatlar text[] not null check (cardinality(ruxsatlar) >= 1),
  izoh text
);
alter table public.t2_outbox_mavzu_ruxsat enable row level security;
revoke all on table public.t2_outbox_mavzu_ruxsat from public, anon, authenticated;
grant select on table public.t2_outbox_mavzu_ruxsat to service_role;

insert into public.t2_outbox_mavzu_ruxsat (mavzu_naqsh, ruxsatlar, izoh) values
  ('tomon.taqdim', array['f2.read', 'quality.decide', 'design.read'], 'taqdim: F2/AOSR/chizma ni ko''ra oladiganlar va sifat qarorini chiqaradiganlar'),
  ('tomon.qaror', array['f2.prepare', 'design.write', 'document.write'], 'qaror: hujjatni tayyorlab yuborgan tomon (pto/prorab/loyihachi)'),
  ('tomon.murojaat%', array['document.write', 'quality.read', 'f2.prepare', 'design.write', 'f2.read'], 'murojaat/predpisaniya/sinov so''rovi: ijrochi tomon xodimlari'),
  ('lab.natija', array['quality.read', 'f2.read'], 'laboratoriya natijasi: sifat va qabul ruxsati borlar'),
  ('tender.%', array['procurement.read'], 'tender: xarid ruxsati borlar (yetkazuvchi, prorab, pto)'),
  ('yuk.%', array['logistics.read', 'logistics.dispatch'], 'yuk/logistika'),
  ('chizma.%', array['design.read', 'design.write'], 'chizma: loyihachi va qabul qiluvchi'),
  ('naryad.%', array['self.work.write', 'fakt.write'], 'naryad: usta va prorab'),
  ('topshiriq.%', array['self.work.write', 'fakt.write'], 'topshiriq: usta va prorab')
on conflict (mavzu_naqsh) do nothing;

create or replace function public.t2_outbox_ishlov_v1(p_iste_molchi text default 'bildirishnoma', p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_oxirgi bigint; v_chegara bigint; v_max bigint; v_soni integer := 0; v_bild integer := 0;
begin
  if p_iste_molchi is distinct from 'bildirishnoma' then
    return jsonb_build_object('ok', false, 'code', 'ISTE_MOLCHI_NOMALUM');
  end if;
  insert into public.t2_outbox_kursor (iste_molchi) values (p_iste_molchi) on conflict do nothing;
  select oxirgi_id into v_oxirgi from public.t2_outbox_kursor where iste_molchi = p_iste_molchi for update;
  select min(o.id) into v_chegara from public.t2_outbox o
   where o.id > v_oxirgi and o.yaratildi >= now() - interval '60 seconds';
  with partiya as (
    select o.* from public.t2_outbox o
     where o.id > v_oxirgi and (v_chegara is null or o.id < v_chegara)
     order by o.id limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ), qabul as (
    select p.id outbox_id, p.mavzu, p.payload, a.foydalanuvchi_id, a.kompaniya_id
      from partiya p
      join public.t2_azolik a on a.kompaniya_id = any (p.qabul_kompaniya_idlar) and a.holat = 'faol'
     where a.foydalanuvchi_id is distinct from p.actor_id
       and (a.rol in ('boss', 'admin', 'rahbar', 'director', 'pto')
            or exists (select 1 from public.t2_outbox_mavzu_ruxsat m
                        where p.mavzu like m.mavzu_naqsh and m.ruxsatlar && public.t2_azolik_permissions_v2(a.id)))
    union
    select p.id, p.mavzu, p.payload, u.uid, null::bigint
      from partiya p cross join lateral unnest(p.foydalanuvchi_idlar) as u(uid)
     where u.uid is distinct from p.actor_id
  ), ins as (
    insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit, parametrlar)
    select q.foydalanuvchi_id, q.kompaniya_id, q.outbox_id, q.mavzu, 'bildirishnoma.' || q.mavzu, q.payload
      from qabul q
      join public.t2_foydalanuvchi f on f.id = q.foydalanuvchi_id and f.holat = 'faol'
    on conflict (foydalanuvchi_id, outbox_id) do nothing
    returning 1
  )
  select (select count(*) from partiya), (select max(id) from partiya), (select count(*) from ins)
    into v_soni, v_max, v_bild;
  if v_max is not null then
    update public.t2_outbox_kursor set oxirgi_id = v_max, yangilandi = now() where iste_molchi = p_iste_molchi;
  end if;
  return jsonb_build_object('ok', true, 'hodisa', v_soni, 'bildirishnoma', v_bild, 'kursor', coalesce(v_max, v_oxirgi));
end $fn$;

-- ===== B. tender: bitta yo'l (v2) =====
do $b$
declare d text; n text; v_sig regprocedure := 'public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamp with time zone,jsonb,jsonb)'::regprocedure;
begin
  d := pg_get_functiondef(v_sig);
  if position('OCHIQ_V2_KERAK' in d) = 0 then
    n := replace(d, 'if p_doira = ''taklif'' then',
      $r$if p_doira = 'ochiq' then return jsonb_build_object('ok', false, 'code', 'OCHIQ_V2_KERAK', 'xato', 'Ochiq lot yagona (v2) oqim orqali: t2_tn_lot_smetadan_v1 yoki t2_tender_saqla_v1, so''ng t2_tender_otish_v1 (tasdiqlashda -> elon)'); end if;
  if p_doira = 'taklif' then$r$);
    if n = d then raise exception 'tender_elon patch anchor topilmadi'; end if;
    execute n;
  end if;
end $b$;

-- mavjud v1 ochiq lotlar (prodda 0): o'chirilmaydi; e'londagilari v2 ro'yxatiga belgilanadi
update public.t2_birja_rfq set protsess_v2 = true where doira = 'ochiq' and not protsess_v2 and holat = 'elon';

-- ===== C. lab protokol fayli =====
do $c$
declare d text; n text; v_sig regprocedure := 'public.t2_tomon_hujjat_ol_v1(bigint,bigint)'::regprocedure; v_anchor text;
begin
  d := pg_get_functiondef(v_sig);
  if position('lab_natija' in d) = 0 then
    v_anchor := 'if v_egasi is null then return jsonb_build_object(''ok'', false, ''code'', ''DOCUMENT_FORBIDDEN''); end if;';
    n := replace(d, v_anchor,
      $r$if v_egasi is null then
    -- lab protokol fayli: faqat t2_lab_sinov_sorov.fayl_document_id, natija yozilgan, a'zo kompaniyasida faol lab_natija granti bor (so'rov egasi/laboratoriya o'zi bu yo'ldan tashqari)
    select d0.kompaniya_id into v_egasi
      from public.t2_lab_sinov_sorov s
      join public.t2_document_registry d0 on d0.id = s.fayl_document_id
     where s.fayl_document_id = p_document_id and s.natija is not null
       and exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = p_actor_id and z.holat = 'faol'
                    and z.kompaniya_id not in (s.kompaniya_id, s.lab_kompaniya_id)
                    and public.t2_tomon_ruxsat_bor(z.kompaniya_id, s.kompaniya_id, 'lab_natija', 'korish', s.obyekt_id))
     limit 1;
  end if;
  $r$ || v_anchor);
    if n = d then raise exception 'hujjat_ol patch anchor topilmadi'; end if;
    execute n;
  end if;
end $c$;
