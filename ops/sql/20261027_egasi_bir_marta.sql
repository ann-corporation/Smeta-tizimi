-- Egasi bir marta Supabase SQL Editor'da ishga tushiradi (2026-10-27). Hammasi BITTA tranzaksiyada: xato bo'lsa hech narsa o'zgarmaydi.
-- 1) Sinovda xato ochilgan bo'sh «X shaxsiy» (kompaniya 177) — o'chirish
-- 2) Imzochilar: 20261111500000_t2_obyekt_imzochi_v1
-- 3) Mindmap: 20261111600000_t2_mindmap_grafi_v3 (F2 faqat tasdiqlangan, signallar, shartnoma ma'lumoti, joylashuv tuzatish)
-- 4) Oxirida Amfiteatr summasi tekshiruvi (faqat o'qish) — natijani Claude'ga yuboring
begin;
delete from t2_azolik where kompaniya_id=177 and foydalanuvchi_id=183;
delete from t2_obuna where kompaniya_id=177;
delete from t2_audit_log where kompaniya_id=177;
delete from t2_onboarding_command_log where actor_id=183 and command='ish_joyi_yarat' and natija->>'kompaniya_id'='177';
delete from t2_kompaniya where id=177 and nom='X shaxsiy';
-- OBYEKT-IMZOCHI-20261026 — hujjat imzochilari LOYIHA / OBYEKT / RAZDEL darajasida, TOMONLAR o'zi tayinlaydi.
-- Egasi (2026-10-26): «imzochilar har loyihada har xil: Toshkent obyektida bitta texnadzor, boshqasida boshqa.
-- Buni TOMONLAR o'rtasida hal qilish kerak: zakazchik o'z odamlarini, pudratchi o'zini tanlaydi».
--
-- Avval: imzo tomonlari kompaniya darajasida (t2_kompaniya_sozlama 'hujjat.imzo_tomonlari') — noto'g'ri.
-- Endi: t2_obyekt_imzochi — (daraja, rol) uchun BITTA joriy qator. Daraja: 'loyiha' (butun loyiha), 'obyekt',
--   'razdel' (smeta bo'limi = t2_qator.tur='rz' qatori). Meros: razdel → obyekt → loyiha → bo'sh.
--   Bir daraja to'ldirilsa boshqasiga SILJIMAYDI: foydalanuvchi qaysi darajaga yozishni o'zi tanlaydi.
--   Eslab qolish: t2_imzochi_tarix — kompaniya kiritgan har (rol, tashkilot, lavozim, F.I.O.) takliflar uchun.
--   manba 'ozi'       — tomonning o'zi tayinlagan (ustun);
--   manba 'kiritilgan' — obyekt egasi (pudratchi) tizimda hali yo'q tomon uchun kiritgan qoralama; tomon o'zi
--                        yozgach 'ozi' bilan almashadi. «tasdiqlanmagan» deb belgilanadi.
-- Tomon aniqlash (bitta joyda): obyekt egasi → 'pudratchi'; boshqa kompaniya → faol aloqa (t2_tomon_aloqa) dagi
--   o'z rol matni (erkin matn) _t2_imzochi_rol_norm orqali yagona rol kalitiga keltiriladi,
--   va obyektni ko'rish granti (t2_tomon_ruxsat_bor 'obyekt_holat','korish') shart.
-- Mavjud 'hujjat.imzo_tomonlari' kaliti O'ZGARMAYDI: endi faqat tuzuvchi/tekshiruvchi sukut qiymati uchun.
-- Faqat service_role (shlyuz /api/tomon, actor sessiyadan). Additiv.


create table if not exists public.t2_obyekt_imzochi (
  id                    bigint generated always as identity primary key,
  daraja                text   not null check (daraja in ('loyiha','obyekt','razdel')),
  loyiha_id             bigint references public.t2_loyiha(id) on delete cascade,
  obyekt_id             bigint references public.t2_obyekt(id) on delete cascade,
  razdel_id             bigint references public.t2_qator(id) on delete cascade,
  rol                   text   not null check (rol in ('zakazchik','pudratchi','subpudratchi','texnadzor','loyihachi')),
  tomon_kompaniya_id    bigint references public.t2_kompaniya(id) on delete set null,
  kiritgan_kompaniya_id bigint not null references public.t2_kompaniya(id),
  manba                 text   not null check (manba in ('ozi','kiritilgan')),
  tashkilot             text   check (tashkilot is null or length(tashkilot) <= 200),
  lavozim               text   check (lavozim   is null or length(lavozim)   <= 200),
  fio                   text   check (fio       is null or length(fio)       <= 200),
  yangilagan_id         bigint,
  yangilangan_at        timestamptz not null default now(),
  constraint t2_obyekt_imzochi_ozi_tomon_ck check (manba <> 'ozi' or tomon_kompaniya_id is not null),
  constraint t2_obyekt_imzochi_daraja_ck check (
       (daraja = 'loyiha' and loyiha_id is not null and obyekt_id is null     and razdel_id is null)
    or (daraja = 'obyekt' and obyekt_id is not null and loyiha_id is null     and razdel_id is null)
    or (daraja = 'razdel' and obyekt_id is not null and razdel_id is not null and loyiha_id is null))
);
create unique index if not exists t2_obyekt_imzochi_loyiha_uq on public.t2_obyekt_imzochi (loyiha_id, rol) where daraja = 'loyiha';
create unique index if not exists t2_obyekt_imzochi_obyekt_uq on public.t2_obyekt_imzochi (obyekt_id, rol) where daraja = 'obyekt';
create unique index if not exists t2_obyekt_imzochi_razdel_uq on public.t2_obyekt_imzochi (razdel_id, rol) where daraja = 'razdel';
comment on table public.t2_obyekt_imzochi is
  'Hujjat imzochilari: (daraja loyiha|obyekt|razdel, rol) uchun bitta joriy qator. Faqat t2_obyekt_imzochi*_v1 RPC (service_role).';
alter table public.t2_obyekt_imzochi enable row level security;
revoke all on public.t2_obyekt_imzochi from public, anon, authenticated;

-- Eslab qolish: kompaniya qo'lda kiritgan nomlar (eng yangisi birinchi). Faqat shu kompaniyaga ko'rinadi.
create table if not exists public.t2_imzochi_tarix (
  id          bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol         text   not null check (rol in ('zakazchik','pudratchi','subpudratchi','texnadzor','loyihachi')),
  tashkilot   text, lavozim text, fio text,
  soni        integer not null default 1,
  oxirgi_at   timestamptz not null default now()
);
create index if not exists t2_imzochi_tarix_kompaniya_idx on public.t2_imzochi_tarix (kompaniya_id, oxirgi_at desc);
alter table public.t2_imzochi_tarix enable row level security;
revoke all on public.t2_imzochi_tarix from public, anon, authenticated;

-- ── Rol matnini yagona kalitga keltirish (YAGONA joy) ──
-- zakazchik|buyurtmachi|заказчик → zakazchik; texnadzor|texnik nazorat|технадзор → texnadzor;
-- subpudratchi|субподрядчик → subpudratchi; loyihachi|проектировщик → loyihachi;
-- pudratchi|bosh_pudratchi|подрядчик → pudratchi. Tanilmasa NULL. «sub» tekshiruvi «pudratchi» dan OLDIN.
create or replace function public._t2_imzochi_rol_norm(p_rol text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when r is null or r = '' then null
    when r ~ '(sub|суб)'                                                  then 'subpudratchi'
    when r ~ '(zakazchik|buyurtmachi|заказчик)'                           then 'zakazchik'
    when r ~ '(texnadzor|nazorat|технадзор|надзор)'                       then 'texnadzor'
    when r ~ '(loyihachi|проектировщик)'                                  then 'loyihachi'
    when r ~ '(pudratchi|подрядчик)'                                      then 'pudratchi'
    else null end
  from (select lower(regexp_replace(btrim(coalesce(p_rol, '')), '[ʻ''’‘`]', '', 'g')) as r) x
$$;

-- ── Kontekst: obyekt egasi, loyiha va chaqiruvchining tomoni ──
-- o_korish: chaqiruvchi obyektni ko'ra oladimi (egasi yoki faol aloqa + grant). o_tomon: rol kaliti yoki NULL.
-- Tomon HAR DOIM shu obyekt kontekstidan aniqlanadi (loyiha darajasidagi yozuv ham shu obyekt orqali yoziladi).
create or replace function public._t2_imzochi_kontekst(p_kompaniya_id bigint, p_obyekt_id bigint,
  out o_topildi boolean, out o_egasi_id bigint, out o_loyiha_id bigint, out o_egasi boolean, out o_korish boolean, out o_tomon text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  o_topildi := false; o_egasi := false; o_korish := false; o_tomon := null;
  select o.kompaniya_id, o.loyiha_id into o_egasi_id, o_loyiha_id from public.t2_obyekt o where o.id = p_obyekt_id;
  if not found then return; end if;
  o_topildi := true;
  if o_egasi_id = p_kompaniya_id then
    o_egasi := true; o_korish := true; o_tomon := 'pudratchi';
    return;
  end if;
  o_korish := public.t2_tomon_ruxsat_bor(p_kompaniya_id, o_egasi_id, 'obyekt_holat', 'korish', p_obyekt_id);
  if o_korish then
    select public._t2_imzochi_rol_norm(case when a.taklif_kompaniya_id = p_kompaniya_id then a.taklif_rol else a.qabul_rol end)
      into o_tomon
      from public.t2_tomon_aloqa a
     where a.holat = 'faol'
       and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = o_egasi_id)
         or (a.qabul_kompaniya_id = p_kompaniya_id and a.taklif_kompaniya_id = o_egasi_id))
       and public._t2_imzochi_rol_norm(case when a.taklif_kompaniya_id = p_kompaniya_id then a.taklif_rol else a.qabul_rol end) is not null
     order by a.id limit 1;
  end if;
end $$;

-- Berilgan darajadagi joriy qator (yo'q bo'lsa — id NULL bo'lgan bo'sh yozuv).
create or replace function public._t2_imzochi_qator(p_daraja text, p_loyiha_id bigint, p_obyekt_id bigint, p_razdel_id bigint, p_rol text)
returns public.t2_obyekt_imzochi language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q public.t2_obyekt_imzochi;
begin
  select * into q from public.t2_obyekt_imzochi x
   where x.rol = p_rol and x.daraja = p_daraja
     and ((p_daraja = 'loyiha' and x.loyiha_id = p_loyiha_id)
       or (p_daraja = 'obyekt' and x.obyekt_id = p_obyekt_id)
       or (p_daraja = 'razdel' and x.razdel_id = p_razdel_id));
  if not found then q := null; end if;
  return q;
end $$;

create or replace function public._t2_imzochi_json(q public.t2_obyekt_imzochi)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when q.id is null then null else jsonb_build_object(
    'daraja', q.daraja, 'razdel_id', q.razdel_id, 'tashkilot', q.tashkilot, 'lavozim', q.lavozim, 'fio', q.fio,
    'manba', q.manba, 'tomon_kompaniya_id', q.tomon_kompaniya_id, 'yangilangan_at', q.yangilangan_at) end
$$;

-- ── Yozish mumkinmi? NULL — mumkin; aks holda sabab kodi. Bitta qoida o'qish (yozish) va saqlashda. ──
create or replace function public._t2_imzochi_yozish_sabab(p_kompaniya_id bigint, p_egasi boolean, p_tomon text, p_rol text, p_qator public.t2_obyekt_imzochi)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_tomon is not null and p_rol = p_tomon then
    -- O'z tomoni: boshqa kompaniyaning 'ozi' yozuvini bosib bo'lmaydi.
    if p_qator.id is not null and p_qator.manba = 'ozi' and p_qator.tomon_kompaniya_id is distinct from p_kompaniya_id then return 'ROL_BAND'; end if;
    return null;
  end if;
  if p_egasi then
    if p_qator.id is not null and p_qator.manba = 'ozi' and p_qator.tomon_kompaniya_id is distinct from p_kompaniya_id then return 'NOT_YOUR_SIDE'; end if;
    return null;
  end if;
  return 'NOT_YOUR_SIDE';
end $$;

-- ── O'qish ──
-- p_razdel_id (ixtiyoriy): hujjat razdel kontekstiga ega bo'lsa. Javobda har rol uchun:
--   qatlamlar{loyiha,obyekt,razdel} — har darajadagi yozuv, effektiv — meros bo'yicha amaldagisi (razdel → obyekt → loyiha),
--   yozish{loyiha,obyekt,razdel} — chaqiruvchi shu darajaga yoza oladimi.
create or replace function public.t2_obyekt_imzochilar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_razdel_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  k record; v_rol text; v_l public.t2_obyekt_imzochi; v_o public.t2_obyekt_imzochi; v_r public.t2_obyekt_imzochi;
  v_out jsonb := '[]'::jsonb; v_raz bigint := null; v_eff jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  if p_obyekt_id is null or p_obyekt_id <= 0 then return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID'); end if;
  select * into k from public._t2_imzochi_kontekst(p_kompaniya_id, p_obyekt_id);
  if not coalesce(k.o_topildi, false) or not coalesce(k.o_korish, false) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_TOPILMADI');
  end if;
  if p_razdel_id is not null then
    select q.id into v_raz from public.t2_qator q where q.id = p_razdel_id and q.obyekt_id = p_obyekt_id and q.tur = 'rz';
  end if;
  foreach v_rol in array array['zakazchik','pudratchi','subpudratchi','texnadzor','loyihachi'] loop
    v_l := public._t2_imzochi_qator('loyiha', k.o_loyiha_id, p_obyekt_id, null, v_rol);
    v_o := public._t2_imzochi_qator('obyekt', k.o_loyiha_id, p_obyekt_id, null, v_rol);
    v_r := case when v_raz is not null then public._t2_imzochi_qator('razdel', k.o_loyiha_id, p_obyekt_id, v_raz, v_rol) else null end;
    v_eff := coalesce(public._t2_imzochi_json(v_r), public._t2_imzochi_json(v_o), public._t2_imzochi_json(v_l));
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'rol', v_rol,
      'effektiv', v_eff,
      'qatlamlar', jsonb_build_object('loyiha', public._t2_imzochi_json(v_l), 'obyekt', public._t2_imzochi_json(v_o), 'razdel', public._t2_imzochi_json(v_r)),
      'yozish', jsonb_build_object(
        'loyiha', k.o_loyiha_id is not null and public._t2_imzochi_yozish_sabab(p_kompaniya_id, k.o_egasi, k.o_tomon, v_rol, v_l) is null,
        'obyekt', public._t2_imzochi_yozish_sabab(p_kompaniya_id, k.o_egasi, k.o_tomon, v_rol, v_o) is null,
        'razdel', v_raz is not null and public._t2_imzochi_yozish_sabab(p_kompaniya_id, k.o_egasi, k.o_tomon, v_rol, v_r) is null)));
  end loop;
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'loyiha_id', k.o_loyiha_id, 'razdel_id', v_raz,
    'mening_tomonim', k.o_tomon, 'egasi', k.o_egasi, 'imzochilar', v_out);
end $$;

-- ── Yozish ──
-- Amal: 'taqdim' (superadmin/admin/boss/rahbar/director/pto) — PTO hujjat tayyorlovchisi ham imzochini belgilay oladi.
-- Uchala maydon bo'sh → shu darajadagi qator o'chiriladi (meros: quyi daraja → yuqori daraja qaytadi).
-- Bo'sh bo'lmagan yozuv kompaniya tarixiga (t2_imzochi_tarix) ham yoziladi — keyingi safar taklif sifatida chiqadi.
create or replace function public.t2_obyekt_imzochi_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_rol text, p_daraja text, p_razdel_id bigint,
  p_tashkilot text, p_lavozim text, p_fio text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  k record; v_prev jsonb; v_q public.t2_obyekt_imzochi; v_sabab text; v_natija jsonb; v_raz bigint := null;
  v_t text := nullif(btrim(coalesce(p_tashkilot, '')), '');
  v_l text := nullif(btrim(coalesce(p_lavozim, '')), '');
  v_f text := nullif(btrim(coalesce(p_fio, '')), '');
  v_manba text; v_amal text; v_loy bigint; v_obj bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'taqdim');
  select natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  if p_obyekt_id is null or p_obyekt_id <= 0 or p_rol is null or p_rol not in ('zakazchik','pudratchi','subpudratchi','texnadzor','loyihachi')
     or p_daraja is null or p_daraja not in ('loyiha','obyekt','razdel') then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID');
  end if;
  if length(coalesce(v_t, '')) > 200 or length(coalesce(v_l, '')) > 200 or length(coalesce(v_f, '')) > 200 then
    return jsonb_build_object('ok', false, 'code', 'QIYMAT_INVALID');
  end if;
  select * into k from public._t2_imzochi_kontekst(p_kompaniya_id, p_obyekt_id);
  if not coalesce(k.o_topildi, false) or not coalesce(k.o_korish, false) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_TOPILMADI');
  end if;
  if p_daraja = 'loyiha' and k.o_loyiha_id is null then return jsonb_build_object('ok', false, 'code', 'LOYIHA_YOQ'); end if;
  if p_daraja = 'razdel' then
    select q.id into v_raz from public.t2_qator q where q.id = p_razdel_id and q.obyekt_id = p_obyekt_id and q.tur = 'rz';
    if v_raz is null then return jsonb_build_object('ok', false, 'code', 'RAZDEL_TOPILMADI'); end if;
  end if;
  v_loy := case when p_daraja = 'loyiha' then k.o_loyiha_id end;
  v_obj := case when p_daraja in ('obyekt','razdel') then p_obyekt_id end;
  -- Bir vaqtda ikki yozuvchi: shu daraja qatorini qulflab o'qiymiz.
  select * into v_q from public.t2_obyekt_imzochi x
   where x.rol = p_rol and x.daraja = p_daraja and x.loyiha_id is not distinct from v_loy and x.obyekt_id is not distinct from v_obj and x.razdel_id is not distinct from v_raz
   for update;
  if not found then v_q := null; end if;
  v_sabab := public._t2_imzochi_yozish_sabab(p_kompaniya_id, k.o_egasi, k.o_tomon, p_rol, v_q);
  if v_sabab is not null then
    return jsonb_build_object('ok', false, 'code', v_sabab);
  end if;

  if v_t is null and v_l is null and v_f is null then
    delete from public.t2_obyekt_imzochi where id = v_q.id;
    v_amal := 'o''chirildi';
  else
    v_manba := case when p_rol = k.o_tomon then 'ozi' else 'kiritilgan' end;
    if v_q.id is null then
      insert into public.t2_obyekt_imzochi (daraja, loyiha_id, obyekt_id, razdel_id, rol, tomon_kompaniya_id, kiritgan_kompaniya_id, manba, tashkilot, lavozim, fio, yangilagan_id, yangilangan_at)
        values (p_daraja, v_loy, v_obj, v_raz, p_rol, case when v_manba = 'ozi' then p_kompaniya_id end, p_kompaniya_id, v_manba, v_t, v_l, v_f, p_actor_id, now());
    else
      update public.t2_obyekt_imzochi
         set tomon_kompaniya_id = case when v_manba = 'ozi' then p_kompaniya_id end, kiritgan_kompaniya_id = p_kompaniya_id, manba = v_manba,
             tashkilot = v_t, lavozim = v_l, fio = v_f, yangilagan_id = p_actor_id, yangilangan_at = now()
       where id = v_q.id;
    end if;
    v_amal := v_manba;
    -- Tarix (eslab qolish): bir xil (rol, tashkilot, lavozim, fio) — sanagi va soni yangilanadi; kompaniyada eng ko'pi 100 ta.
    update public.t2_imzochi_tarix h set oxirgi_at = now(), soni = h.soni + 1
     where h.kompaniya_id = p_kompaniya_id and h.rol = p_rol
       and lower(coalesce(h.tashkilot, '')) = lower(coalesce(v_t, '')) and lower(coalesce(h.lavozim, '')) = lower(coalesce(v_l, '')) and lower(coalesce(h.fio, '')) = lower(coalesce(v_f, ''));
    if not found then
      insert into public.t2_imzochi_tarix (kompaniya_id, rol, tashkilot, lavozim, fio) values (p_kompaniya_id, p_rol, v_t, v_l, v_f);
      delete from public.t2_imzochi_tarix where kompaniya_id = p_kompaniya_id
         and id not in (select id from public.t2_imzochi_tarix where kompaniya_id = p_kompaniya_id order by oxirgi_at desc, id desc limit 100);
    end if;
  end if;
  perform public.t2_audit_yoz(k.o_egasi_id, 'obyekt_imzochi', 'obyekt', p_obyekt_id,
    format('%s [%s%s]: %s (kompaniya %s)', p_rol, p_daraja, case when v_raz is not null then ' ' || v_raz end, v_amal, p_kompaniya_id), 'actor:' || p_actor_id, null);

  v_natija := jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'rol', p_rol, 'daraja', p_daraja, 'manba', case when v_amal = 'o''chirildi' then null else v_amal end);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'obyekt_imzochi_saqla_v1', v_natija);
  return v_natija;
end $$;

-- ── Tarix (takliflar): kompaniyaning o'zi oldin kiritgan nomlar, eng yangisi birinchi ──
create or replace function public.t2_imzochi_tarix_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  return jsonb_build_object('ok', true, 'tarix', coalesce((
    select jsonb_agg(jsonb_build_object('rol', h.rol, 'tashkilot', h.tashkilot, 'lavozim', h.lavozim, 'fio', h.fio, 'oxirgi_at', h.oxirgi_at) order by h.oxirgi_at desc, h.id desc)
      from public.t2_imzochi_tarix h where h.kompaniya_id = p_kompaniya_id), '[]'::jsonb));
end $$;

do $g$
declare f text;
begin
  foreach f in array array[
    '_t2_imzochi_rol_norm(text)', '_t2_imzochi_kontekst(bigint,bigint)',
    '_t2_imzochi_qator(text,bigint,bigint,bigint,text)', '_t2_imzochi_json(public.t2_obyekt_imzochi)',
    '_t2_imzochi_yozish_sabab(bigint,boolean,text,text,public.t2_obyekt_imzochi)',
    't2_obyekt_imzochilar_v1(bigint,bigint,bigint,bigint)',
    't2_obyekt_imzochi_saqla_v1(bigint,bigint,bigint,text,text,bigint,text,text,text,uuid)',
    't2_imzochi_tarix_v1(bigint,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

-- T2 mindmap grafi v3 (PHASE 1 — ishonchli signal/asos):
--  1) f2 = faqat tasdiqlangan akt; f2_qoralama alohida;
--  2) qatnashchi chiziqlari `rol` va `id` bilan (uzish uchun);
--  3) shartnoma tugunlari: holat, summa_bez_nds, loyiha_id, obyekt_soni/obyekt_idlar, tomonlar;
--  4) smeta_yoq / resurs_yoq / smetasiz_obyekt bitta qoida;
--  5) top_signals (3 tagacha); 6) `ortiqcha` belgi t2_overbilling_radar dan;
--  + t2_mindmap_joylashuv_saqla_v2: bitta graf o'qish, zayavka: tugunlari o'tkazib yuboriladi.
-- Imzolar O'ZGARMAGAN (create or replace); t2_mindmap_grafi_v2 shu funksiyani o'raydi — ishlayveradi.
-- Rollback: 20261111600000_t2_mindmap_grafi_v3.rollback.sql.

CREATE OR REPLACE FUNCTION public.t2_mindmap_grafi(p_kompaniya_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
/* v3 (2026-11-11) qarorlari:
 *  - F2 = FAQAT t2_akt.holat='tasdiqlangan' (t2_qator_holat / LRV approved-only qoidasi bilan bir xil).
 *    Qoralama F2 alohida `f2_qoralama` — f2, foiz va jamlanmaga KIRMAYDI.
 *  - FAKT: tur='fakt' uchun holat<>'bekor' saqlandi (t2_qator_holat fakt qoidasi ham o'zgarmagan:
 *    20260906130000 "Fakt aggregation remains exactly as before"); fakt tasdiq jarayoniga ega emas.
 *  - Smeta qoidasi: smeta = rz qatorlar yig'indisi (rz yo'q => NULL). `smeta_yoq` = rz qatori ham,
 *    resurs qatori ham yo'q. rz bor, resurs yo'q => `resurs_yoq` (alohida belgi). smetasiz_obyekt shu
 *    qoidaga mos (rz_soni=0 AND resurs=0).
 *  - Belgi darajalari: smeta_yoq = 'ogoh' (xavf); resurs_yoq va ortiqcha = 'info' (e'tibor) — frontend holat qoidasi shunga tayanadi.
 *  - `ortiqcha` belgi t2_overbilling_radar dan (f2 > fakt yoki f2 > smeta bo'lgan qatorlar soni);
 *    ESLATMA: radar ko'rinishi o'z f2 asosini o'zi belgilaydi (bu migratsiya uni o'zgartirmaydi).
 */
WITH
/* ── Obyekt bo'yicha o'lchovlar (bir marta hisoblanadi) ── */
ob_olchov AS (
  SELECT o.id,
         (SELECT sum(q.summa) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur = 'rz')                      AS smeta,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur = 'rz')                      AS rz_soni,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob'))        AS resurs,
         (SELECT count(*) FROM t2_qator q
           WHERE q.obyekt_id = o.id AND q.tur IN ('rs','mat','ob')
             AND q.narx IS NULL)                                           AS narxsiz,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat <> 'bekor'
           WHERE aq.obyekt_id = o.id AND a.tur = 'fakt')                   AS fakt,
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat = 'tasdiqlangan'
           WHERE aq.obyekt_id = o.id AND a.tur = 'f2')                     AS f2,
         /* F2 qoralamalari ALOHIDA (tasdiqlanmagan; f2 ga kirmaydi) */
         (SELECT coalesce(sum(aq.summa),0) FROM t2_akt_qator aq
            JOIN t2_akt a ON a.id = aq.akt_id AND a.holat NOT IN ('tasdiqlangan','bekor')
           WHERE aq.obyekt_id = o.id AND a.tur = 'f2')                     AS f2_qoralama,
         (SELECT count(*) FROM t2_erp_taminot z
           WHERE z.obyekt_id = o.id AND z.status IN ('submitted','approved','procurement','ordered','partially_delivered'))            AS zayavka,
         (SELECT k.holat FROM t2_kozgu k WHERE k.obyekt_id = o.id)         AS kozgu
    FROM t2_obyekt o
   WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
),
/* Ochiq signallar: eng og'ir 3 tasi (t2_mindmap_signal_summary.top_signals allaqachon tartiblangan) */
sig AS (
  SELECT s.obyekt_id,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('title', x.e->>'title', 'severity', x.e->>'severity', 'type', x.e->>'type') ORDER BY x.ord)
             FROM (SELECT e, ord FROM jsonb_array_elements(s.top_signals) WITH ORDINALITY AS z(e, ord)
                    ORDER BY ord LIMIT 3) x
         ), '[]'::jsonb) AS top3
    FROM public.t2_mindmap_signal_summary s
   WHERE s.kompaniya_id = p_kompaniya_id
),
/* Overbilling: f2 > fakt yoki f2 > smeta bo'lgan qatorlar (NULL ortiqcha — hisoblanmaydi, 0 emas) */
ort AS (
  SELECT r.obyekt_id, count(*)::integer AS n
    FROM public.t2_overbilling_radar r
   WHERE r.kompaniya_id = p_kompaniya_id
     AND (r.f2_fakt_ortiqcha > 0 OR r.f2_smeta_ortiqcha > 0)
   GROUP BY r.obyekt_id
),
t AS (
      SELECT 'kompaniya:' || k.id AS id, 'kompaniya' AS tur, k.nom, NULL::jsonb AS meta
        FROM t2_kompaniya k WHERE k.id = p_kompaniya_id
      UNION ALL
      /* LOYIHA: ostidagi obyektlar jamlanmasi — rahbar loyiha darajasida ham ko'rsin */
      SELECT 'loyiha:' || l.id, 'loyiha', l.nom,
             jsonb_build_object(
               'byudjet', l.byudjet, 'holat', l.holat, 'versiya', l.versiya,
               'obyekt_soni', (SELECT count(*) FROM t2_obyekt o2
                                WHERE o2.loyiha_id = l.id AND o2.holat <> 'bekor'),
               'smeta_jami',  (SELECT sum(x.smeta) FROM ob_olchov x
                                JOIN t2_obyekt o3 ON o3.id = x.id
                               WHERE o3.loyiha_id = l.id),
               'zayavka',     (SELECT coalesce(sum(x.zayavka),0) FROM ob_olchov x
                                JOIN t2_obyekt o4 ON o4.id = x.id
                               WHERE o4.loyiha_id = l.id),
               'belgi', (
                 SELECT coalesce(jsonb_agg(b), '[]'::jsonb) FROM (
                   SELECT jsonb_build_object('tur','zayavka','daraja','info',
                            'soni', z.n, 'matn', z.n || ' ta zayavka kutilmoqda') AS b
                     FROM (SELECT coalesce(sum(x.zayavka),0) n FROM ob_olchov x
                             JOIN t2_obyekt o5 ON o5.id = x.id
                            WHERE o5.loyiha_id = l.id) z
                    WHERE z.n > 0
                 ) q))
        FROM t2_loyiha l WHERE l.kompaniya_id = p_kompaniya_id AND l.holat <> 'bekor'
      UNION ALL
      /* OBYEKT: to'liq holat + belgilar */
      SELECT 'obyekt:' || o.id, 'obyekt', o.nom,
             jsonb_build_object(
               'lat', o.lat, 'lng', o.lng, 'versiya', o.versiya, 'loyiha_id', o.loyiha_id,
               'smeta', m.smeta,
               'resurs_qatori', m.resurs,
               'narxsiz', m.narxsiz,
               'toliq', (m.narxsiz = 0 AND m.resurs > 0),
               'rz_qatori', m.rz_soni,
               'fakt', m.fakt,
               'f2', m.f2,
               'f2_asos', 'tasdiqlangan',
               'f2_qoralama', m.f2_qoralama,
               /* Foiz faqat smeta > 0 bo'lsa — yolg'on «0%» ko'rsatilmaydi */
               'fakt_foiz', CASE WHEN m.smeta > 0 THEN round(m.fakt / m.smeta * 100, 1) END,
               'f2_foiz',   CASE WHEN m.smeta > 0 THEN round(m.f2   / m.smeta * 100, 1) END,
               'zayavka', m.zayavka, 'signal_count', COALESCE((SELECT s.signal_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0), 'critical_count', COALESCE((SELECT s.critical_count FROM public.t2_mindmap_signal_summary s WHERE s.kompaniya_id=p_kompaniya_id AND s.obyekt_id=(o.id)::text),0),
               'top_signals', COALESCE(sg.top3, '[]'::jsonb),
               'ortiqcha_soni', COALESCE(ort.n, 0),
               'kozgu', m.kozgu,
               'belgi', (
                 SELECT coalesce(jsonb_agg(b ORDER BY t_), '[]'::jsonb) FROM (
                   SELECT 1 t_, jsonb_build_object('tur','zayavka','daraja','info',
                            'soni', m.zayavka,
                            'matn', m.zayavka || ' ta zayavka kutilmoqda') b
                    WHERE m.zayavka > 0
                   UNION ALL
                   SELECT 2, jsonb_build_object('tur','narx_yoq','daraja','ogoh',
                            'soni', m.narxsiz,
                            'matn', m.narxsiz || ' qatorda narx yo''q — jami to''liq emas')
                    WHERE m.narxsiz > 0
                   UNION ALL
                   SELECT 3, jsonb_build_object('tur','kozgu','daraja','ogoh',
                            'matn','Sheets ko''zgusi bazadan orqada')
                    WHERE m.kozgu = 'farqli'
                   UNION ALL
                   SELECT 4, jsonb_build_object('tur','smeta_yoq','daraja','ogoh',
                            'matn','Smeta yuklanmagan')
                    WHERE m.rz_soni = 0 AND m.resurs = 0
                   UNION ALL
                   SELECT 5, jsonb_build_object('tur','resurs_yoq','daraja','info',
                            'matn','Smeta bor, lekin resurs qatorlari yo''q')
                    WHERE m.rz_soni > 0 AND m.resurs = 0
                   UNION ALL
                   SELECT 6, jsonb_build_object('tur','ortiqcha','daraja','info',
                            'soni', COALESCE(ort.n, 0),
                            'matn', COALESCE(ort.n, 0) || ' qatorda F2 fakt yoki smetadan oshgan')
                    WHERE COALESCE(ort.n, 0) > 0
                 ) q))
        FROM t2_obyekt o
        JOIN ob_olchov m ON m.id = o.id
        LEFT JOIN sig sg ON sg.obyekt_id = o.id::text
        LEFT JOIN ort ON ort.obyekt_id = o.id
       WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor'
      UNION ALL
      SELECT 'shartnoma:' || s.id, 'shartnoma', COALESCE(NULLIF(s.raqam,''), s.nom, 'Shartnoma'),
             jsonb_build_object('nom', s.nom, 'taraf', s.taraf, 'summa', s.jami_nds_bilan, 'versiya', s.versiya,
               'holat', s.holat, 'summa_bez_nds', s.summa_bez_nds, 'loyiha_id', s.loyiha_id,
               'obyekt_soni', (SELECT count(*) FROM t2_shartnoma_bog sb
                                 JOIN t2_obyekt ob ON ob.id = sb.obyekt_id
                                  AND ob.kompaniya_id = p_kompaniya_id AND ob.holat <> 'bekor'
                                WHERE sb.shartnoma_id = s.id AND sb.holat = 'faol'),
               'obyekt_idlar', COALESCE((SELECT jsonb_agg(sb.obyekt_id ORDER BY sb.obyekt_id)
                                 FROM t2_shartnoma_bog sb
                                 JOIN t2_obyekt ob ON ob.id = sb.obyekt_id
                                  AND ob.kompaniya_id = p_kompaniya_id AND ob.holat <> 'bekor'
                                WHERE sb.shartnoma_id = s.id AND sb.holat = 'faol'), '[]'::jsonb),
               'tomonlar', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', tm.rol, 'nom', tm.nom,
                                        'kontragent_id', tm.kontragent_id) ORDER BY tm.tartib, tm.id)
                                 FROM t2_shartnoma_tomon tm
                                WHERE tm.shartnoma_id = s.id AND tm.kompaniya_id = p_kompaniya_id), '[]'::jsonb))
        FROM t2_shartnoma s WHERE s.kompaniya_id = p_kompaniya_id AND s.holat <> 'bekor'
      UNION ALL
      SELECT 'sklad:' || sm.id, 'sklad', sm.nomi,
             jsonb_build_object('manzil', sm.manzil, 'masul', sm.masul_shaxs, 'versiya', sm.versiya,
               'obyekt_soni', (SELECT count(*) FROM t2_sklad_bog sb
                                WHERE sb.sklad_id = sm.id AND sb.holat = 'faol'))
        FROM t2_sklad_mustaqil sm WHERE sm.kompaniya_id = p_kompaniya_id AND sm.holat = 'faol'
      UNION ALL
      SELECT 'texnika:' || tx.id, 'texnika', tx.nomi,
             jsonb_build_object('davlat_raqami', tx.davlat_raqami, 'versiya', tx.versiya)
        FROM t2_texnika_mustaqil tx WHERE tx.kompaniya_id = p_kompaniya_id AND tx.holat = 'faol'
      UNION ALL
      SELECT 'kadr:' || kd.id, 'kadr', kd.ism_sharif,
             jsonb_build_object('lavozim', kd.lavozim, 'versiya', kd.versiya)
        FROM t2_kadr_mustaqil kd WHERE kd.kompaniya_id = p_kompaniya_id AND kd.holat = 'faol'
      UNION ALL
      SELECT 'kontragent:' || kn.id, 'kontragent', kn.nom,
             jsonb_build_object('inn', kn.inn, 'mavqe', kn.mavqe, 'versiya', kn.versiya)
        FROM t2_kontragent kn WHERE kn.kompaniya_id = p_kompaniya_id AND kn.holat = 'faol'
)
SELECT jsonb_build_object(
  'tugunlar', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'tur', t.tur, 'nom', t.nom, 'meta', t.meta,
      'x', j.x, 'y', j.y          -- NULL bo'lsa frontend avtomatik joylaydi
    ))
    FROM t LEFT JOIN t2_mindmap_joylashuv j
      ON j.kompaniya_id = p_kompaniya_id AND j.tugun_id = t.id
  ), '[]'::jsonb),
  /* Butun tashkilot bo'yicha jamlanma — rahbar birinchi qarashda ko'rsin */
  'jamlanma', (
    SELECT jsonb_build_object(
      'obyekt_soni', count(*),
      'smeta_jami', sum(smeta),
      'fakt_jami', sum(fakt),
      'f2_jami', sum(f2),
      'f2_asos', 'tasdiqlangan',
      'f2_qoralama_jami', sum(f2_qoralama),
      'zayavka_kutilmoqda', sum(zayavka),
      'narxsiz_obyekt', count(*) FILTER (WHERE narxsiz > 0),
      'smetasiz_obyekt', count(*) FILTER (WHERE rz_soni = 0 AND resurs = 0),
      'resurssiz_obyekt', count(*) FILTER (WHERE rz_soni > 0 AND resurs = 0),
      'ortiqcha_obyekt', (SELECT count(*) FROM ort WHERE ort.obyekt_id IN (SELECT x.id FROM ob_olchov x)),
      'kozgu_eskirgan', count(*) FILTER (WHERE kozgu = 'farqli'))
    FROM ob_olchov),
  'bogichlar', COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(b))) FROM (
      SELECT 'kompaniya:' || l.kompaniya_id AS manba, 'loyiha:' || l.id AS maqsad,
             'loyiha_kompaniya' AS tur, false AS uzsa_boladi,
             NULL::text AS rol, NULL::bigint AS id
        FROM t2_loyiha l WHERE l.kompaniya_id = p_kompaniya_id AND l.holat <> 'bekor'
      UNION ALL
      SELECT 'loyiha:' || o.loyiha_id, 'obyekt:' || o.id, 'obyekt_loyiha', true, NULL, NULL
        FROM t2_obyekt o WHERE o.kompaniya_id = p_kompaniya_id AND o.holat <> 'bekor' AND o.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'loyiha:' || s.loyiha_id, 'shartnoma:' || s.id, 'shartnoma_loyiha', true, NULL, NULL
        FROM t2_shartnoma s WHERE s.kompaniya_id = p_kompaniya_id AND s.holat <> 'bekor' AND s.loyiha_id IS NOT NULL
      UNION ALL
      SELECT 'shartnoma:' || sb.shartnoma_id, 'obyekt:' || sb.obyekt_id, 'shartnoma_obyekt', true, NULL, NULL
        FROM t2_shartnoma_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'sklad:' || sb.sklad_id, 'obyekt:' || sb.obyekt_id, 'sklad_obyekt', true, NULL, NULL
        FROM t2_sklad_bog sb
        JOIN t2_obyekt o ON o.id = sb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE sb.holat = 'faol'
      UNION ALL
      SELECT 'texnika:' || tb.texnika_id, 'obyekt:' || tb.obyekt_id, 'texnika_obyekt', true, NULL, NULL
        FROM t2_texnika_bog tb
        JOIN t2_obyekt o ON o.id = tb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE tb.holat = 'faol'
      UNION ALL
      SELECT 'kadr:' || kb.kadr_id, 'obyekt:' || kb.obyekt_id, 'kadr_obyekt', true, NULL, NULL
        FROM t2_kadr_bog kb
        JOIN t2_obyekt o ON o.id = kb.obyekt_id AND o.kompaniya_id = p_kompaniya_id
        WHERE kb.holat = 'faol'
      UNION ALL
      SELECT 'kontragent:' || q.kontragent_id, 'loyiha:' || q.loyiha_id, 'qatnashchi', true, q.rol, q.id
        FROM t2_loyiha_qatnashchi q
        JOIN t2_loyiha l ON l.id = q.loyiha_id AND l.kompaniya_id = p_kompaniya_id
        WHERE q.holat = 'faol' AND q.kontragent_id IS NOT NULL
    ) b), '[]'::jsonb)
);
$function$;


create or replace function public.t2_mindmap_joylashuv_saqla_v2(
  p_kompaniya_id bigint, p_actor_id bigint, p_joylar jsonb, p_operation_id uuid,
  p_actor_label text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_rol text; v_old jsonb; v_j jsonb; v_result jsonb; v_node text; v_ids text[]; v_saqlandi integer;
begin
  v_rol:=t2_mindmap_actor_tekshir(p_kompaniya_id,p_actor_id);
  if jsonb_typeof(p_joylar)<>'array' or jsonb_array_length(p_joylar)=0 or jsonb_array_length(p_joylar)>500 then raise exception 'joylar 1..500 elementli massiv bolishi kerak' using errcode='22023'; end if;
  v_old:=t2_mindmap_command_boshlash(p_kompaniya_id,p_operation_id,'joylashuv',p_actor_id,jsonb_build_object('joylar',p_joylar));
  if v_old is not null then return v_old; end if;
  -- Graf BIR marta o'qiladi (avval har tugun uchun alohida o'qilardi).
  select coalesce(array_agg(n->>'id'),'{}'::text[]) into v_ids
    from jsonb_array_elements(coalesce(t2_mindmap_grafi(p_kompaniya_id)->'tugunlar','[]'::jsonb)) n;
  for v_j in select value from jsonb_array_elements(p_joylar) loop
    v_node:=v_j->>'tugun_id';
    -- zayavka:<id> — vaqtinchalik drilldown tugunlari: tekshiruvdan o'tkaziladi, lekin SAQLANMAYDI.
    if v_node ~ '^zayavka:[0-9]+$' and jsonb_typeof(v_j->'x')='number' and jsonb_typeof(v_j->'y')='number' then
      continue;
    end if;
    if v_node is null or v_node !~ '^(kompaniya|loyiha|obyekt|shartnoma|sklad|texnika|kadr|kontragent):[0-9]+$'
       or jsonb_typeof(v_j->'x') not in ('number') or jsonb_typeof(v_j->'y') not in ('number') then
      raise exception 'joylashuv elementi yaroqsiz' using errcode='22023';
    end if;
    if not (v_node = any(v_ids)) then
      raise exception 'tugun boshqa tenantga tegishli yoki mavjud emas: %',v_node using errcode='42501';
    end if;
  end loop;
  insert into t2_mindmap_joylashuv(kompaniya_id,tugun_id,x,y)
    select p_kompaniya_id,j->>'tugun_id',(j->>'x')::numeric,(j->>'y')::numeric from jsonb_array_elements(p_joylar) j
     where (j->>'tugun_id') !~ '^zayavka:'
  on conflict(kompaniya_id,tugun_id) do update set x=excluded.x,y=excluded.y,yangilandi=now();
  select count(*) into v_saqlandi from jsonb_array_elements(p_joylar) j where (j->>'tugun_id') !~ '^zayavka:';
  perform t2_audit_yoz(p_kompaniya_id,'mindmap_joylashuv','mindmap',null,format('actor_id=%s; rol=%s; count=%s',p_actor_id,v_rol,v_saqlandi),coalesce(p_actor_label,'actor:'||p_actor_id),null);
  v_result:=jsonb_build_object('ok',true,'saqlandi',v_saqlandi);
  return t2_mindmap_command_yakunla(p_kompaniya_id,p_operation_id,v_result);
end;
$function$;
commit;

-- ═══ 4) AMFITEATR TEKSHIRUVI (faqat o'qish). Natija jadvalini Claude'ga yuboring. ═══
-- smeta_rz = razdellar jami (tizim «Smeta (ustamasiz)» deb ko'rsatadigan); qoshimcha = smetaga keyin qo'shilgan qatorlar;
-- nakrutka = tizimdagi ustama kaskadi (pryamye → ИТОГО-4 → QQS → ВСЕГО).
select o.id, o.nom,
  (select sum(q.summa) from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz')                                   as smeta_rz,
  (select sum(q.summa) from t2_qator q where q.obyekt_id = o.id and q.tur in ('rs','mat','ob'))                     as resurslar_jami,
  (select sum(q.summa) from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz' and coalesce(q.qoshimcha,false))   as qoshimcha_rz,
  (select count(*)     from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz')                                   as razdel_soni,
  (select to_jsonb(n) - 'kompaniya_id' from t2_obyekt_nakrutka n
     where coalesce(to_jsonb(n)->>'obyekt_id', to_jsonb(n)->>'id')::bigint = o.id limit 1)                          as nakrutka
from t2_obyekt o
where (o.nom ilike '%amfi%' or o.nom ilike '%амфи%') and coalesce(o.holat,'') <> 'bekor';
