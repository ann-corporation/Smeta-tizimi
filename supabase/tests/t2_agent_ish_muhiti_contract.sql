-- t2_agent_ish_muhiti_contract: yadro o'zgarmas, tenant izolyatsiya, taklif -> tasdiq, manba allowlist. Oxirida ROLLBACK (raise exception).
do $t$
declare
  k1 bigint; k2 bigint; u_boss1 bigint; u_pto1 bigint; u_boss2 bigint; u_super bigint; ks bigint;
  r jsonb; tid bigint; ok int := 0; bad text := ''; n int;
begin
  insert into t2_kompaniya(kod, nom, faol) values ('AMA' || floor(random()*1e9)::text, 'TEST AGENT A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('AMB' || floor(random()*1e9)::text, 'TEST AGENT B', true) returning id into k2;
  insert into t2_kompaniya(kod, nom, faol) values ('AMS' || floor(random()*1e9)::text, 'TEST AGENT PLATFORMA', true) returning id into ks;
  insert into t2_foydalanuvchi(login) values ('am_boss1_' || k1) returning id into u_boss1;
  insert into t2_foydalanuvchi(login) values ('am_pto1_' || k1) returning id into u_pto1;
  insert into t2_foydalanuvchi(login) values ('am_boss2_' || k1) returning id into u_boss2;
  insert into t2_foydalanuvchi(login) values ('am_super_' || k1) returning id into u_super;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values (k1, u_boss1, 'boss', 'faol'), (k1, u_pto1, 'pto', 'faol'), (k2, u_boss2, 'boss', 'faol'), (ks, u_super, 'superadmin', 'faol');

  -- 1) yadro qoidalar o'zgarmas
  begin update t2_agent_qoida set matn = 'buzildi!!!' where doira = 'yadro'; bad := bad || ' yadro-update'; exception when others then ok := ok + 1; end;
  begin delete from t2_agent_qoida where doira = 'yadro'; bad := bad || ' yadro-delete'; exception when others then ok := ok + 1; end;
  begin insert into t2_agent_qoida(doira, kod, matn) values ('yadro', 'yolgon_yadro', 'qalbaki yadro qoida'); bad := bad || ' yadro-insert'; exception when others then ok := ok + 1; end;

  -- 2) kontekst: yadro doim bor; begona kompaniya rad; global kontekst faqat superadmin
  r := t2_agent_muhit_v1(u_pto1, k1, 'pto_smeta');
  if (r->>'ok')::boolean and jsonb_array_length(r->'qoidalar') >= 8 then ok := ok + 1; else bad := bad || ' kontekst-yadro'; end if;
  r := t2_agent_muhit_v1(u_boss2, k1, null);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' kontekst-begona'; end if;
  r := t2_agent_muhit_v1(u_boss1, null, null);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' global-oddiy'; end if;
  r := t2_agent_muhit_v1(u_super, null, null);
  if (r->>'ok')::boolean and r->>'scope' = 'global' then ok := ok + 1; else bad := bad || ' global-super'; end if;

  -- 3) xotira izolyatsiyasi
  r := t2_agent_xotira_yoz_v1(u_pto1, k1, null, 'obyekt.eslatma', 'A kompaniyasi maxfiy eslatma');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' xotira-yoz'; end if;
  r := t2_agent_muhit_v1(u_boss2, k2, null);
  if (r->>'ok')::boolean and jsonb_array_length(r->'xotira') = 0 and position('maxfiy' in r::text) = 0 then ok := ok + 1; else bad := bad || ' xotira-izolyatsiya'; end if;
  r := t2_agent_muhit_v1(u_super, null, null);
  if position('maxfiy' in r::text) = 0 then ok := ok + 1; else bad := bad || ' xotira-global-oqish'; end if;
  r := t2_agent_xotira_yoz_v1(u_boss2, k1, null, 'x.y', 'begona yozuv');
  if r->>'code' = 'COMPANY_ACCESS_DENIED' then ok := ok + 1; else bad := bad || ' xotira-begona-yoz'; end if;

  -- 4) qoida taklifi: kompaniya doirasi; tasdiq vakolati
  r := t2_agent_taklif_yarat_v1(u_pto1, k1, 'qoida', 'company', null, 'Narx tekshiruvi', '{"kod":"narx_tekshiruv","matn":"Narxni har doim F2 shabloni bilan solishtir"}', '[]', null);
  if (r->>'ok')::boolean then ok := ok + 1; tid := (r->>'id')::bigint; else bad := bad || ' taklif-yarat'; end if;
  r := t2_agent_muhit_v1(u_pto1, k1, null);
  if position('narx_tekshiruv' in r::text) = 0 then ok := ok + 1; else bad := bad || ' tasdiqsiz-faol'; end if;
  r := t2_agent_taklif_qaror_v1(u_pto1, tid, 'tasdiqlash', null);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' pto-tasdiq-rad'; end if;
  r := t2_agent_taklif_qaror_v1(u_boss2, tid, 'tasdiqlash', null);
  if r->>'code' = 'COMPANY_ACCESS_DENIED' or r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' begona-tasdiq'; end if;
  r := t2_agent_taklif_qaror_v1(u_boss1, tid, 'tasdiqlash', 'ok');
  if (r->>'ok')::boolean and r->>'holat' = 'qollandi' then ok := ok + 1; else bad := bad || ' boss-tasdiq'; end if;
  r := t2_agent_muhit_v1(u_pto1, k1, null);
  if position('narx_tekshiruv' in r::text) > 0 then ok := ok + 1; else bad := bad || ' tasdiqdan-keyin-faol'; end if;
  r := t2_agent_muhit_v1(u_boss2, k2, null);
  if position('narx_tekshiruv' in r::text) = 0 then ok := ok + 1; else bad := bad || ' qoida-begonaga-oqdi'; end if;
  r := t2_agent_taklif_qaror_v1(u_boss1, tid, 'rad', null);
  if r->>'code' = 'ALLAQACHON_KORIB_CHIQILGAN' then ok := ok + 1; else bad := bad || ' ikki-marta-qaror'; end if;

  -- 5) global taklif: kompaniya kontekstidan faqat manba; global tasdiq faqat superadmin; qoida taklifi global bo'lmaydi
  r := t2_agent_taklif_yarat_v1(u_boss1, k1, 'qoida', 'global', null, 'Global qoida', '{"kod":"global_x","matn":"umumiy qoida matni"}', '[]', null);
  if r->>'code' = 'GLOBAL_TAKLIF_FAQAT_MANBA' then ok := ok + 1; else bad := bad || ' global-qoida-kompaniyadan'; end if;
  r := t2_agent_taklif_yarat_v1(u_pto1, k1, 'manba', 'global', null, 'Me''yor sayti', '{"domen":"example-norma.uz","nom":"Test me''yor sayti"}', '[]', null);
  if (r->>'ok')::boolean then ok := ok + 1; tid := (r->>'id')::bigint; else bad := bad || ' manba-taklif'; end if;
  r := t2_agent_veb_ruxsat_v1(u_pto1, k1, 'example-norma.uz');
  if r->>'code' = 'MANBA_TASDIQLANMAGAN' then ok := ok + 1; else bad := bad || ' manba-tasdiqsiz-ruxsat'; end if;
  r := t2_agent_taklif_qaror_v1(u_boss1, tid, 'tasdiqlash', null);
  if r->>'code' = 'GLOBAL_SCOPE_DENIED' then ok := ok + 1; else bad := bad || ' boss-global-tasdiq'; end if;
  r := t2_agent_taklif_qaror_v1(u_super, tid, 'tasdiqlash', null);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' super-tasdiq'; end if;
  r := t2_agent_veb_ruxsat_v1(u_pto1, k1, 'example-norma.uz');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' manba-faol'; end if;
  r := t2_agent_veb_ruxsat_v1(u_pto1, k1, 'sub.example-norma.uz');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' subdomen'; end if;
  r := t2_agent_veb_ruxsat_v1(u_pto1, k1, 'evilexample-norma.uz');
  if r->>'code' = 'MANBA_TASDIQLANMAGAN' then ok := ok + 1; else bad := bad || ' o''xshash-domen'; end if;
  r := t2_agent_taklif_yarat_v1(u_pto1, k1, 'manba', 'global', null, 'IP adresi', '{"domen":"127.0.0.1","nom":"lokal"}', '[]', null);
  if r->>'code' = 'MANBA_INVALID' then ok := ok + 1; else bad := bad || ' ip-manba'; end if;

  -- 6) rivojlanish taklifi: tasdiq faqat g'oya holatiga o'tadi (hech narsa o'zgarmaydi)
  r := t2_agent_taklif_yarat_v1(u_pto1, k1, 'rivojlanish', 'company', null, 'F2 uchun yangi hisobot', '{"tavsif":"yangi hisobot kerak"}', '[]', null);
  tid := (r->>'id')::bigint;
  select count(*) into n from t2_agent_qoida;
  r := t2_agent_taklif_qaror_v1(u_boss1, tid, 'tasdiqlash', null);
  if (r->>'ok')::boolean and r->>'holat' = 'tasdiqlandi' and (select count(*) from t2_agent_qoida) = n then ok := ok + 1; else bad := bad || ' rivojlanish'; end if;

  -- 7) veb jurnali + taklif ro'yxati izolyatsiyasi
  r := t2_agent_veb_log_v1(u_pto1, k1, 'https://example-norma.uz/x', 'example-norma.uz', 200, 1234, 'abc', null);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' veb-log'; end if;
  r := t2_agent_taklif_royxat_v1(u_boss2, k2, null);
  if (r->>'ok')::boolean and jsonb_array_length(r->'natija') = 0 then ok := ok + 1; else bad := bad || ' royxat-izolyatsiya'; end if;

  raise exception 'AGENT_MUHIT_TEST ok=% / 31 bad=[%]', ok, bad;
end $t$;
