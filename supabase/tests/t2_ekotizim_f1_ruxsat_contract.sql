-- ⚠ T2 EKOTIZIM F1 RUXSAT — contract test (rollback bilan; natija "TEST_F1_RUXSAT ..." exception matnida).
-- Talab: 20261108010000_t2_ekotizim_f1_ruxsat_v1.sql qo'llangan baza (disposable). PRODDA ISHLATILMAYDI.
-- Asosiy kafolat: mavjud rollarning ESKI 25-capability to'plami aynan saqlanadi (faqat yangi domenlar qo'shiladi).
do $$
declare
  eski jsonb := '{
    "rahbar":["company.read","control.company.read","project.read","object.read","document.read","financial.read","f2.read","smeta.read","fakt.read","narx.read"],
    "bugalter":["company.read","financial.read","financial.write","document.read","f2.read","smeta.read","fakt.read","narx.read","f2.import","f2.prepare","f2.approve","f2.cancel","f2.correct"],
    "pto":["company.read","project.read","project.write","object.read","object.write","document.read","document.write","financial.read","financial.write","f2.read","smeta.read","fakt.read","narx.read","f2.import","f2.prepare","f2.approve","f2.cancel","f2.correct","smeta.write","fakt.write","narx.write"],
    "prorab":["company.read","project.read","project.write","object.read","object.write","document.read","document.write","f2.read","smeta.read","fakt.read","narx.read","f2.import","f2.prepare","f2.approve","f2.cancel","f2.correct","smeta.write","fakt.write","narx.write"],
    "buyurtmachi":["company.read","project.read","object.read","document.read","financial.read","f2.read","smeta.read","fakt.read","narx.read"],
    "pudratchi":["company.read","project.read","object.read","document.read","f2.read","smeta.read","fakt.read","narx.read"],
    "kuzatuvchi":["company.read","project.read","object.read","document.read","f2.read","smeta.read","fakt.read","narx.read"]}'::jsonb;
  eski25 text[] := array['company.read','company.profile.update','company.member.manage','control.company.read','control.company.write',
    'project.read','project.write','object.read','object.write','document.read','document.write','financial.read','financial.write',
    'f2.read','f2.import','f2.prepare','f2.approve','f2.cancel','f2.correct','smeta.read','smeta.write','fakt.read','fakt.write','narx.read','narx.write'];
  rol text; v_eski text[]; v_yangi text[]; v_q text[];
  k bigint; ub bigint; uu bigint; r jsonb;
  rep text[] := array[]::text[];
begin
  -- 1. Katalog: eski 25 tasi saqlangan, yangilari bor, takror yo'q
  rep := rep || (case when eski25 <@ t2_permission_catalog_v2() then 'OK   katalogda eski 25 capability saqlangan' else 'FAIL eski capability yo''qoldi' end);
  rep := rep || (case when array['procurement.read','logistics.trip','hr.pii.read','self.work.write','accounting.approve'] <@ t2_permission_catalog_v2()
                      then 'OK   yangi capability lar katalogda' else 'FAIL yangi capability yo''q' end);
  rep := rep || (case when cardinality(t2_permission_catalog_v2()) = (select count(distinct x) from unnest(t2_permission_catalog_v2()) x)
                      then 'OK   katalogda takror yo''q' else 'FAIL katalog takrori' end);

  -- 2. Mavjud rollar: eski 25 doirasidagi to'plam AYNAN bir xil (ortiq ham, kam ham emas)
  for rol in select jsonb_object_keys(eski) loop
    select array_agg(x order by x) into v_eski from jsonb_array_elements_text(eski->rol) x;
    select array_agg(x order by x) into v_yangi from unnest(t2_role_permissions_v2(rol)) x where x = any (eski25);
    rep := rep || (case when v_eski = v_yangi then 'OK   ' || rol || ': eski capability lar o''zgarmagan'
                        else 'FAIL ' || rol || ': eski=' || v_eski::text || ' yangi=' || coalesce(v_yangi::text, 'null') end);
  end loop;
  select array_agg(x order by x) into v_q from unnest(t2_role_permissions_v2('kuzatuvchi')) x where not (x = any (eski25));
  rep := rep || (case when v_q is null then 'OK   kuzatuvchi yangi capability olmaydi' else 'FAIL kuzatuvchi oldi: ' || v_q::text end);
  rep := rep || (case when 'accounting.read' = any (t2_role_permissions_v2('bugalter')) and 'accounting.write' = any (t2_role_permissions_v2('pto'))
                      then 'OK   financial.* → accounting.* taxallusi' else 'FAIL taxallus' end);
  rep := rep || (case when t2_permission_catalog_v2() <@ t2_role_permissions_v2('boss') then 'OK   boss butun katalog' else 'FAIL boss' end);

  -- 3. Yangi rollar: minimal, eski kengaytma qo'llanmagan
  v_q := t2_role_permissions_v2('usta');
  rep := rep || (case when 'self.work.write' = any (v_q) and not (array['narx.read','smeta.read','financial.read','f2.read','object.write'] && v_q)
                      then 'OK   usta: faqat o''z ishi, narx/smeta/pul yo''q' else 'FAIL usta: ' || v_q::text end);
  v_q := t2_role_permissions_v2('haydovchi');
  rep := rep || (case when 'logistics.trip' = any (v_q) and not ('object.read' = any (v_q)) then 'OK   haydovchi: reys, obyekt ro''yxati yo''q' else 'FAIL haydovchi: ' || v_q::text end);
  rep := rep || (case when 'hr.pii.read' = any (t2_role_permissions_v2('kadr')) and not ('hr.pii.read' = any (t2_role_permissions_v2('bugalter')))
                         and not ('hr.pii.read' = any (t2_role_permissions_v2('pto')))
                      then 'OK   HR maxfiy ma''lumot faqat kadr (+boss)' else 'FAIL hr.pii tarqalgan' end);
  rep := rep || (case when t2_role_permissions_v2('nomalum_rol') = array[]::text[] then 'OK   noma''lum rol — bo''sh (NULL emas)' else 'FAIL noma''lum rol' end);
  select array_agg(x) into v_q from unnest(array['omborchi','mexanik','kadr','taminotchi','usta','brigadir','haydovchi','inspektor','loyihachi']) x
   where not (t2_role_permissions_v2(x) <@ t2_permission_catalog_v2());
  rep := rep || (case when v_q is null then 'OK   yangi rollar faqat katalogdagi capability' else 'FAIL katalogda yo''q capability: ' || v_q::text end);

  -- 4. Haqiqiy a'zolik orqali
  insert into t2_kompaniya (nom, kod, faol) values ('TEST_F1R', 'TF1R', true) returning id into k;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1r_boss', 'boss', 'faol') returning id into ub;
  insert into t2_foydalanuvchi (login, ism, holat) values ('tf1r_usta', 'usta', 'faol') returning id into uu;
  insert into t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ub, k, 'boss', 'faol'), (uu, k, 'usta', 'faol');
  rep := rep || (case when t2_permission_allowed_v2(k, uu, 'self.work.read') and not t2_permission_allowed_v2(k, uu, 'smeta.read')
                      then 'OK   usta a''zoligi: self.work bor, smeta yo''q' else 'FAIL usta a''zoligi' end);

  -- 5. Ish joyi taklifi: yangi rollar beriladi, boss/admin hali ham yo'q
  r := t2_ish_joyi_taklif_yarat_v1(ub, k, repeat('c', 64), 'usta', 24, 10, null, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   havola bilan usta taklifi' else 'FAIL usta taklifi: ' || r::text end);
  r := t2_ish_joyi_taklif_yarat_v1(ub, k, repeat('d', 64), 'boss', 24, 10, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ROL_NOTOGRI' then 'OK   havola bilan boss berilmaydi' else 'FAIL boss havolasi: ' || r::text end);
  begin
    r := t2_ish_joyi_taklif_yarat_v1(uu, k, repeat('e', 64), 'usta', 24, 10, null, gen_random_uuid());
    rep := rep || ('FAIL usta taklif yaratdi: ' || r::text);
  exception when others then rep := rep || ('OK   usta a''zo qo''sha olmaydi — ' || sqlerrm); end;

  raise exception 'TEST_F1_RUXSAT % / % OK%', (select count(*) from unnest(rep) x where x like 'OK%'), cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $$;
