-- T2-NAKRUTKA-SHARTNOMA-DOIRA-V1 contract (BEGIN..ROLLBACK; faqat disposable branch / lokal yoki ROLLBACK repetitsiya).
-- Migratsiya: 20270120100000_t2_nakrutka_shartnoma_doira_v1. Faqat sintetik tenant va sonlar.
-- Natija: oxirgi exception "TEST_NSD ..." ichida (rollback bilan hech narsa qolmaydi).
-- Tekshiradi: (1) farqli foiz dalilsiz rad etiladi (SHARTNOMA_FOIZIDAN_FARQ), (2) istisno_dalil bilan o'tadi,
-- (3) farq funksiyasi, (4) teng foiz o'tadi, (5) tahrirda meros (o'zgarmagan) farq to'xtatmaydi, yangisi to'xtatadi,
-- (6) podval/koef o'zgarganda QORALAMA F-2 podvali yangilanadi, (7) tasdiqlangan F-2 va import podvaliga tegilmaydi.
-- Eslatma: migratsiya fayli ichidagi begin/commit olib tashlanib sinaladi (ROLLBACK COMMIT bo'lib ketmasin).
begin;
do $$
declare
  k bigint; o1 bigint; o2 bigint; s bigint; d1 bigint; a1 bigint; d2 bigint; d3 bigint;
  j jsonb; r record; n int; v integer; rep text[] := array[]::text[];
  k_tr text := U&'\0422\0420\0410\041D\0421\041F\041E\0420\0422_\041C\0410\0422\0415\0420\0418\0410\041B';  -- TRANSPORT_MATERIAL
  k_nds text := U&'\041D\0414\0421';                                                                    -- NDS
  dflt jsonb := public.t2_nakrutka_default_v1();
  q_farq jsonb; q_dalil jsonb; q_teng jsonb;
begin
  insert into t2_kompaniya (nom, kod, inn, faol) values ('TEST_NSD', 'TST-NSD', '900000092', true) returning id into k;
  insert into t2_obyekt (nom, kompaniya_id) values ('NSD-o1', k) returning id into o1;
  insert into t2_obyekt (nom, kompaniya_id) values ('NSD-o2', k) returning id into o2;
  insert into t2_shartnoma (kompaniya_id, raqam, nom, jami_nds_bilan, holat, kim) values (k, 'TEST-NSD', 'test', 1000, 'faol', 'test') returning id into s;
  insert into t2_shartnoma_bog (obyekt_id, shartnoma_id, holat) values (o1, s, 'faol'), (o2, s, 'faol');
  -- Shartnoma foizlari: transport 5, NDS 12 (sintetik).
  insert into t2_nakrutka_koef (kompaniya_id, shartnoma_id, koef_kod, qiymat) values (k, s, k_tr, 5), (k, s, k_nds, 12);

  -- Qoralama / tasdiqlangan / import F-2 lar (podvalsiz obyektda; trigger podval yozmaydi, qo'lda yozamiz).
  insert into t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (o1, k, 'f2', '2026-01-01', 'qoralama', 1, s, 'D1') returning id into d1;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (o1, k, 'f2', '2026-02-01', 'tasdiqlangan', 1, s, 'A1') returning id into a1;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (o1, k, 'f2', '2026-03-01', 'qoralama', 1, s, 'D2') returning id into d2;
  insert into t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, hujjat_jami, shartnoma_id, raqam) values (o2, k, 'f2', '2026-01-01', 'qoralama', 1, s, 'D3') returning id into d3;
  insert into t2_akt_podval (akt_id, blok, kompaniya_id, obyekt_id, manba, nk) values
    (d1, '', k, o1, 'smeta', dflt), (a1, '', k, o1, 'smeta', dflt), (d2, '', k, o1, 'import', dflt);
  select count(*) into n from t2_akt_podval where akt_id = d3;
  if n <> 0 then rep := rep || 'D3 podvali kutilmagan paydo bo''ldi'; end if;

  q_farq := jsonb_build_array(
    jsonb_build_object('kod','tr_mat','nom','T','tur','foiz','foiz',6,'koefKod',k_tr,'manba','smeta'),
    jsonb_build_object('kod','nds','nom','N','tur','foiz','foiz',null,'koefKod',k_nds,'manba','meros'));
  q_dalil := jsonb_build_array(
    jsonb_build_object('kod','tr_mat','nom','T','tur','foiz','foiz',6,'koefKod',k_tr,'manba','smeta','istisno_dalil','sintetik dalil: alohida ombor'),
    jsonb_build_object('kod','nds','nom','N','tur','foiz','foiz',null,'koefKod',k_nds,'manba','meros'));
  q_teng := jsonb_build_array(
    jsonb_build_object('kod','tr_mat','nom','T','tur','foiz','foiz',5,'koefKod',k_tr,'manba','smeta'),
    jsonb_build_object('kod','nds','nom','N','tur','foiz','foiz',12.0,'koefKod',k_nds,'manba','smeta'));

  -- 1) Dalilsiz farq rad etiladi, aniq kod va o'qiladigan xabar bilan; podval yozilmaydi.
  j := t2_nakrutka_podval_saqla_v1(k, o1, null, 'farq', q_farq, null, null, gen_random_uuid(), 'test');
  if coalesce((j->>'ok')::boolean, true) or j->>'code' <> 'SHARTNOMA_FOIZIDAN_FARQ' or coalesce(j->>'error', '') !~ 'tr_mat' or jsonb_array_length(j->'farq') <> 1 then
    rep := rep || ('1 rad etilmadi: ' || j::text);
  end if;
  if exists (select 1 from t2_nakrutka_podval where obyekt_id = o1) then rep := rep || '1 podval yozilib qoldi'; end if;

  -- 3) Farq funksiyasi (taklif qilingan qatorlar bilan, saqlanmagan podvalda ham ishlaydi).
  select count(*) into n from t2_podval_shartnoma_farq_v1(o1, q_farq);
  if n <> 1 then rep := rep || ('3 farq soni ' || n); end if;
  select * into r from t2_podval_shartnoma_farq_v1(o1, q_dalil);
  if r.kod <> 'tr_mat' or r.obyekt_foiz <> 6 or r.shartnoma_foiz <> 5 or r.istisno_dalil is null then rep := rep || '3 dalilli farq qatori noto''g''ri'; end if;
  if exists (select 1 from t2_podval_shartnoma_farq_v1(o1, q_teng)) then rep := rep || '3 teng foizda farq chiqdi (12.0 vs 12)'; end if;

  -- 2) Dalil bilan o'tadi; QORALAMA F-2 podvali yangilanadi (6), tasdiqlangan va import tegilmaydi.
  j := t2_nakrutka_podval_saqla_v1(k, o1, null, 'istisno', q_dalil, null, null, gen_random_uuid(), 'test');
  if not (j->>'ok')::boolean then rep := rep || ('2 dalil bilan saqlanmadi: ' || j::text); end if;
  v := coalesce((j->>'versiya')::int, 1);
  if (select (nk->>k_tr)::numeric from t2_akt_podval where akt_id = d1 and blok = '') is distinct from 6 then rep := rep || '6 qoralama nk 6 bo''lmadi'; end if;
  if (select (nk->>k_tr)::numeric from t2_akt_podval where akt_id = a1 and blok = '') is distinct from 5 then rep := rep || '7 tasdiqlangan podvaliga tegildi'; end if;
  if (select (nk->>k_tr)::numeric from t2_akt_podval where akt_id = d2 and blok = '') is distinct from 5 then rep := rep || '7 import podvaliga tegildi'; end if;
  select count(*) into n from t2_akt_podval where akt_id = d3;
  if n <> 0 then rep := rep || '6 podvalsiz qoralamaga yangi qator yozildi'; end if;

  -- 6) Shartnoma koef o'zgarishi: NDS 12 -> 10 (podvalda NDS 'meros' - hisobga kirmaydi) => qoralama NDS 10, transport 6 (podval) qoladi.
  update t2_nakrutka_koef set qiymat = 10 where kompaniya_id = k and shartnoma_id = s and koef_kod = k_nds;
  select * into r from t2_akt_podval where akt_id = d1 and blok = '';
  if (r.nk->>k_nds)::numeric is distinct from 10 or (r.nk->>k_tr)::numeric is distinct from 6 or r.nds_foiz is distinct from 10 then
    rep := rep || ('6 koef sinxroni: ' || r.nk::text);
  end if;
  if (select (nk->>k_nds)::numeric from t2_akt_podval where akt_id = a1 and blok = '') is distinct from 12 then rep := rep || '7 koef o''zgarishi tasdiqlanganga tegdi'; end if;

  -- 6b) Podval faolsizlantirilsa - shartnoma foiziga qaytadi (transport 5).
  update t2_nakrutka_podval set faol = false where obyekt_id = o1;
  if (select (nk->>k_tr)::numeric from t2_akt_podval where akt_id = d1 and blok = '') is distinct from 5 then rep := rep || '6b faolsizlantirishda qoralama qaytmadi'; end if;

  update t2_nakrutka_koef set qiymat = 12 where kompaniya_id = k and shartnoma_id = s and koef_kod = k_nds;

  -- 4) Teng foiz dalilsiz o'tadi (o2).
  j := t2_nakrutka_podval_saqla_v1(k, o2, null, 'teng', q_teng, null, null, gen_random_uuid(), 'test');
  if not (j->>'ok')::boolean then rep := rep || ('4 teng foiz rad etildi: ' || j::text); end if;

  -- 5) Meros farq: podvalni to'g'ridan (eski usulda) farqli yozamiz; o'zgarmagan qator bilan tahrir o'tadi, yangi farq to'xtatadi.
  insert into t2_nakrutka_podval (kompaniya_id, obyekt_id, nom, qatorlar, operation_id, kim)
    values (k, o1, 'meros', q_farq, gen_random_uuid(), 'test') returning id, versiya into r;
  j := t2_nakrutka_podval_saqla_v1(k, o1, null, 'meros-tahrir', jsonb_build_array(
         jsonb_build_object('kod','tr_mat','nom','T','tur','foiz','foiz',6,'koefKod',k_tr,'manba','smeta'),
         jsonb_build_object('kod','nds','nom','N','tur','foiz','foiz',12,'koefKod',k_nds,'manba','smeta')),
       r.id, r.versiya, null, 'test');
  if not (j->>'ok')::boolean then rep := rep || ('5 meros farq tahrirni to''xtatdi: ' || j::text); end if;
  j := t2_nakrutka_podval_saqla_v1(k, o1, null, 'yangi-farq', jsonb_build_array(
         jsonb_build_object('kod','tr_mat','nom','T','tur','foiz','foiz',8,'koefKod',k_tr,'manba','smeta'),
         jsonb_build_object('kod','nds','nom','N','tur','foiz','foiz',12,'koefKod',k_nds,'manba','smeta')),
       r.id, coalesce((j->>'versiya')::int, r.versiya + 1), null, 'test');
  if coalesce((j->>'ok')::boolean, true) or j->>'code' <> 'SHARTNOMA_FOIZIDAN_FARQ' then rep := rep || ('5 yangi dalilsiz farq o''tib ketdi: ' || j::text); end if;

  -- 8) Shartnomasiz obyektda cheklov yo'q.
  insert into t2_obyekt (nom, kompaniya_id) values ('NSD-o3', k) returning id into n;
  j := t2_nakrutka_podval_saqla_v1(k, n, null, 'shartnomasiz', q_farq, null, null, gen_random_uuid(), 'test');
  if not (j->>'ok')::boolean then rep := rep || ('8 shartnomasiz obyekt rad etildi: ' || j::text); end if;

  raise exception 'TEST_NSD %', case when cardinality(rep) = 0 then 'PASS' else 'FAIL: ' || array_to_string(rep, ' | ') end;
end $$;
rollback;
