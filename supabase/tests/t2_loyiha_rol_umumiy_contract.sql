-- t2_loyiha_rol_umumiy_contract: rol asosidagi loyiha/shartnoma tahriri + avtomatik «Umumiy» loyiha. Oxirida ROLLBACK (raise exception).
do $t$
declare
  k1 bigint; k2 bigint; u_boss bigint; u_pto bigint; u_prorab bigint; u_kuz bigint; u_buy bigint; u_other bigint;
  r jsonb; l bigint; s bigint; ok int := 0; bad text := '';
begin
  insert into t2_kompaniya(kod, nom, faol) values ('TLA' || floor(random()*1e9)::text, 'TEST LOYIHA A', true) returning id into k1;
  insert into t2_kompaniya(kod, nom, faol) values ('TLB' || floor(random()*1e9)::text, 'TEST LOYIHA B', true) returning id into k2;
  insert into t2_foydalanuvchi(login) values ('tl_boss_' || k1) returning id into u_boss;
  insert into t2_foydalanuvchi(login) values ('tl_pto_' || k1) returning id into u_pto;
  insert into t2_foydalanuvchi(login) values ('tl_prorab_' || k1) returning id into u_prorab;
  insert into t2_foydalanuvchi(login) values ('tl_kuz_' || k1) returning id into u_kuz;
  insert into t2_foydalanuvchi(login) values ('tl_buy_' || k1) returning id into u_buy;
  insert into t2_foydalanuvchi(login) values ('tl_other_' || k1) returning id into u_other;
  insert into t2_azolik(kompaniya_id, foydalanuvchi_id, rol, holat) values
    (k1, u_boss, 'boss', 'faol'), (k1, u_pto, 'pto', 'faol'), (k1, u_prorab, 'prorab', 'faol'), (k1, u_kuz, 'kuzatuvchi', 'faol'), (k1, u_buy, 'buyurtmachi', 'faol'),
    (k2, u_other, 'boss', 'faol');

  -- 1) umumiy: kompaniyada loyiha yo'q → yaratadi; ikkinchi chaqiruv o'shani qaytaradi
  r := t2_loyiha_umumiy_v1(u_kuz, k1);
  if (r->>'ok')::boolean and (r->>'yangi')::boolean then ok := ok + 1; else bad := bad || ' umumiy-yangi'; end if;
  l := (r->>'id')::bigint;
  r := t2_loyiha_umumiy_v1(u_buy, k1);
  if (r->>'id')::bigint = l and not (r->>'yangi')::boolean then ok := ok + 1; else bad := bad || ' umumiy-idempotent'; end if;
  if (select count(*) from t2_loyiha where kompaniya_id = k1) = 1 then ok := ok + 1; else bad := bad || ' umumiy-bitta'; end if;
  -- begona kompaniya a'zosi umumiy ocholmaydi
  begin perform t2_loyiha_umumiy_v1(u_other, k1); bad := bad || ' umumiy-begona'; exception when others then ok := ok + 1; end;

  -- 2) loyiha tahriri: boss, pto, prorab to'liq maydonlar; kuzatuvchi/buyurtmachi rad
  r := t2_loyiha_yangila(u_pto, l, 1, 'Yangi nom', 'izoh', 'Toshkent', 1000, 'tuxtatilgan');
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' pto-tahrir'; end if;
  r := t2_loyiha_yangila(u_prorab, l, 2, null, null, 'Navoiy', null, 'faol');
  if (r->>'ok')::boolean and (select hudud || nom from t2_loyiha where id = l) = 'NavoiyYangi nom' then ok := ok + 1; else bad := bad || ' prorab-tahrir'; end if;
  r := t2_loyiha_yangila(u_kuz, l, 3, 'X');
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' kuz-rad'; end if;
  r := t2_loyiha_yangila(u_buy, l, 3, 'X');
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' buy-rad'; end if;
  begin perform t2_loyiha_yangila(u_other, l, 3, 'X'); bad := bad || ' begona-tahrir'; exception when others then ok := ok + 1; end;
  r := t2_loyiha_yangila(u_boss, l, 1, 'X');
  if (r->>'ok')::boolean is not true then ok := ok + 1; else bad := bad || ' eski-versiya'; end if;
  -- bekor holati / o'chirish: pto/prorab emas
  r := t2_loyiha_yangila(u_pto, l, 3, null, null, null, null, 'bekor');
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' pto-bekor-holat'; end if;
  r := t2_loyiha_ochir(u_prorab, l);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' prorab-ochir'; end if;
  r := t2_loyiha_yarat(u_kuz, k1, 'Y');
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' kuz-yarat'; end if;
  r := t2_loyiha_yarat(u_prorab, k1, 'Ikkinchi', 'i', 'h', 5);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' prorab-yarat'; end if;

  -- 3) shartnoma bekori: bugalter/pto/boss; kuzatuvchi rad
  insert into t2_shartnoma(kompaniya_id, loyiha_id, raqam, kim, holat) values (k1, l, 'T-1', 'test', 'faol') returning id into s;
  r := t2_shartnoma_ochir(u_kuz, s, null);
  if r->>'code' = 'WRITE_ROLE_REQUIRED' then ok := ok + 1; else bad := bad || ' kuz-sh-rad'; end if;
  r := t2_shartnoma_ochir(u_pto, s, null);
  if (r->>'ok')::boolean and (select holat from t2_shartnoma where id = s) = 'bekor' then ok := ok + 1; else bad := bad || ' pto-sh-bekor'; end if;

  -- 4) boss loyihani bekor qiladi
  r := t2_loyiha_ochir(u_boss, l);
  if (r->>'ok')::boolean then ok := ok + 1; else bad := bad || ' boss-ochir'; end if;

  raise exception 'LOYIHA_ROL_TEST ok=% / 17 bad=[%]', ok, bad;
end $t$;
