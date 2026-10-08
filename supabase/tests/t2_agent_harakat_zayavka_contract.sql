-- t2_agent_harakat_zayavka_contract: «zayavka_yarat» harakati — rol ruxsati, obyekt egaligi, qiymat chegaralari, eski harakatlar buzilmasligi. Rollback.
do $t$
declare k1 bigint; k2 bigint; up bigint; ub bigint; ob1 bigint; ob2 bigint; r jsonb; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('ZYA' || floor(random()*1e9)::text, 'Zayavka A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('ZYB' || floor(random()*1e9)::text, 'Zayavka B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('zy_prorab_' || k1) returning id into up;
  insert into t2_foydalanuvchi(login) values ('zy_bug_' || k1) returning id into ub;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, up, 'prorab', 'faol'), (k1, ub, 'bugalter', 'faol');
  insert into t2_obyekt(kompaniya_id, nom) values (k1, 'Zayavka obyekt A') returning id into ob1;
  insert into t2_obyekt(kompaniya_id, nom) values (k2, 'Zayavka obyekt B') returning id into ob2;

  r := t2_agent_harakat_taklif_v1(up, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement M400', 'birligi', 'tonna', 'miqdor', 12, 'kerak_sana', (current_date + 5)::text), 'Sement kerak', true);
  if (r->>'ok')::boolean and r->>'xavf' = 'orta' and (r->'parametrlar'->>'miqdor')::numeric = 12 and not (r->>'avto')::boolean then ok := ok + 1; else bad := bad || ' yaroqli'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', ob2, 'nomi', 'Sement', 'birligi', 'tonna', 'miqdor', 1), 'begona', true);
  if r->>'code' = 'OBYEKT_BEGONA' then ok := ok + 1; else bad := bad || ' begona-obyekt'; end if;
  r := t2_agent_harakat_taklif_v1(ub, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'miqdor', 1), 'bugalter', true);
  if r->>'code' = 'HARAKAT_RUXSATSIZ' then ok := ok + 1; else bad := bad || ' bugalter-rad'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'miqdor', 0), 'nol', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' nol-miqdor'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'miqdor', 2, 'kerak_sana', (current_date - 3)::text), 'otgan sana', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' otgan-sana'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'zayavka_yarat', jsonb_build_object('obyekt_id', 'abc', 'nomi', 'Sement', 'birligi', 'tonna', 'miqdor', 2), 'format', true);
  if r->>'code' = 'PARAM_INVALID' then ok := ok + 1; else bad := bad || ' format'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'ombor_kirim', jsonb_build_object('obyekt_id', ob1, 'nomi', 'Sement', 'birligi', 'tonna', 'obyomi', 3), 'eski amal', true);
  if (r->>'ok')::boolean and r->>'amal' = 'ombor_kirim' then ok := ok + 1; else bad := bad || ' eski-amal'; end if;
  r := t2_agent_harakat_taklif_v1(up, k1, null, 'eslatma', jsonb_build_object('kalit', 'test.kalit', 'mazmun', 'matn'), 'eslatma', true);
  if (r->>'ok')::boolean and r->>'xavf' = 'past' then ok := ok + 1; else bad := bad || ' eslatma'; end if;
  if (select count(*) from t2_agent_kasb where 'zayavka_yarat' = any(harakatlar)) = 8 and not exists (select 1 from t2_agent_kasb where rol in ('bugalter','buyurtmachi','kuzatuvchi','pudratchi') and 'zayavka_yarat' = any(harakatlar)) then ok := ok + 1; else bad := bad || ' kasb-ruyxat'; end if;
  raise exception 'T2_AGENT_HARAKAT_ZAYAVKA_RESULT ok=% bad=[%]', ok, bad;
end $t$;
