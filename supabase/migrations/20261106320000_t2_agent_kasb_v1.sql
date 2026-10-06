-- KASB AGENTLARI: har lavozim (rol) uchun o'z AI ishchisi va FAQAT shu lavozimga ruxsat etilgan ma'lumot toifalari.
-- Prorab pul summalarini, usta moliya/oylikni, skladchi smeta narxini ko'rmaydi — chegarani MODEL emas, BAZA ushlaydi:
-- ruxsat etilmagan toifa promptga umuman kirmaydi (model u haqda bila olmaydi, shuning uchun sizdira olmaydi).
set local statement_timeout = '60s';

create table if not exists public.t2_agent_kasb (
  rol text primary key check (rol ~ '^[a-z_]{3,30}$'),
  profil_kod text not null references public.t2_agent_profile(kod),
  nom text not null check (length(nom) between 3 and 80),
  vazifa text not null check (length(vazifa) between 10 and 400),
  kategoriyalar text[] not null,
  namuna_savollar text[] not null default '{}',
  taqiq_izoh text check (taqiq_izoh is null or length(taqiq_izoh) <= 300),
  yangilandi timestamptz not null default now(),
  check (kategoriyalar <@ array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika']::text[])
);
alter table public.t2_agent_kasb enable row level security;
revoke all on public.t2_agent_kasb from public, anon, authenticated;

-- Yangi kasb profillari (mavjudlari: pto_smeta, finance, warehouse, procurement, quality_handover … qayta ishlatiladi)
insert into public.t2_agent_profile (kod, nom, rol, izoh, permission_mode, allowed_commands, allowed_tools, default_scope, holat) values
  ('direktor',    'Direktor yordamchisi',  'direktor',    'Company-wide status, risks, finance and schedule summary for management', 'read_only', '[]'::jsonb, '["company.read","finance.read","smeta.read","schedule.read"]'::jsonb, 'company', 'active'),
  ('prorab',      'Prorab yordamchisi',    'prorab',      'Site progress, schedule, material balance and quality (no money)',       'read_only', '[]'::jsonb, '["progress.read","schedule.read","warehouse.read","quality.read"]'::jsonb, 'company', 'active'),
  ('usta',        'Usta yordamchisi',      'usta',        'Daily work scope, progress and materials on site (no money)',            'read_only', '[]'::jsonb, '["progress.read","schedule.read","warehouse.read"]'::jsonb, 'company', 'active'),
  ('buyurtmachi', 'Buyurtmachi yordamchisi','buyurtmachi','Progress, schedule and quality visibility for the customer role',       'read_only', '[]'::jsonb, '["progress.read","schedule.read","quality.read"]'::jsonb, 'company', 'active'),
  ('kuzatuvchi',  'Kuzatuvchi yordamchisi','kuzatuvchi',  'Read-only progress and schedule visibility',                             'read_only', '[]'::jsonb, '["progress.read","schedule.read"]'::jsonb, 'company', 'active')
on conflict (kod) do nothing;

insert into public.t2_agent_kasb (rol, profil_kod, nom, vazifa, kategoriyalar, namuna_savollar, taqiq_izoh) values
 ('boss', 'direktor', 'Direktor yordamchisi', 'Kompaniya holatini bir joyda ko''rsatadi: obyektlar, smeta/fakt/F2, to''lovlar, kechikayotgan ishlar, ombor, sifat va xodimlar bo''yicha xulosa.',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika'],
  array['Qaysi obyektlar grafikdan orqada?','Shu oy qancha to''lov va xarajat bo''ldi?','Obyektlar bo''yicha smeta, fakt va F2 holati qanday?','Omborda nima kam qolgan?'], null),
 ('admin', 'direktor', 'Direktor yordamchisi', 'Kompaniya holatini bir joyda ko''rsatadi: obyektlar, smeta/fakt/F2, to''lovlar, kechikayotgan ishlar, ombor, sifat va xodimlar bo''yicha xulosa.',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika'],
  array['Qaysi obyektlar grafikdan orqada?','Shu oy qancha to''lov va xarajat bo''ldi?','Obyektlar bo''yicha smeta, fakt va F2 holati qanday?','Omborda nima kam qolgan?'], null),
 ('director', 'direktor', 'Direktor yordamchisi', 'Kompaniya holatini bir joyda ko''rsatadi: obyektlar, smeta/fakt/F2, to''lovlar, kechikayotgan ishlar, ombor, sifat va xodimlar bo''yicha xulosa.',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika'],
  array['Qaysi obyektlar grafikdan orqada?','Shu oy qancha to''lov va xarajat bo''ldi?','Obyektlar bo''yicha smeta, fakt va F2 holati qanday?','Omborda nima kam qolgan?'], null),
 ('rahbar', 'direktor', 'Direktor yordamchisi', 'Kompaniya holatini bir joyda ko''rsatadi: obyektlar, smeta/fakt/F2, to''lovlar, kechikayotgan ishlar, ombor, sifat va xodimlar bo''yicha xulosa.',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika'],
  array['Qaysi obyektlar grafikdan orqada?','Shu oy qancha to''lov va xarajat bo''ldi?','Obyektlar bo''yicha smeta, fakt va F2 holati qanday?','Omborda nima kam qolgan?'], null),
 ('superadmin', 'direktor', 'Direktor yordamchisi', 'Kompaniya holatini bir joyda ko''rsatadi (platforma superadmini sifatida kompaniya doirasida).',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','moliya','ombor','sifat','kadr','texnika'],
  array['Qaysi obyektlar grafikdan orqada?','Obyektlar bo''yicha smeta, fakt va F2 holati qanday?'], null),
 ('pto', 'pto_smeta', 'PTO / smetachi yordamchisi', 'Smeta, fakt va F2 ni solishtiradi: narxsiz qatorlar, bajarilish foizi, F2 aktlari holati, grafik, sifat hujjatlari (AOSR, laboratoriya) va ombor.',
  array['obyektlar','smeta_pul','f2_fakt_pul','hajm','grafik','ombor','sifat','texnika'],
  array['Qaysi obyektda narxsiz qatorlar bor?','Obyektlarning bajarilish foizi qancha?','F2 aktlari holati qanday (tasdiqlangan/qoralama)?','AOSR va laboratoriya hujjatlari nechta?'],
  'To''lov, xarajat, faktura va xodimlar oyligi sizning doirangizda emas.'),
 ('bugalter', 'finance', 'Bugalter yordamchisi', 'To''lov, xarajat, faktura va shartnoma summalari hamda F2/fakt summalarini ko''rsatadi; xodimlar oyligi va maosh ma''lumoti.',
  array['obyektlar','f2_fakt_pul','moliya','kadr'],
  array['Shu oy qancha to''lov bo''ldi?','Xarajatlar toifalar bo''yicha qancha?','Shartnomalar summasi va holati qanday?','Qaysi obyektda F2 summasi fakt summasidan katta?'],
  'Smeta narx tuzilmasi, ombor va qurilish grafigi sizning doirangizda emas.'),
 ('prorab', 'prorab', 'Prorab yordamchisi', 'Obyektdagi ish borishi (foizda), grafikdan orqada qolgan ishlar, ombor qoldig''i, AOSR/laboratoriya va texnika bo''yicha yordam. Pul summalari ko''rsatilmaydi.',
  array['obyektlar','hajm','grafik','ombor','sifat','texnika'],
  array['Qaysi ishlar grafikdan orqada?','Omborda qaysi material qolgan?','Obyektlarda bajarilish foizi qancha?','AOSR va laboratoriya holati qanday?'],
  'Smeta, F2, to''lov, xarajat va oylik (pul) ma''lumotlari sizning doirangizda emas.'),
 ('usta', 'usta', 'Usta yordamchisi', 'Bugungi ish doirasi: grafikdagi ishlar, bajarilish foizi, omborda mavjud materiallar va sifat hujjatlari. Pul va xodimlar ma''lumoti ko''rsatilmaydi.',
  array['obyektlar','hajm','grafik','ombor','sifat'],
  array['Bu hafta qaysi ishlar muddati yaqin?','Omborda qaysi material bor?','Obyektda bajarilish foizi qancha?'],
  'Pul, smeta narxi, to''lov va xodimlar ma''lumoti sizning doirangizda emas.'),
 ('skladchi', 'warehouse', 'Skladchi yordamchisi', 'Ombor kirim/chiqimi, material qoldig''i, oxirgi harakatlar va texnika ro''yxati. Pul va smeta ko''rsatilmaydi.',
  array['obyektlar','ombor','texnika'],
  array['Omborda qaysi material qancha qolgan?','Oxirgi kirim va chiqimlar qaysilar?','Qaysi texnika ro''yxatda?'],
  'Smeta, to''lov, xarajat, grafik va oylik sizning doirangizda emas.'),
 ('taminotchi', 'procurement', 'Ta''minotchi yordamchisi', 'Ombor qoldig''i va ish grafigiga qarab nima kerak bo''lishini ko''rsatadi. Pul summalari ko''rsatilmaydi.',
  array['obyektlar','hajm','grafik','ombor'],
  array['Omborda nima kam?','Yaqin ishlar uchun qaysi materiallar kerak bo''ladi?'],
  'Smeta narxi, to''lov va oylik sizning doirangizda emas.'),
 ('laborant', 'quality_handover', 'Laborant / sifat yordamchisi', 'Laboratoriya protokollari va AOSR hujjatlari holati.',
  array['obyektlar','sifat'],
  array['Oxirgi laboratoriya natijalari qanday?','Nechta AOSR yangi holatda?'],
  'Pul, smeta, ombor va grafik sizning doirangizda emas.'),
 ('buyurtmachi', 'buyurtmachi', 'Buyurtmachi yordamchisi', 'Obyektlar holati, bajarilish foizi, grafik va sifat hujjatlari. Pul va ichki hisob-kitoblar ko''rsatilmaydi.',
  array['obyektlar','hajm','grafik','sifat'],
  array['Obyektda ishlar qanday borayapti?','Qaysi ishlar kechikmoqda?'],
  'Pudratchining ichki moliya va narx ma''lumotlari sizning doirangizda emas.'),
 ('pudratchi', 'kuzatuvchi', 'Kuzatuvchi yordamchisi', 'Obyektlar holati, bajarilish foizi va grafik.',
  array['obyektlar','hajm','grafik'],
  array['Obyektda ishlar qanday borayapti?','Qaysi ishlar kechikmoqda?'],
  'Pul, ombor va xodimlar ma''lumoti sizning doirangizda emas.'),
 ('kuzatuvchi', 'kuzatuvchi', 'Kuzatuvchi yordamchisi', 'Obyektlar holati, bajarilish foizi va grafik (faqat ko''rish).',
  array['obyektlar','hajm','grafik'],
  array['Obyektda ishlar qanday borayapti?','Qaysi ishlar kechikmoqda?'],
  'Pul, ombor va xodimlar ma''lumoti sizning doirangizda emas.')
on conflict (rol) do nothing;

-- Foydalanuvchining ishchisi + boshqa ishchilar ro'yxati (ma'lumotsiz — kimga murojaat qilish uchun)
create or replace function public.t2_agent_kasb_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_boshqa jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  if not found then
    return jsonb_build_object('ok', true, 'rol', g->>'rol', 'profil', 'kuzatuvchi', 'nom', 'AI yordamchi', 'vazifa', 'Obyektlar holati haqida umumiy yordam.',
      'kategoriyalar', jsonb_build_array('obyektlar'), 'namuna_savollar', '[]'::jsonb, 'taqiq_izoh', null, 'boshqalar', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rol', x.rol, 'nom', x.nom, 'vazifa', x.vazifa) order by x.nom), '[]') into v_boshqa
    from (select distinct on (nom) rol, nom, vazifa from t2_agent_kasb where nom <> k.nom order by nom, rol) x;
  return jsonb_build_object('ok', true, 'rol', k.rol, 'profil', k.profil_kod, 'nom', k.nom, 'vazifa', k.vazifa, 'kategoriyalar', to_jsonb(k.kategoriyalar),
    'namuna_savollar', to_jsonb(k.namuna_savollar), 'taqiq_izoh', k.taqiq_izoh, 'boshqalar', v_boshqa);
end $$;

-- ASOSIY: rolga ruxsat etilgan toifalar bo'yicha FAKT paketi. Ruxsatsiz toifa umuman hisoblanmaydi.
create or replace function public.t2_agent_fakt_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kategoriyalar text[], p_obyekt_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_ruxsat text[]; v_so text[]; v_rad text[]; r jsonb := '{}'::jsonb; x jsonb;
  v_ob bigint[];
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  v_ruxsat := coalesce(k.kategoriyalar, array['obyektlar']);
  v_so := coalesce(p_kategoriyalar, array['obyektlar']);
  select coalesce(array_agg(c order by c), '{}') into v_rad from unnest(v_so) c where not (c = any(v_ruxsat));
  v_so := array(select c from unnest(v_so) c where c = any(v_ruxsat));
  if p_obyekt_id is not null and not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  select coalesce(array_agg(id), '{}') into v_ob from (select id from t2_obyekt where kompaniya_id = p_kompaniya_id and holat = 'faol' and (p_obyekt_id is null or id = p_obyekt_id) order by yangilandi desc nulls last limit 15) z;

  r := jsonb_build_object('bugun', current_date, 'kompaniya', (select nom from t2_kompaniya where id = p_kompaniya_id));

  if 'obyektlar' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'hudud', o.hudud, 'loyiha', (select l.nom from t2_loyiha l where l.id = o.loyiha_id)) order by o.nom), '[]') into x
      from t2_obyekt o where o.id = any(v_ob);
    r := r || jsonb_build_object('obyektlar', x);
  end if;

  if 'smeta_pul' = any(v_so) or 'f2_fakt_pul' = any(v_so) or 'hajm' = any(v_so) then
    select coalesce(jsonb_agg(t.j order by t.nom), '[]') into x from (
      select o.nom,
        jsonb_strip_nulls(jsonb_build_object('obyekt', o.nom)
          || case when 'smeta_pul' = any(v_so) then jsonb_build_object('smeta_jami_som', round(coalesce(sum(h.smeta_summa) filter (where h.tur = 'rz'), 0)),
               'narxsiz_qatorlar', count(*) filter (where h.tur in ('rs','mat','ob') and h.smeta_narx is null)) else '{}'::jsonb end
          || case when 'f2_fakt_pul' = any(v_so) then jsonb_build_object('fakt_som', round(coalesce(sum(h.fakt_summa), 0)), 'f2_som', round(coalesce(sum(h.f2_summa), 0))) else '{}'::jsonb end
          || case when 'hajm' = any(v_so) then jsonb_build_object('bajarilish_foiz_fakt', round(coalesce(sum(h.fakt_summa) filter (where h.tur = 'rs') * 100.0 / nullif(sum(h.smeta_summa) filter (where h.tur = 'rs'), 0), 0), 1),
               'bajarilish_foiz_f2', round(coalesce(sum(h.f2_summa) filter (where h.tur = 'rs') * 100.0 / nullif(sum(h.smeta_summa) filter (where h.tur = 'rs'), 0), 0), 1)) else '{}'::jsonb end) j
      from t2_obyekt o join t2_qator_holat h on h.obyekt_id = o.id where o.id = any(v_ob) group by o.id, o.nom) t;
    r := r || jsonb_build_object('obyekt_korsatkichlari', x);
  end if;

  if 'f2_fakt_pul' = any(v_so) then
    select coalesce(jsonb_object_agg(coalesce(lifecycle_status, 'noma''lum'), n), '{}') into x from (
      select lifecycle_status, count(*) n from t2_akt where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a;
    r := r || jsonb_build_object('f2_aktlar_holati', x);
  end if;

  if 'grafik' = any(v_so) then
    select coalesce(jsonb_agg(z.j), '[]') into x from (
      select jsonb_build_object('id', gq.id, 'versiya', gq.versiya, 'obyekt', o.nom, 'ish', gq.nom, 'boshlanish', gq.boshlanish_sana, 'tugash', gq.tugash_sana, 'foiz', gq.foiz,
               'kechikkan', (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100)) j
        from t2_grafik_qator gq join t2_obyekt o on o.id = gq.obyekt_id
       where gq.kompaniya_id = p_kompaniya_id and coalesce(gq.faol, true) and gq.obyekt_id = any(v_ob)
       order by (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100) desc, gq.tugash_sana asc nulls last limit 30) z;
    r := r || jsonb_build_object('grafik', x);
  end if;

  if 'moliya' = any(v_so) then
    r := r || jsonb_build_object('moliya', jsonb_build_object(
      'tolov_jami_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'tolov_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_jami_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'xarajat_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_toifalar', (select coalesce(jsonb_agg(jsonb_build_object('toifa', toifa, 'som', s) order by s desc), '[]') from (select coalesce(toifa, 'boshqa') toifa, round(sum(summa)) s from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' group by 1 order by 2 desc limit 8) q),
      'faktura_soni', (select count(*) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'faktura_jami_som', (select round(coalesce(sum(summa), 0)) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'shartnomalar', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'taraf', taraf, 'holat', holat, 'jami_nds_bilan_som', round(jami_nds_bilan)) order by yangilandi desc), '[]') from (select * from t2_shartnoma where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by yangilandi desc limit 10) s)));
  end if;

  if 'ombor' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'birlik', birligi, 'qoldiq', q) order by q desc), '[]') into x from (
      select nomi, birligi, round(sum(case when operatsiya = 'prixod' then obyomi else -obyomi end), 2) q from t2_sklad_harakat
       where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1, 2
       having sum(case when operatsiya = 'prixod' then obyomi else -obyomi end) <> 0 order by 3 desc limit 25) m;
    r := r || jsonb_build_object('ombor_qoldiq', x);
    select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'amal', operatsiya, 'nomi', nomi, 'birlik', birligi, 'miqdor', obyomi) order by sana desc, id desc), '[]') into x from (
      select * from t2_sklad_harakat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc, id desc limit 12) h;
    r := r || jsonb_build_object('ombor_oxirgi_harakatlar', x);
  end if;

  if 'sifat' = any(v_so) then
    r := r || jsonb_build_object('sifat', jsonb_build_object(
      'aosr_jami', (select count(*) from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'aosr_holati', (select coalesce(jsonb_object_agg(coalesce(holat, 'noma''lum'), n), '{}') from (select holat, count(*) n from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a),
      'aosr_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'ish', ish_nomi, 'sana', sana, 'holat', holat) order by id desc), '[]') from (select * from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by id desc limit 8) a),
      'laboratoriya_jami', (select count(*) from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'laboratoriya_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'sinov', sinov_turi, 'marka', marka, 'natija', natija) order by sana desc nulls last), '[]') from (select * from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc nulls last limit 8) l)));
  end if;

  if 'kadr' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('ism', ism_sharif, 'lavozim', lavozim, 'oylik', oylik_maosh, 'valyuta', valyuta) order by ism_sharif), '[]') into x from (
      select * from t2_kadr_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by ism_sharif limit 40) kd;
    r := r || jsonb_build_object('xodimlar', x);
  end if;

  if 'texnika' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'davlat_raqami', davlat_raqami) order by nomi), '[]') into x from (
      select * from t2_texnika_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by nomi limit 25) tx;
    r := r || jsonb_build_object('texnika', x);
  end if;

  return jsonb_build_object('ok', true, 'rol', g->>'rol', 'ishlatilgan', to_jsonb(v_so), 'taqiqlangan', to_jsonb(v_rad), 'fakt', r);
end $$;

revoke all on function public.t2_agent_kasb_v1(bigint, bigint), public.t2_agent_fakt_v1(bigint, bigint, text[], bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_kasb_v1(bigint, bigint), public.t2_agent_fakt_v1(bigint, bigint, text[], bigint) to service_role;
