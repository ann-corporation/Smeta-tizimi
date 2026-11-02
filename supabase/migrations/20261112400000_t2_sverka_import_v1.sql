-- T2-SVERKA-IMPORT-001 — 1C «Акт сверки взаимных расчетов» importi: to'lov, F3 (sotuv), F2 ↔ Продажа moslash, obyekt taqsimoti.
-- Egasi (2026-10-26): PTO 1C sverka faylini yuklaydi; har «Оплата» → t2_tolov, har «Продажа» → t2_forma3 (manba='sotuv').
-- Продажа summasi F2 ga teng bo'lmaydi va shart emas — F3 (sotuv) yopadi; F2 (t2_akt) ga TEGILMAYDI.
-- DUBLIKAT YO'Q — mavjud modellar kengaytiriladi:
--   * t2_tolov       + hujjat_raqam (bank hujjati №), manba ('qolda' | 'sverka_1c'); takror kaliti (shartnoma, sana, №, summa, tur).
--                      Bir xil bank № turli shartnomada turli summa bilan uchraydi — faqat № bo'yicha dedup qilinmaydi.
--   * t2_forma3_akt  (mavjud) — Продажа (manba='sotuv') ↔ F2 aktlar to'plami. Yangi bog' jadvali yo'q.
--   * t2_f2_reestr_jami (YANGI, minimal) — rasmiy F2 reestri hujjat jamilari (QQSsiz/QQS/QQS bilan); t2_akt.hujjat_jami = bog'langan
--                      qatorlar PRYAMYE yig'indisi (hujjat jami emas), reestrdagi ba'zi F2 esa tizimda umuman yo'q.
--   * t2_tolov_taqsimot (YANGI, minimal) — ko'p obyektli shartnomada to'lovning obyektlarga bo'linishi (FIFO taklif yoki qo'lda);
--                      obyekt_id null = taqsimlanmagan avans. Jami = to'lov summasi (tiyinigacha) tekshiriladi.
-- F2 ustamali summasi — mavjud _t2_f2_ustamali (t2_nakrutka_hisobla_v1 kaskadi, 20261108102000); yangi formula yo'q.
-- Hamma yozuv RPC: a'zolik + financial.write, idempotent (operation_id), audit.
-- PRODGA L0 qo'llaydi (agent qo'llamaydi). Rollback: 20261112400000_t2_sverka_import_v1.rollback.sql

begin;

-- 1. t2_tolov kengaytmasi
alter table public.t2_tolov add column if not exists hujjat_raqam text;
alter table public.t2_tolov add column if not exists manba text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_tolov_manba_check' and conrelid = 'public.t2_tolov'::regclass) then
    alter table public.t2_tolov add constraint t2_tolov_manba_check check (manba is null or manba in ('qolda', 'sverka_1c'));
  end if;
end $$;
comment on column public.t2_tolov.hujjat_raqam is 'Bank/1C hujjat raqami (sverkadagi «Оплата (N от …)»). Takror kaliti: shartnoma + sana + № + summa + tur.';
comment on column public.t2_tolov.manba is 'qolda — qo''lda kiritilgan; sverka_1c — 1C akt-sverka importi.';
create unique index if not exists t2_tolov_sverka_takror_uq on public.t2_tolov(shartnoma_id, sana, hujjat_raqam, summa, tur)
  where hujjat_raqam is not null and holat <> 'bekor';

-- 2. To'lovning obyektlarga taqsimoti
create table if not exists public.t2_tolov_taqsimot (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tolov_id bigint not null references public.t2_tolov(id) on delete cascade,
  obyekt_id bigint references public.t2_obyekt(id) on delete cascade,
  summa numeric(20,2) not null check (summa > 0),
  manba text not null check (manba in ('fifo', 'qolda')),
  kim text,
  yaratildi timestamptz not null default now());
comment on table public.t2_tolov_taqsimot is 'To''lovning obyektlarga bo''linishi (ko''p obyektli shartnoma). obyekt_id null — taqsimlanmagan avans. Jami = |t2_tolov.summa|.';
create unique index if not exists t2_tolov_taqsimot_uq on public.t2_tolov_taqsimot(tolov_id, coalesce(obyekt_id, 0));
create index if not exists t2_tolov_taqsimot_k_idx on public.t2_tolov_taqsimot(kompaniya_id);
create index if not exists t2_tolov_taqsimot_o_idx on public.t2_tolov_taqsimot(obyekt_id);
alter table public.t2_tolov_taqsimot enable row level security;
revoke all on public.t2_tolov_taqsimot from anon, authenticated;

-- 3. Rasmiy F2 reestri jamilari (hujjatdagi QQSsiz / QQS / QQS bilan).
--    Nega t2_akt ga ustun emas: (a) tasdiqlangan F2 muzlaydi — t2_akt ni yangilash versiya/ko'zgu/audit triggerlarini qo'zg'atadi;
--    (b) reestrdagi ba'zi F2 tizimda umuman yo'q (akt_id null) — ular ham Продажа moslashida hisobga kirishi kerak.
--    t2_akt.hujjat_jami (bog'langan qatorlar PRYAMYE yig'indisi) o'zgarmaydi; UI ikkalasini alohida ko'rsatadi.
create table if not exists public.t2_f2_reestr_jami (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  akt_id bigint references public.t2_akt(id) on delete set null,
  raqam text not null check (length(btrim(raqam)) between 1 and 100),
  lot text, obyekt_ish text, davr text, oy date,
  qqssiz numeric(20,2), qqs numeric(20,2), qqs_bilan numeric(20,2),
  holat_matn text,
  /* Продажа (F3 sotuv) — faqat tizimda akti YO'Q reestr qatori uchun; akti bor qator t2_forma3_akt orqali bog'lanadi. */
  forma3_id bigint references public.t2_forma3(id) on delete set null,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  kim text,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check (qqssiz is not null or qqs_bilan is not null));
comment on table public.t2_f2_reestr_jami is 'Rasmiy F2 reestri: har F2 hujjat jami (QQSsiz/QQS/QQS bilan). akt_id null — reestrda bor, tizimda F2 yo''q. NULL ≠ 0.';
create unique index if not exists t2_f2_reestr_jami_uq on public.t2_f2_reestr_jami(shartnoma_id, raqam) where holat = 'faol';
create unique index if not exists t2_f2_reestr_jami_akt_uq on public.t2_f2_reestr_jami(akt_id) where akt_id is not null and holat = 'faol';
create index if not exists t2_f2_reestr_jami_k_idx on public.t2_f2_reestr_jami(kompaniya_id);
create index if not exists t2_f2_reestr_jami_f3_idx on public.t2_f2_reestr_jami(forma3_id);
alter table public.t2_f2_reestr_jami enable row level security;
revoke all on public.t2_f2_reestr_jami from anon, authenticated;

/* ICHKI: akt shu shartnomaga tegishli F2 mi (tur='f2', holat <> 'bekor', akt.shartnoma_id yoki obyektning faol bog'i). */
create or replace function public._t2_akt_shartnoma_f2mi(p_kompaniya_id bigint, p_shartnoma_id bigint, p_akt_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.t2_akt a
     where a.id = p_akt_id and a.tur = 'f2' and a.holat <> 'bekor'
       and (a.kompaniya_id = p_kompaniya_id or a.kompaniya_id is null)
       and coalesce(a.shartnoma_id, (select b.shartnoma_id from public.t2_shartnoma_bog b where b.obyekt_id = a.obyekt_id and b.holat = 'faol'
                                      order by b.shartnoma_id limit 1)) = p_shartnoma_id);
$$;

/* YOZISH: F2 reestri qatorlari (CSV: №;Lot;Obyekt_ish;Davr;QQSsiz;QQS;QQS_bilan;Holat). Kalit: (shartnoma, №) — qayta yuklash yangilaydi.
   Har qator: {shartnoma_id, raqam, akt_id?, lot, obyekt_ish, davr, oy, qqssiz, qqs, qqs_bilan, holat_matn}. Xato qator — «xato», qolganlari yoziladi. */
create or replace function public.t2_f2_reestr_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb; v_e jsonb; v_i integer := 0; v_natija jsonb := '[]'::jsonb; v_sh bigint; v_akt bigint; v_raqam text;
  v_id bigint; v_holat text; v_yangi integer := 0; v_yangilandi integer := 0; v_xato integer := 0; v_kim text := 'actor:' || p_actor_id;
  v_n1 numeric; v_n2 numeric; v_n3 numeric;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 200 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_INVALID');
  end if;
  for v_e in select * from jsonb_array_elements(p_qatorlar) loop
    v_i := v_i + 1; v_id := null;
    begin
      v_raqam := nullif(btrim(coalesce(v_e->>'raqam', '')), '');
      v_akt := nullif(v_e->>'akt_id', '')::bigint;
      v_n1 := round(nullif(v_e->>'qqssiz', '')::numeric, 2); v_n2 := round(nullif(v_e->>'qqs', '')::numeric, 2); v_n3 := round(nullif(v_e->>'qqs_bilan', '')::numeric, 2);
      select id into v_sh from public.t2_shartnoma where id = nullif(v_e->>'shartnoma_id', '')::bigint and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
      if v_sh is null then raise exception 'SHARTNOMA_NOT_FOUND'; end if;
      if v_raqam is null then raise exception 'RAQAM_YOQ'; end if;
      if v_n1 is null and v_n3 is null then raise exception 'SUMMA_YOQ'; end if;
      if v_akt is not null and not public._t2_akt_shartnoma_f2mi(p_kompaniya_id, v_sh, v_akt) then raise exception 'AKT_INVALID'; end if;
      update public.t2_f2_reestr_jami set akt_id = v_akt, lot = nullif(v_e->>'lot', ''), obyekt_ish = nullif(left(coalesce(v_e->>'obyekt_ish', ''), 500), ''),
             davr = nullif(v_e->>'davr', ''), oy = nullif(v_e->>'oy', '')::date, qqssiz = v_n1, qqs = v_n2, qqs_bilan = v_n3,
             holat_matn = nullif(v_e->>'holat_matn', ''), versiya = versiya + 1, yangilandi = now(), kim = v_kim
       where shartnoma_id = v_sh and raqam = v_raqam and holat = 'faol' and kompaniya_id = p_kompaniya_id
       returning id into v_id;
      if v_id is not null then v_holat := 'yangilandi'; v_yangilandi := v_yangilandi + 1;
      else
        insert into public.t2_f2_reestr_jami(kompaniya_id, shartnoma_id, akt_id, raqam, lot, obyekt_ish, davr, oy, qqssiz, qqs, qqs_bilan, holat_matn, kim)
        values (p_kompaniya_id, v_sh, v_akt, v_raqam, nullif(v_e->>'lot', ''), nullif(left(coalesce(v_e->>'obyekt_ish', ''), 500), ''), nullif(v_e->>'davr', ''),
                nullif(v_e->>'oy', '')::date, v_n1, v_n2, v_n3, nullif(v_e->>'holat_matn', ''), v_kim)
        returning id into v_id;
        v_holat := 'yangi'; v_yangi := v_yangi + 1;
      end if;
      v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'holat', v_holat, 'id', v_id));
    exception when others then
      v_xato := v_xato + 1;
      v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'holat', 'xato', 'code', left(sqlerrm, 200)));
    end;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'f2_reestr_yoz_v1', 'nakopitelniy_svod', null,
    format('qator=%s yangi=%s yangilandi=%s xato=%s', v_i, v_yangi, v_yangilandi, v_xato), v_kim, null);
  v_res := jsonb_build_object('ok', true, 'yangi', v_yangi, 'yangilandi', v_yangilandi, 'xato', v_xato, 'natija', v_natija);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'f2_reestr_yoz_v1', v_res);
  return v_res;
end $$;

/* ICHKI: to'lov taqsimotini to'liq almashtiradi. Tekshiruv: to'lov kompaniyaniki va faol; obyekt shu shartnomaga faol bog'langan;
   har summa > 0; jami = |to'lov summasi| (tiyinigacha). */
create or replace function public._t2_tolov_taqsimot_yoz(p_kompaniya_id bigint, p_tolov_id bigint, p_qatorlar jsonb, p_kim text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.t2_tolov%rowtype; v_e jsonb; v_jami numeric := 0; v_o bigint; v_s numeric; v_m text;
begin
  select * into v_t from public.t2_tolov where id = p_tolov_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOLOV_NOT_FOUND'); end if;
  if v_t.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'TOLOV_BEKOR'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 100 then
    return jsonb_build_object('ok', false, 'code', 'TAQSIMOT_INVALID');
  end if;
  for v_e in select * from jsonb_array_elements(p_qatorlar) loop
    v_o := nullif(v_e->>'obyekt_id', '')::bigint;
    v_s := round(nullif(v_e->>'summa', '')::numeric, 2);
    v_m := coalesce(nullif(v_e->>'manba', ''), 'qolda');
    if v_s is null or v_s <= 0 or v_m not in ('fifo', 'qolda') then return jsonb_build_object('ok', false, 'code', 'TAQSIMOT_SUMMA'); end if;
    if v_o is not null and not exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = v_t.shartnoma_id and b.obyekt_id = v_o and b.holat = 'faol') then
      return jsonb_build_object('ok', false, 'code', 'TAQSIMOT_OBYEKT', 'obyekt_id', v_o);
    end if;
    v_jami := v_jami + v_s;
  end loop;
  if jsonb_array_length(p_qatorlar) > 0 and v_jami <> round(abs(v_t.summa), 2) then
    return jsonb_build_object('ok', false, 'code', 'TAQSIMOT_JAMI', 'jami', v_jami, 'tolov', round(abs(v_t.summa), 2));
  end if;
  if (select count(*) from jsonb_array_elements(p_qatorlar) x) <> (select count(distinct coalesce(nullif(x->>'obyekt_id', '')::bigint, 0)) from jsonb_array_elements(p_qatorlar) x) then
    return jsonb_build_object('ok', false, 'code', 'TAQSIMOT_TAKROR_OBYEKT');
  end if;
  delete from public.t2_tolov_taqsimot where tolov_id = p_tolov_id;
  insert into public.t2_tolov_taqsimot(kompaniya_id, tolov_id, obyekt_id, summa, manba, kim)
  select p_kompaniya_id, p_tolov_id, nullif(x->>'obyekt_id', '')::bigint, round((x->>'summa')::numeric, 2), coalesce(nullif(x->>'manba', ''), 'qolda'), p_kim
    from jsonb_array_elements(p_qatorlar) x;
  return jsonb_build_object('ok', true, 'soni', jsonb_array_length(p_qatorlar));
end $$;

/* ICHKI: Продажа (F3 manba='sotuv') ↔ F2 to'plamini almashtiradi.
   Tizimdagi F2 (akt) — mavjud t2_forma3_akt orqali; akt: tur='f2', holat <> 'bekor', shu shartnomaniki, boshqa faol sotuv F3 ga bog'lanmagan.
   Tizimda akti yo'q reestr F2 — t2_f2_reestr_jami.forma3_id orqali (faqat akt_id null qatorlar; akti bor qator akt orqali bog'lanadi). */
create or replace function public._t2_forma3_f2_bog(p_kompaniya_id bigint, p_forma3_id bigint, p_akt_ids bigint[], p_reestr_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_f public.t2_forma3%rowtype; v_yomon bigint[]; v_band bigint[]; v_akt bigint[] := coalesce(p_akt_ids, '{}'::bigint[]);
  v_re bigint[] := coalesce(p_reestr_ids, '{}'::bigint[]);
begin
  select * into v_f from public.t2_forma3 where id = p_forma3_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'F3_NOT_FOUND'); end if;
  if v_f.manba <> 'sotuv' then return jsonb_build_object('ok', false, 'code', 'F3_F2_DAN'); end if;
  if v_f.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'F3_BEKOR'); end if;
  if coalesce(array_length(v_akt, 1), 0) + coalesce(array_length(v_re, 1), 0) > 500 then return jsonb_build_object('ok', false, 'code', 'AKT_KOP'); end if;
  select array_agg(x) into v_yomon from unnest(v_akt) x where not public._t2_akt_shartnoma_f2mi(p_kompaniya_id, v_f.shartnoma_id, x);
  if v_yomon is not null then return jsonb_build_object('ok', false, 'code', 'AKT_INVALID', 'akt_ids', to_jsonb(v_yomon)); end if;
  select array_agg(x) into v_yomon from unnest(v_re) x
   where not exists (select 1 from public.t2_f2_reestr_jami r where r.id = x and r.kompaniya_id = p_kompaniya_id and r.shartnoma_id = v_f.shartnoma_id
                        and r.holat = 'faol' and r.akt_id is null);
  if v_yomon is not null then return jsonb_build_object('ok', false, 'code', 'REESTR_INVALID', 'reestr_ids', to_jsonb(v_yomon)); end if;
  select array_agg(distinct fa.akt_id) into v_band from public.t2_forma3_akt fa join public.t2_forma3 f on f.id = fa.forma3_id
   where fa.akt_id = any(v_akt) and f.id <> p_forma3_id and f.manba = 'sotuv' and f.holat <> 'bekor';
  if v_band is not null then return jsonb_build_object('ok', false, 'code', 'F2_BOSHQA_SOTUVDA', 'akt_ids', to_jsonb(v_band)); end if;
  select array_agg(r.id) into v_band from public.t2_f2_reestr_jami r join public.t2_forma3 f on f.id = r.forma3_id
   where r.id = any(v_re) and f.id <> p_forma3_id and f.holat <> 'bekor';
  if v_band is not null then return jsonb_build_object('ok', false, 'code', 'F2_BOSHQA_SOTUVDA', 'reestr_ids', to_jsonb(v_band)); end if;
  delete from public.t2_forma3_akt where forma3_id = p_forma3_id;
  insert into public.t2_forma3_akt(forma3_id, akt_id) select p_forma3_id, x from unnest(v_akt) x group by x;
  update public.t2_f2_reestr_jami set forma3_id = null, yangilandi = now() where forma3_id = p_forma3_id and not (id = any(v_re));
  update public.t2_f2_reestr_jami set forma3_id = p_forma3_id, yangilandi = now() where id = any(v_re);
  return jsonb_build_object('ok', true, 'soni', coalesce(array_length(v_akt, 1), 0) + coalesce(array_length(v_re, 1), 0));
end $$;

/* YOZISH: sverka importi partiyasi (≤ 200 qator). Har qator: {tur: tolov|avans|qaytarim|sotuv, shartnoma_id, sana, summa (>0, QQS bilan),
   raqam, izoh, operation_id (barqaror xesh-UUID), obyekt_id?, taqsimot?: [{obyekt_id|null, summa, manba}], f3_holat?, f2_akt_ids?: [..]}.
   Takror (operation_id yoki tabiiy kalit) — yozilmaydi, mavjud id qaytadi. Shartnoma topilmasa/xato — shu qator «xato», qolganlari yoziladi. */
create or replace function public.t2_sverka_import_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb; v_e jsonb; v_i integer := 0; v_natija jsonb := '[]'::jsonb; v_tur text; v_sh public.t2_shartnoma%rowtype;
  v_sana date; v_summa numeric; v_raqam text; v_op uuid; v_id bigint; v_obyekt bigint; v_r jsonb; v_holat text; v_qosh jsonb;
  v_yangi integer := 0; v_takror integer := 0; v_xato integer := 0; v_kim text := 'actor:' || p_actor_id; v_akt bigint[]; v_reestr bigint[];
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 200 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_INVALID', 'xabar', 'Partiyada 1–200 qator bo''lishi kerak.');
  end if;
  perform public.t2_manba_belgila('import');

  for v_e in select * from jsonb_array_elements(p_qatorlar) loop
    v_i := v_i + 1; v_id := null; v_qosh := '{}'::jsonb;
    begin
      v_tur := v_e->>'tur';
      v_sana := nullif(v_e->>'sana', '')::date;
      v_summa := round(nullif(v_e->>'summa', '')::numeric, 2);
      v_raqam := nullif(btrim(coalesce(v_e->>'raqam', '')), '');
      v_op := nullif(v_e->>'operation_id', '')::uuid;
      v_obyekt := nullif(v_e->>'obyekt_id', '')::bigint;
      if v_tur not in ('tolov', 'avans', 'qaytarim', 'sotuv') then raise exception 'TUR_INVALID'; end if;
      if v_sana is null or v_summa is null or v_summa <= 0 or v_op is null then raise exception 'QATOR_MAYDON'; end if;
      select * into v_sh from public.t2_shartnoma where id = nullif(v_e->>'shartnoma_id', '')::bigint and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
      if not found then raise exception 'SHARTNOMA_NOT_FOUND'; end if;

      if v_tur = 'sotuv' then
        select id into v_id from public.t2_forma3 where operation_id = v_op;
        if v_id is null then
          select id into v_id from public.t2_forma3 where shartnoma_id = v_sh.id and manba = 'sotuv' and holat <> 'bekor'
             and sotuv_sana = v_sana and coalesce(raqam, '') = coalesce(v_raqam, '') and sotuv_summa = v_summa limit 1;
        end if;
        if v_id is not null then
          v_holat := 'takror';
        else
          v_holat := coalesce(nullif(v_e->>'f3_holat', ''), 'tayyor');
          if v_holat not in ('qoralama', 'tayyor', 'imzolangan') then v_holat := 'tayyor'; end if;
          insert into public.t2_forma3(kompaniya_id, loyiha_id, obyekt_id, shartnoma_id, raqam, davr_boshi, davr_oxiri, holat, izoh,
                                       operation_id, actor_id, manba, sotuv_summa, sotuv_sana, nds_foiz)
          values (p_kompaniya_id, v_sh.loyiha_id, null, v_sh.id, v_raqam, coalesce(nullif(v_e->>'davr_boshi', '')::date, v_sana), v_sana, v_holat,
                  nullif(left(coalesce(v_e->>'izoh', ''), 500), ''), v_op, p_actor_id, 'sotuv', v_summa, v_sana, coalesce(nullif(v_e->>'nds_foiz', '')::numeric, 12))
          returning id into v_id;
          v_holat := 'yangi';
        end if;
        -- F2 to'plami: faqat F3 da hali bog' yo'q bo'lsa (operator qo'lda tuzgan to'plam ustidan yozilmaydi)
        if (jsonb_typeof(v_e->'f2_akt_ids') = 'array' or jsonb_typeof(v_e->'f2_reestr_ids') = 'array')
           and not exists (select 1 from public.t2_forma3_akt where forma3_id = v_id)
           and not exists (select 1 from public.t2_f2_reestr_jami where forma3_id = v_id) then
          v_akt := null; v_reestr := null;
          if jsonb_typeof(v_e->'f2_akt_ids') = 'array' then select array_agg((x)::bigint) into v_akt from jsonb_array_elements_text(v_e->'f2_akt_ids') x; end if;
          if jsonb_typeof(v_e->'f2_reestr_ids') = 'array' then select array_agg((x)::bigint) into v_reestr from jsonb_array_elements_text(v_e->'f2_reestr_ids') x; end if;
          if v_akt is not null or v_reestr is not null then
            v_qosh := jsonb_build_object('f2_bog', public._t2_forma3_f2_bog(p_kompaniya_id, v_id, v_akt, v_reestr));
          end if;
        end if;
      else
        if v_obyekt is not null and not exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = v_sh.id and b.obyekt_id = v_obyekt and b.holat = 'faol') then
          raise exception 'OBYEKT_SHARTNOMADA_YOQ';
        end if;
        select id into v_id from public.t2_tolov where operation_id = v_op;
        if v_id is null and v_raqam is not null then
          select id into v_id from public.t2_tolov where shartnoma_id = v_sh.id and holat <> 'bekor' and sana = v_sana
             and hujjat_raqam = v_raqam and summa = v_summa and tur = v_tur limit 1;
        end if;
        if v_id is not null then
          v_holat := 'takror';
        else
          insert into public.t2_tolov(kompaniya_id, shartnoma_id, obyekt_id, sana, summa, tur, izoh, operation_id, kim, hujjat_raqam, manba)
          values (p_kompaniya_id, v_sh.id, v_obyekt, v_sana, v_summa, v_tur, nullif(left(coalesce(v_e->>'izoh', ''), 500), ''), v_op, v_kim, v_raqam, 'sverka_1c')
          returning id into v_id;
          v_holat := 'yangi';
          if jsonb_typeof(v_e->'taqsimot') = 'array' and jsonb_array_length(v_e->'taqsimot') > 0 then
            v_qosh := jsonb_build_object('taqsimot', public._t2_tolov_taqsimot_yoz(p_kompaniya_id, v_id, v_e->'taqsimot', v_kim));
          end if;
        end if;
      end if;
      if v_holat = 'yangi' then v_yangi := v_yangi + 1; else v_takror := v_takror + 1; end if;
      v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'tur', v_tur, 'holat', v_holat, 'id', v_id) || v_qosh);
    exception when others then
      v_xato := v_xato + 1;
      v_natija := v_natija || jsonb_build_array(jsonb_build_object('i', v_i, 'tur', v_tur, 'holat', 'xato', 'code', left(sqlerrm, 200)));
    end;
  end loop;

  perform public.t2_audit_yoz(p_kompaniya_id, 'sverka_import_v1', 'nakopitelniy_svod', null,
    format('qator=%s yangi=%s takror=%s xato=%s', v_i, v_yangi, v_takror, v_xato), v_kim, null);
  v_res := jsonb_build_object('ok', true, 'yangi', v_yangi, 'takror', v_takror, 'xato', v_xato, 'natija', v_natija);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'sverka_import_v1', v_res);
  return v_res;
end $$;

/* YOZISH: to'lov taqsimotini saqlash (FIFO taklifni tasdiqlash yoki qo'lda o'zgartirish). Bo'sh massiv — taqsimotni o'chiradi. */
create or replace function public.t2_tolov_taqsimot_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tolov_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  v_res := public._t2_tolov_taqsimot_yoz(p_kompaniya_id, p_tolov_id, p_qatorlar, 'actor:' || p_actor_id);
  if not (v_res->>'ok')::boolean then return v_res; end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'tolov_taqsimot_saqla_v1', 'nakopitelniy_svod', null,
    format('tolov=%s qator=%s', p_tolov_id, v_res->>'soni'), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'tolov_taqsimot_saqla_v1', v_res);
  return v_res;
end $$;

/* YOZISH: Продажа (F3 sotuv) ↔ F2 to'plami (PTO qo'lda qo'shadi/olib tashlaydi). */
create or replace function public.t2_forma3_f2_bog_v1(p_actor_id bigint, p_kompaniya_id bigint, p_forma3_id bigint, p_akt_ids bigint[], p_reestr_ids bigint[], p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  v_res := public._t2_forma3_f2_bog(p_kompaniya_id, p_forma3_id, p_akt_ids, p_reestr_ids);
  if not (v_res->>'ok')::boolean then return v_res; end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'forma3_f2_bog_v1', 'nakopitelniy_svod', null,
    format('forma3=%s akt=%s', p_forma3_id, v_res->>'soni'), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'forma3_f2_bog_v1', v_res);
  return v_res;
end $$;

/* O'QISH: sverka importi va Продажа ↔ F2 moslash uchun xom ma'lumot (kompaniya shartnomalari bo'yicha).
   f2 — tur='f2', holat <> 'bekor' aktlar (har biri ustama bilan: _t2_f2_ustamali — pryamye, katsiz, ustamali (NDS siz), podval.nds, podval.vsego);
   f3_bog — sotuv F3 ↔ akt; tolovlar — hujjat_raqam, manba, obyekt_id, taqsimot bilan; f3 — sotuv F3 (operation_id bilan). */
create or replace function public.t2_sverka_moslash_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  select jsonb_build_object('ok', true, 'generated_at', now(), 'shartnomalar', coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb))
    into v_res
    from (
      select s.id, jsonb_build_object(
        'id', s.id, 'raqam', s.raqam,
        'f2', (select coalesce(jsonb_agg(jsonb_build_object('akt_id', a.id, 'obyekt_id', a.obyekt_id, 'oy', a.oy, 'raqam', a.raqam, 'holat', a.holat,
                  'hujjat_jami', a.hujjat_jami, 'ustama', public._t2_f2_ustamali(p_kompaniya_id, s.id, array[a.id])) order by a.oy, a.id), '[]'::jsonb)
                 from public.t2_akt a
                where a.tur = 'f2' and a.holat <> 'bekor'
                  and (a.kompaniya_id = p_kompaniya_id or a.kompaniya_id is null)
                  and coalesce(a.shartnoma_id, (select b.shartnoma_id from public.t2_shartnoma_bog b where b.obyekt_id = a.obyekt_id and b.holat = 'faol'
                                                 order by b.shartnoma_id limit 1)) = s.id),
        'f3', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'raqam', f.raqam, 'sotuv_sana', f.sotuv_sana, 'sotuv_summa', f.sotuv_summa,
                  'nds_foiz', f.nds_foiz, 'holat', f.holat, 'versiya', f.versiya, 'operation_id', f.operation_id,
                  'akt_ids', (select coalesce(jsonb_agg(fa.akt_id order by fa.akt_id), '[]'::jsonb) from public.t2_forma3_akt fa where fa.forma3_id = f.id))
                  order by f.sotuv_sana, f.id), '[]'::jsonb)
                 from public.t2_forma3 f where f.shartnoma_id = s.id and f.kompaniya_id = p_kompaniya_id and f.manba = 'sotuv' and f.holat <> 'bekor'),
        'f2_reestr', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'akt_id', r.akt_id, 'raqam', r.raqam, 'lot', r.lot, 'obyekt_ish', r.obyekt_ish,
                  'davr', r.davr, 'oy', r.oy, 'qqssiz', r.qqssiz, 'qqs', r.qqs, 'qqs_bilan', r.qqs_bilan, 'holat_matn', r.holat_matn,
                  'forma3_id', r.forma3_id, 'versiya', r.versiya) order by r.oy nulls last, r.raqam), '[]'::jsonb)
                 from public.t2_f2_reestr_jami r where r.shartnoma_id = s.id and r.kompaniya_id = p_kompaniya_id and r.holat = 'faol'),
        'tolovlar', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'sana', t.sana, 'summa', t.summa, 'tur', t.tur, 'izoh', t.izoh,
                  'hujjat_raqam', t.hujjat_raqam, 'manba', t.manba, 'obyekt_id', t.obyekt_id, 'operation_id', t.operation_id, 'versiya', t.versiya,
                  'taqsimot', (select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', q.obyekt_id, 'summa', q.summa, 'manba', q.manba) order by q.obyekt_id nulls last), '[]'::jsonb)
                                 from public.t2_tolov_taqsimot q where q.tolov_id = t.id))
                  order by t.sana, t.id), '[]'::jsonb)
                 from public.t2_tolov t where t.shartnoma_id = s.id and t.holat <> 'bekor')
      ) j
      from public.t2_shartnoma s
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor'
    ) x;
  return v_res;
end $$;

revoke all on function public._t2_akt_shartnoma_f2mi(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public._t2_tolov_taqsimot_yoz(bigint, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public._t2_forma3_f2_bog(bigint, bigint, bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.t2_sverka_import_v1(bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_f2_reestr_yoz_v1(bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_tolov_taqsimot_saqla_v1(bigint, bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_forma3_f2_bog_v1(bigint, bigint, bigint, bigint[], bigint[], uuid) from public, anon, authenticated;
revoke all on function public.t2_sverka_moslash_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_sverka_import_v1(bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_f2_reestr_yoz_v1(bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_tolov_taqsimot_saqla_v1(bigint, bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_forma3_f2_bog_v1(bigint, bigint, bigint, bigint[], bigint[], uuid) to service_role;
grant execute on function public.t2_sverka_moslash_v1(bigint, bigint) to service_role;

commit;
