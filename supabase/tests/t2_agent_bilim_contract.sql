-- t2_agent_bilim_contract: bilim taklifi -> inson tasdig'i -> faol bilim (versiyalash, tenant chegarasi), kuzatuv sahifalari (faqat superadmin, tasdiqlangan domen), boshqaruvchi holati. Rollback.
do $t$
declare
  k1 bigint; k2 bigint; ks bigint; ub bigint; uo bigint; us bigint; r jsonb; ok int := 0; bad text := ''; tid bigint; tid2 bigint; kid bigint;
begin
  insert into t2_kompaniya(kod, nom, faol) values ('BLA' || floor(random()*1e9)::text, 'Bilim A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('BLB' || floor(random()*1e9)::text, 'Bilim B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('BLS' || floor(random()*1e9)::text, 'Bilim S', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('bl_boss_' || k1) returning id into ub;
  insert into t2_foydalanuvchi(login) values ('bl_other_' || k1) returning id into uo;
  insert into t2_foydalanuvchi(login) values ('bl_super_' || k1) returning id into us;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, ub, 'boss', 'faol'), (k2, uo, 'boss', 'faol'), (ks, us, 'superadmin', 'faol');

  -- 1) global bilim taklifi: yaroqli / yaroqsiz shakllar
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'ShNQ yangi talab', '{"kod":"shnq_yangi","sarlavha":"ShNQ yangi talab","matn":"Yangi tahrirda yashirin ishlar dalolatnomasi talabi o''zgardi.","kalit":["shnq","dalolatnoma"]}'::jsonb, '[{"url":"https://norma.uz/x","sha256":"abc"}]'::jsonb);
  tid := (r->>'id')::bigint;
  if (r->>'ok')::boolean and tid is not null then ok := ok + 1; else bad := bad || ' yarat'; end if;
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'Qisqa matn', '{"kod":"x1","sarlavha":"Qisqa matn","matn":"qisqa","kalit":["a1"]}'::jsonb);
  if r->>'code' = 'BILIM_INVALID' then ok := ok + 1; else bad := bad || ' qisqa-matn'; end if;
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'Kalitsiz', '{"kod":"x2a","sarlavha":"Kalitsiz","matn":"Bu yetarlicha uzun matn bo''lishi kerak","kalit":[]}'::jsonb);
  if r->>'code' = 'BILIM_INVALID' then ok := ok + 1; else bad := bad || ' kalitsiz'; end if;
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'Kalit turi', '{"kod":"x3a","sarlavha":"Kalit turi","matn":"Bu yetarlicha uzun matn bo''lishi kerak","kalit":[5]}'::jsonb);
  if r->>'code' = 'BILIM_INVALID' then ok := ok + 1; else bad := bad || ' kalit-turi'; end if;
  -- tenant kontekstidan global bilim taklif qilib bo'lmaydi (ma'lumot oqib chiqmasin)
  r := t2_agent_taklif_yarat_v1(ub, k1, 'bilim', 'global', null, 'Global urinish', '{"kod":"x4a","sarlavha":"Global urinish","matn":"Bu yetarlicha uzun matn bo''lishi kerak","kalit":["ab"]}'::jsonb);
  if r->>'code' = 'GLOBAL_TAKLIF_FAQAT_MANBA' then ok := ok + 1; else bad := bad || ' global-tenant'; end if;

  -- 2) qaror: faqat superadmin global bilimni tasdiqlaydi; tasdiqlangach faol
  r := t2_agent_taklif_qaror_v1(ub, tid, 'tasdiqlash');
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' qaror-boss-rad'; end if;
  if (select count(*) from t2_agent_bilim where doira = 'global' and kod = 'shnq_yangi') = 0 then ok := ok + 1; else bad := bad || ' tasdiqsiz-yozilmaydi'; end if;
  r := t2_agent_taklif_qaror_v1(us, tid, 'tasdiqlash');
  if (r->>'ok')::boolean and (select versiya from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'faol') = 1
     and (select manba_url from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'faol') = 'https://norma.uz/x'
     and (select kalit from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'faol') = array['shnq','dalolatnoma'] then ok := ok + 1; else bad := bad || ' tasdiq-faol'; end if;
  -- yangi versiya eskisini arxivga o'tkazadi
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'ShNQ yangi talab v2', '{"kod":"shnq_yangi","sarlavha":"ShNQ yangi talab","matn":"Ikkinchi tahrir: talab yana aniqlashtirildi va o''zgartirildi.","kalit":["shnq"]}'::jsonb);
  tid2 := (r->>'id')::bigint; perform t2_agent_taklif_qaror_v1(us, tid2, 'tasdiqlash');
  if (select count(*) from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'faol') = 1 and (select versiya from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'faol') = 2
     and (select count(*) from t2_agent_bilim where kod = 'shnq_yangi' and holat = 'arxiv') = 1 then ok := ok + 1; else bad := bad || ' versiya'; end if;
  -- rad etilgan yozilmaydi
  r := t2_agent_taklif_yarat_v1(us, null, 'bilim', 'global', null, 'Rad', '{"kod":"rad_bilim","sarlavha":"Rad etiladigan","matn":"Bu yetarlicha uzun matn bo''lishi kerak","kalit":["rad"]}'::jsonb);
  perform t2_agent_taklif_qaror_v1(us, (r->>'id')::bigint, 'rad', 'dalil kam');
  if (select count(*) from t2_agent_bilim where kod = 'rad_bilim') = 0 then ok := ok + 1; else bad := bad || ' rad'; end if;

  -- 3) kompaniya bilimi: o'z kompaniyasi ko'radi, boshqasi ko'rmaydi; global hammaga
  r := t2_agent_taklif_yarat_v1(ub, k1, 'bilim', 'company', null, 'Bizning qoida', '{"kod":"bizning_qoida","sarlavha":"Bizning qoida","matn":"Bizning kompaniyada tasdiq tartibi: avval PTO, keyin direktor.","kalit":["tasdiq tartibi"]}'::jsonb);
  perform t2_agent_taklif_qaror_v1(ub, (r->>'id')::bigint, 'tasdiqlash');
  r := t2_agent_bilim_v1(ub, k1);
  if (select count(*) from jsonb_array_elements(r->'natija') e where e->>'kod' = 'bizning_qoida') = 1 and (select count(*) from jsonb_array_elements(r->'natija') e where e->>'kod' = 'shnq_yangi') = 1 then ok := ok + 1; else bad := bad || ' korinish-a'; end if;
  r := t2_agent_bilim_v1(uo, k2);
  if (select count(*) from jsonb_array_elements(r->'natija') e where e->>'kod' = 'bizning_qoida') = 0 and (select count(*) from jsonb_array_elements(r->'natija') e where e->>'kod' = 'shnq_yangi') = 1 then ok := ok + 1; else bad := bad || ' tenant-izolyatsiya'; end if;
  r := t2_agent_bilim_v1(uo, k1);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' begona-rad'; end if;

  -- 4) kuzatuv: faqat superadmin, tasdiqlangan domen
  insert into t2_agent_manba(domen, nom, faol, tasdiqladi) values ('norma.uz', 'Norma', true, us) on conflict (domen) do update set faol = true;
  r := t2_agent_kuzatuv_saqla_v1(ub, 'https://norma.uz/a', 'Norma A', 'ShNQ', true);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' kuzatuv-boss'; end if;
  r := t2_agent_kuzatuv_saqla_v1(us, 'https://norma.uz/a', 'Norma A', 'ShNQ', true);
  kid := (r->>'id')::bigint;
  if (r->>'ok')::boolean and kid is not null then ok := ok + 1; else bad := bad || ' kuzatuv-saqla'; end if;
  r := t2_agent_kuzatuv_saqla_v1(us, 'https://begona-sayt.example/a', 'Begona', null, true);
  if r->>'code' = 'MANBA_TASDIQLANMAGAN' then ok := ok + 1; else bad := bad || ' begona-domen'; end if;
  r := t2_agent_kuzatuv_saqla_v1(us, 'http://norma.uz/a', 'Norma http', null, true);
  if r->>'code' = 'KUZATUV_INVALID' then ok := ok + 1; else bad := bad || ' http-rad'; end if;
  r := t2_agent_kuzatuv_belgila_v1(us, kid, 'sha123', 'yangi', 'birinchi olish');
  if (r->>'ok')::boolean and (select oxirgi_sha256 from t2_agent_kuzatuv_url where id = kid) = 'sha123' then ok := ok + 1; else bad := bad || ' belgila'; end if;
  perform t2_agent_kuzatuv_belgila_v1(us, kid, 'boshqa', 'xato', 'ulanmadi');
  if (select oxirgi_sha256 from t2_agent_kuzatuv_url where id = kid) = 'sha123' then ok := ok + 1; else bad := bad || ' xato-sha-ozgarmaydi'; end if;
  r := t2_agent_kuzatuv_royxat_v1(ub);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' royxat-boss'; end if;

  -- 5) boshqaruvchi holati
  r := t2_agent_bilim_holat_v1(us);
  if (r->>'ok')::boolean and (r->>'bilim_global')::int >= 1 and (r->>'bilim_kompaniya')::int >= 1 and (r->>'kuzatuv_jami')::int >= 1 and (r->>'kuzatuv_ozgargan')::int = 0 then ok := ok + 1; else bad := bad || ' holat(' || r::text || ')'; end if;
  r := t2_agent_bilim_holat_v1(ub);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' holat-boss'; end if;

  raise exception 'T2_AGENT_BILIM_RESULT ok=% bad=[%]', ok, bad;
end $t$;
