-- ACCEPTANCE: 20261110200000_t2_profil_xavfsizlik_v1 (migratsiya qo'llangan bazada; BEGIN..ROLLBACK — hech narsa qolmaydi).
-- Sintetik foydalanuvchilar/kompaniyalar. Tekshiradi: profil o'qish/yangilash validatsiyasi, parol almashtirish (eski parol, qisqa/uzun,
-- bir xil, Google-only), sessiya_bekor_dan, google uzish/ulash, hisob birlashtirish (a'zolik ko'chishi, to'qnashuv, xato kodlari),
-- birlashtirilgan hisob bilan parol orqali kirish → omon qolgan hisob, t2_men_v1 sessiya_bekor_dan.
begin;

do $acc$
declare
  k1 bigint; k2 bigint; k3 bigint; a bigint; o bigint; g bigint; r jsonb; rep text[] := array[]::text[];
  v_login text := 'acc_prof_' || floor(random()*1e9)::text;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('TEST_PROF1','TPF1',true) returning id into k1;
  insert into public.t2_kompaniya (nom, kod, faol) values ('TEST_PROF2','TPF2',true) returning id into k2;
  insert into public.t2_kompaniya (nom, kod, faol) values ('TEST_PROF3','TPF3',true) returning id into k3;
  -- a: «Gmail» hisobi (parolsiz, google ulangan); o: «admin» hisobi (parol bor). Bitta odam.
  insert into public.t2_foydalanuvchi (login, email, ism, holat, google_sub) values (v_login||'@gmail.com', v_login||'@gmail.com', 'Odam', 'faol', 'sub_'||v_login) returning id into a;
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash, parol_yangilandi) values (v_login||'_admin', 'Admin', 'faol', extensions.crypt('eski-parol-1', extensions.gen_salt('bf')), now()) returning id into o;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values
    (a, k1, 'boss', 'faol'), (a, k3, 'pto', 'faol'),
    (o, k1, 'superadmin', 'faol'), (o, k2, 'boss', 'faol');

  -- 1. profil
  r := public.t2_profil_ol_v1(a);
  rep := rep || (case when (r->>'ok')::boolean and (r->'profil'->>'google_ulangan')::boolean and not (r->'profil'->>'parol_bor')::boolean
                       and not (r->'profil' ? 'parol_hash') and not (r->'profil' ? 'google_sub') then 'OK   profil_ol: shakl, parol_hash/google_sub yo''q' else 'FAIL profil_ol ' || r::text end);
  rep := rep || (case when public.t2_profil_ol_v1(-1)->>'code' = 'ACTOR_NOT_FOUND' then 'OK   profil_ol: actor yo''q' else 'FAIL ACTOR_NOT_FOUND' end);

  -- 2. yangilash
  r := public.t2_profil_yangila_v1(a, '  Yangi Ism ', '+998 90 123-45-67', 'ru', '#A1b2C3');
  rep := rep || (case when (r->>'ok')::boolean and r->'profil'->>'ism' = 'Yangi Ism' and r->'profil'->>'telefon' = '+998901234567'
                       and r->'profil'->>'til' = 'ru' and not (r->'profil'->>'telefon_tasdiqlangan')::boolean then 'OK   yangila: trim, telefon normallashdi' else 'FAIL yangila ' || r::text end);
  update public.t2_foydalanuvchi set telefon_tasdiqlangan = true where id = a;
  r := public.t2_profil_yangila_v1(a, null, '+998901234567', null, null);
  rep := rep || (case when (public.t2_profil_ol_v1(a)->'profil'->>'telefon_tasdiqlangan')::boolean then 'OK   telefon o''zgarmasa tasdiq saqlanadi' else 'FAIL tasdiq yo''qoldi' end);
  r := public.t2_profil_yangila_v1(a, null, '+998901234568', null, null);
  rep := rep || (case when not (public.t2_profil_ol_v1(a)->'profil'->>'telefon_tasdiqlangan')::boolean then 'OK   telefon o''zgarsa tasdiq tushadi' else 'FAIL tasdiq tushmadi' end);
  r := public.t2_profil_yangila_v1(a, null, '', null, null);
  rep := rep || (case when public.t2_profil_ol_v1(a)->'profil'->>'telefon' is null then 'OK   bo''sh telefon → null' else 'FAIL telefon null emas' end);
  rep := rep || (case when public.t2_profil_yangila_v1(a,'x',null,null,null)->>'code' = 'ISM_NOTOGRI'
                       and public.t2_profil_yangila_v1(a,null,'12ab',null,null)->>'code' = 'TELEFON_NOTOGRI'
                       and public.t2_profil_yangila_v1(a,null,null,'de',null)->>'code' = 'TIL_NOTOGRI'
                       and public.t2_profil_yangila_v1(a,null,null,null,'red')->>'code' = 'RANG_NOTOGRI'
                       and public.t2_profil_yangila_v1(a,null,null,null,null)->>'ok' = 'true' then 'OK   validatsiya kodlari, hammasi null = o''zgarmaydi' else 'FAIL validatsiya' end);

  -- 3. parol (o: hash bor)
  rep := rep || (case when public.t2_parol_ozgartir_v1(o,'noto''g''ri','yangi-parol-123')->>'code' = 'ESKI_PAROL_XATO'
                       and public.t2_parol_ozgartir_v1(o,null,'yangi-parol-123')->>'code' = 'ESKI_PAROL_XATO' then 'OK   ESKI_PAROL_XATO' else 'FAIL ESKI_PAROL_XATO' end);
  rep := rep || (case when public.t2_parol_ozgartir_v1(o,'eski-parol-1','qisqa')->>'code' = 'PAROL_QISQA'
                       and public.t2_parol_ozgartir_v1(o,'eski-parol-1',repeat('x',129))->>'code' = 'PAROL_UZUN'
                       and public.t2_parol_ozgartir_v1(o,'eski-parol-1','eski-parol-1')->>'code' = 'PAROL_BIR_XIL' then 'OK   PAROL_QISQA/UZUN/BIR_XIL' else 'FAIL parol validatsiya' end);
  rep := rep || (case when (select sessiya_bekor_dan from public.t2_foydalanuvchi where id = o) is null then 'OK   muvaffaqiyatsiz urinish sessiyani bekor qilmaydi' else 'FAIL bekor erta' end);
  r := public.t2_parol_ozgartir_v1(o,'eski-parol-1','yangi-parol-123');
  rep := rep || (case when (r->>'ok')::boolean and r->>'sessiya_bekor_dan' is not null
                       and (select parol_hash <> extensions.crypt('yangi-parol-123', parol_hash) from public.t2_foydalanuvchi where id = o) is false then 'OK   parol almashdi, sessiya_bekor_dan qo''yildi' else 'FAIL parol_ozgartir ' || r::text end);
  -- Google-only (a: hash yo'q): eski shart emas
  rep := rep || (case when (public.t2_parol_ozgartir_v1(a,null,'google-uchun-parol')->>'ok')::boolean then 'OK   Google-only: eski parolsiz o''rnatildi' else 'FAIL google-only parol' end);

  -- 4. sessiya bekor
  r := public.t2_sessiya_bekor_v1(a);
  rep := rep || (case when (r->>'ok')::boolean and r->>'sessiya_bekor_dan' is not null and public.t2_sessiya_bekor_v1(-1)->>'code' = 'ACTOR_NOT_FOUND' then 'OK   sessiya_bekor' else 'FAIL sessiya_bekor' end);

  -- 5. t2_men_v1 sessiya_bekor_dan ni qaytaradi
  r := public.t2_men_v1(a);
  rep := rep || (case when (r->>'ok')::boolean and r->'foydalanuvchi'->>'sessiya_bekor_dan' is not null then 'OK   t2_men_v1.foydalanuvchi.sessiya_bekor_dan' else 'FAIL t2_men_v1 ' || left(r::text,200) end);

  -- 6. google ulash/uzish
  rep := rep || (case when public.t2_google_ulash_v1(a, 'sub_boshqa', v_login||'@gmail.com')->>'code' = 'GOOGLE_ALLAQACHON_ULANGAN' then 'OK   ulangan hisobga boshqa Google rad' else 'FAIL allaqachon' end);
  r := public.t2_google_ulash_v1(o, 'sub_'||v_login, v_login||'@gmail.com');
  rep := rep || (case when r->>'code' = 'GOOGLE_BOSHQA_HISOB' and r->>'boshqa_login' = v_login||'@gmail.com' then 'OK   GOOGLE_BOSHQA_HISOB + boshqa_login' else 'FAIL ulash ' || r::text end);
  r := public.t2_google_uzish_v1(a);   -- a da parol endi bor
  rep := rep || (case when (r->>'ok')::boolean and not (r->'profil'->>'google_ulangan')::boolean then 'OK   google_uzish (parol bor)' else 'FAIL google_uzish ' || r::text end);
  update public.t2_foydalanuvchi set parol_hash = null where id = a;
  update public.t2_foydalanuvchi set google_sub = 'sub_'||v_login where id = a;
  rep := rep || (case when public.t2_google_uzish_v1(a)->>'code' = 'GOOGLE_PAROLSIZ' then 'OK   GOOGLE_PAROLSIZ' else 'FAIL GOOGLE_PAROLSIZ' end);
  update public.t2_foydalanuvchi set parol_hash = null, google_sub = null, email = null where id = a;  -- birlashtirish ssenariysi uchun: a faqat login
  update public.t2_foydalanuvchi set google_sub = 'sub_'||v_login, email = v_login||'@gmail.com' where id = o;
  r := public.t2_google_ulash_v1(a, 'sub_'||v_login, v_login||'@gmail.com');
  rep := rep || (case when r->>'code' = 'GOOGLE_BOSHQA_HISOB' and r->>'boshqa_login' = v_login||'_admin' then 'OK   boshqa faol hisobdagi google → GOOGLE_BOSHQA_HISOB' else 'FAIL ulash2 ' || r::text end);
  update public.t2_foydalanuvchi set google_sub = null, email = null where id = o;
  r := public.t2_google_ulash_v1(a, 'sub_'||v_login, v_login||'@gmail.com');
  rep := rep || (case when (r->>'ok')::boolean and (r->'profil'->>'google_ulangan')::boolean and r->'profil'->>'email' = v_login||'@gmail.com' then 'OK   google_ulash (email bo''sh edi — to''ldirildi)' else 'FAIL ulash3 ' || r::text end);

  -- 7. birlashtirish: a (actor) ← o. k1: ikkalasida bor (actor qoladi, o roli qolgan_rollar da), k2: ko'chadi, k3: faqat actor da.
  rep := rep || (case when public.t2_hisob_birlashtir_v1(a, v_login||'_admin', 'xato-parol')->>'code' = 'LOGIN_PAROL_XATO'
                       and public.t2_hisob_birlashtir_v1(a, 'yoq_login_xyz', 'x')->>'code' = 'LOGIN_PAROL_XATO'
                       and public.t2_hisob_birlashtir_v1(a, v_login||'@GMAIL.com', 'x')->>'code' = 'OZI' then 'OK   LOGIN_PAROL_XATO / OZI' else 'FAIL birlashtir xatolari' end);
  update public.t2_foydalanuvchi set parol_hash = null where id = o;
  rep := rep || (case when public.t2_hisob_birlashtir_v1(a, v_login||'_admin', 'yangi-parol-123')->>'code' = 'PAROLSIZ_HISOB' then 'OK   PAROLSIZ_HISOB' else 'FAIL PAROLSIZ' end);
  update public.t2_foydalanuvchi set parol_hash = extensions.crypt('yangi-parol-123', extensions.gen_salt('bf')) where id = o;
  r := public.t2_hisob_birlashtir_v1(a, upper(v_login)||'_ADMIN', 'yangi-parol-123');
  rep := rep || (case when (r->>'ok')::boolean
      and r->'kochirilgan_kompaniyalar' @> jsonb_build_array(jsonb_build_object('kompaniya_id',k2,'rol','boss'))
      and r->'qolgan_rollar' @> jsonb_build_array(jsonb_build_object('kompaniya_id',k1,'rol','superadmin','actor_rol','boss'))
      then 'OK   birlashtir: natija' else 'FAIL birlashtir ' || r::text end);
  rep := rep || (case when (select count(*) from public.t2_azolik where foydalanuvchi_id = a and holat = 'faol') = 3
      and (select rol from public.t2_azolik where foydalanuvchi_id = a and kompaniya_id = k1) = 'boss'
      and (select count(*) from public.t2_azolik where foydalanuvchi_id = o and holat = 'faol') = 0 then 'OK   a''zoliklar actor da (k1,k2,k3), o da faol yo''q' else 'FAIL azoliklar' end);
  rep := rep || (case when (select holat = 'birlashtirildi' and birlashgan_id = a and sessiya_bekor_dan is not null from public.t2_foydalanuvchi where id = o) then 'OK   o: birlashtirildi, birlashgan_id, sessiya_bekor_dan' else 'FAIL o holati' end);
  rep := rep || (case when (select email = v_login||'@gmail.com' from public.t2_foydalanuvchi where id = a) then 'OK   email actor ga nusxalandi (yoki saqlandi)' else 'FAIL email' end);
  rep := rep || (case when public.t2_hisob_birlashtir_v1(a, v_login||'_admin', 'yangi-parol-123')->>'code' = 'LOGIN_PAROL_XATO' then 'OK   birlashtirilgan hisob qayta birlashtirilmaydi' else 'FAIL qayta' end);

  -- 8. Birlashtirilgan hisob bilan kirish → omon qolgan
  r := public.t2_parol_tekshir_v1(v_login||'_admin', 'yangi-parol-123');
  rep := rep || (case when (r->>'ok')::boolean and (r->>'foydalanuvchi_id')::bigint = a and r->>'login' = v_login||'@gmail.com' then 'OK   parol_tekshir: birlashtirilgan → omon qolgan' else 'FAIL parol_tekshir ' || r::text end);
  rep := rep || (case when public.t2_parol_tekshir_v1(v_login||'_admin', 'xato')->>'code' = 'PAROL_NOTOGRI' then 'OK   birlashtirilgan hisob noto''g''ri parol rad' else 'FAIL parol_notogri' end);
  g := a;
  rep := rep || (case when (public.t2_google_kirish_v1(v_login||'@gmail.com', 'X', 'sub_'||v_login, 'ip', gen_random_uuid())->>'foydalanuvchi_id')::bigint = a then 'OK   google_kirish: faol hisob' else 'FAIL google_kirish' end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception E'ACCEPTANCE FAIL:\n%', array_to_string(rep, E'\n');
  end if;
  raise notice E'ACCEPTANCE OK:\n%', array_to_string(rep, E'\n');
end $acc$;

rollback;
