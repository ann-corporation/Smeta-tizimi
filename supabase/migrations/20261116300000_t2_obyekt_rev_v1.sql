-- 20261116300000_t2_obyekt_rev_v1 — OBYEKT REVIZIYASI (ADR docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §1.1, PR1).
--
-- Maqsad: mijoz obyektni bitta paket (t2_obyekt_paket_v1) bilan oladi va keyin faqat o'zgarganini (delta, PR3) so'raydi.
-- Buning uchun har obyektda monoton `rev` va har qatorda «oxirgi marta qaysi rev da o'zgargan» belgisi kerak.
--
--   t2_obyekt_rev      — obyektga bitta qator: rev (har tranzaksiyaga +1), meta_rev (meta o'zgargan rev),
--                        toliq_rev (to'liq qayta olish majburiy bo'lgan rev), min_rev (tombstone tozalangan chegara).
--   t2_obyekt_ozgarish — (obyekt, qator) ga bitta qator, faqat upsert: qator_rev (qator maydonlari), holat_rev (fakt/F2),
--                        ochirildi (o'chirilgan yoki faol versiyadan chiqqan).
--
-- Qoidalar:
--   * Bir tranzaksiya — bitta rev (`oxirgi_txid = pg_current_xact_id()` bo'lsa qayta ishlatiladi).
--   * rev qatori tranzaksiya oxirigacha qulflanadi: obyektdagi yozuvchilar commit tartibida rev oladi (delta yo'qotmaydi).
--   * Triggerlar statement-level (transition table): t2_qator UPDATE da faqat `versiya` o'zgargan qatorlar
--     (`t2_versiya_oshir` versiyani faqat haqiqiy o'zgarishda oshiradi — no-op UPDATE rev bermaydi).
--   * Bitta statementda obyekt bo'yicha >5000 qator — `_t2_rev_toliq` (qatorlar yozilmaydi, mijoz to'liq paket oladi).
--   * Triggerni chetlab o'tadiganlar (snapshot.qaytar — replica rejim) `_t2_rev_toliq` ni o'zi chaqiradi (pastda yamoq).
--   * FK yo'q (ataylab): obyekt cascade bilan o'chirilganda t2_qator triggeri rev yoza olmay, butun DELETE yiqilardi.
--     Buning o'rniga `_t2_rev_oshir` obyekt mavjudligini tekshiradi, t2_obyekt DELETE triggeri qatorlarni tozalaydi.

create table if not exists public.t2_obyekt_rev (
  obyekt_id   bigint primary key,
  rev         bigint not null default 1,
  meta_rev    bigint not null default 1,
  toliq_rev   bigint not null default 1,
  min_rev     bigint not null default 1,
  oxirgi_txid xid8,
  yangilandi  timestamptz not null default now()
);
comment on table public.t2_obyekt_rev is
  'Obyekt reviziyasi (ADR OBYEKT_PAKET §1.1): rev — har yozuvchi tranzaksiyaga +1; meta_rev — meta (nakrutka, shartnoma, versiya, obyekt) o''zgargan rev; toliq_rev — undan oldingi delta yaroqsiz; min_rev — tombstone tozalash chegarasi. Faqat triggerlar va _t2_rev_* yozadi.';

create table if not exists public.t2_obyekt_ozgarish (
  obyekt_id bigint not null,
  qator_id  bigint not null,
  qator_rev bigint not null default 0,
  holat_rev bigint not null default 0,
  ochirildi boolean not null default false,
  vaqt      timestamptz not null default now(),
  primary key (obyekt_id, qator_id)
);
create index if not exists t2_obyekt_ozgarish_rev_idx on public.t2_obyekt_ozgarish (obyekt_id, (greatest(qator_rev, holat_rev)));
comment on table public.t2_obyekt_ozgarish is
  'Qator darajasidagi o''zgarish belgisi (faqat upsert, qator soni bilan chegaralangan): qator_rev — t2_qator maydonlari, holat_rev — fakt/F2 holati, ochirildi — o''chirilgan yoki faol versiyadan chiqqan. Delta (PR3) shu jadvaldan o''qiydi.';

alter table public.t2_obyekt_rev enable row level security;
alter table public.t2_obyekt_ozgarish enable row level security;
revoke all on public.t2_obyekt_rev from public, anon, authenticated;
revoke all on public.t2_obyekt_ozgarish from public, anon, authenticated;
grant select on public.t2_obyekt_rev to service_role;
grant select on public.t2_obyekt_ozgarish to service_role;

-- ── Yadro: tranzaksiyaga bitta rev ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_rev_oshir(p_obyekt_id bigint, p_meta boolean default false)
returns bigint
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_tx xid8 := pg_current_xact_id(); v_rev bigint;
begin
  if p_obyekt_id is null then return null; end if;
  -- Obyekt o'chirilayotgan bo'lsa (cascade) — rev yozilmaydi.
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id) then return null; end if;
  insert into public.t2_obyekt_rev as r (obyekt_id, rev, meta_rev, toliq_rev, min_rev, oxirgi_txid, yangilandi)
  values (p_obyekt_id, 1, 1, 1, 1, v_tx, now())
  on conflict (obyekt_id) do update
    set rev = case when r.oxirgi_txid = v_tx then r.rev else r.rev + 1 end,
        meta_rev = case when p_meta then (case when r.oxirgi_txid = v_tx then r.rev else r.rev + 1 end) else r.meta_rev end,
        oxirgi_txid = v_tx,
        yangilandi = now()
  returning rev into v_rev;
  return v_rev;
end $$;
comment on function public._t2_rev_oshir(bigint, boolean) is
  'Obyekt rev ini tranzaksiyaga bir marta oshiradi (shu tranzaksiyada qayta chaqirilsa o''sha rev). p_meta — meta_rev ham shu rev. Obyekt yo''q bo''lsa null.';

create or replace function public._t2_rev_toliq(p_obyekt_id bigint)
returns bigint
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_rev bigint;
begin
  v_rev := public._t2_rev_oshir(p_obyekt_id, true);
  if v_rev is not null then
    update public.t2_obyekt_rev set toliq_rev = v_rev where obyekt_id = p_obyekt_id;
  end if;
  return v_rev;
end $$;
comment on function public._t2_rev_toliq(bigint) is
  'To''liq qayta olish belgisi: rev + meta_rev oshadi, toliq_rev = rev. Undan oldingi rev dan delta so''ragan mijoz to''liq paket oladi. Triggerni chetlab o''tuvchi amallar (snapshot.qaytar, versiya faollashtirish) va >5000 qatorli statementlar chaqiradi.';

-- Qator(lar) holati o'zgardi: holat_rev (+ to'g'ridan-to'g'ri bolalari — BL_NORMA fakt va almashtirish hajmi otaga bog'liq).
create or replace function public._t2_rev_holat_yoz(p_obyekt_id bigint, p_ids bigint[], p_meta boolean default false)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_ids bigint[]; v_rev bigint;
begin
  if p_obyekt_id is null then return; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    if p_meta then perform public._t2_rev_oshir(p_obyekt_id, true); end if;
    return;
  end if;
  -- Bolalar ustma-ust to'plam (BL_NORMA rs bolalaridan kengroq) — delta ortiqcha qator yuborishi xavfsiz, kam yuborishi emas.
  select array_agg(distinct x) into v_ids from (
    select unnest(p_ids) x
    union
    select q.id from public.t2_qator q where q.ota_id = any (p_ids) and q.obyekt_id = p_obyekt_id
  ) s;
  if cardinality(v_ids) > 5000 then perform public._t2_rev_toliq(p_obyekt_id); return; end if;
  v_rev := public._t2_rev_oshir(p_obyekt_id, p_meta);
  if v_rev is null then return; end if;
  insert into public.t2_obyekt_ozgarish as z (obyekt_id, qator_id, holat_rev, vaqt)
  select p_obyekt_id, x, v_rev, now() from unnest(v_ids) x order by x
  on conflict (obyekt_id, qator_id) do update set holat_rev = excluded.holat_rev, vaqt = excluded.vaqt;
end $$;
comment on function public._t2_rev_holat_yoz(bigint, bigint[], boolean) is
  'Fakt/F2 holati o''zgargan qatorlar (va ularning bolalari) uchun holat_rev. >5000 — _t2_rev_toliq. versiya: texnik (id bo''yicha, barcha versiya qatorlari belgilanadi — paket faqat faolini oladi).';

-- Qator maydonlari o'zgardi: qator_rev + holat_rev (+ almashtirilgan asl qator va uning bolalari — holat).
create or replace function public._t2_rev_qator_yoz(p_obyekt_id bigint, p_ids bigint[], p_ochirildi boolean[], p_almashtirilgan bigint[])
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_rev bigint; v_n integer := coalesce(cardinality(p_ids), 0);
begin
  if p_obyekt_id is null or v_n = 0 then return; end if;
  if v_n > 5000 then perform public._t2_rev_toliq(p_obyekt_id); return; end if;
  v_rev := public._t2_rev_oshir(p_obyekt_id);
  if v_rev is null then return; end if;
  insert into public.t2_obyekt_ozgarish as z (obyekt_id, qator_id, qator_rev, holat_rev, ochirildi, vaqt)
  select p_obyekt_id, u.id, v_rev, v_rev, u.och, now() from unnest(p_ids, p_ochirildi) u(id, och) order by u.id
  on conflict (obyekt_id, qator_id) do update
    set qator_rev = excluded.qator_rev, holat_rev = excluded.holat_rev, ochirildi = excluded.ochirildi, vaqt = excluded.vaqt;
  -- Zamena qatori o'zgarsa — asl qatorning almashtirilgan_hajm/qoldig'i (t2_qator_holat) o'zgaradi.
  if coalesce(cardinality(p_almashtirilgan), 0) > 0 then
    perform public._t2_rev_holat_yoz(p_obyekt_id, p_almashtirilgan);
  end if;
end $$;
comment on function public._t2_rev_qator_yoz(bigint, bigint[], boolean[], bigint[]) is
  't2_qator o''zgarishini belgilaydi: qator_rev = holat_rev = rev, ochirildi (o''chirilgan yoki versiya_holat <> faol). >5000 — _t2_rev_toliq. versiya: texnik.';

-- ── Triggerlar: t2_qator ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_rev_qator_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select obyekt_id, array_agg(id order by id) ids, array_agg(versiya_holat <> 'faol' order by id) och,
                    array_agg(distinct replaces_line_id) filter (where replaces_line_id is not null) rl
               from _yangi group by obyekt_id loop
      perform public._t2_rev_qator_yoz(r.obyekt_id, r.ids, r.och, r.rl);
    end loop;
  elsif tg_op = 'UPDATE' then
    -- Faqat versiyasi o'zgarganlar (no-op UPDATE rev bermaydi).
    for r in select n.obyekt_id, array_agg(n.id order by n.id) ids, array_agg(n.versiya_holat <> 'faol' order by n.id) och,
                    array_remove(array_agg(distinct n.replaces_line_id) || array_agg(distinct o.replaces_line_id), null) rl
               from _yangi n join _eski o on o.id = n.id
              where n.versiya is distinct from o.versiya
              group by n.obyekt_id loop
      perform public._t2_rev_qator_yoz(r.obyekt_id, r.ids, r.och, r.rl);
    end loop;
    -- Qator boshqa obyektga ko'chsa — eski obyektda tombstone.
    for r in select o.obyekt_id, array_agg(o.id order by o.id) ids, array_agg(true) och
               from _yangi n join _eski o on o.id = n.id
              where n.obyekt_id is distinct from o.obyekt_id
              group by o.obyekt_id loop
      perform public._t2_rev_qator_yoz(r.obyekt_id, r.ids, r.och, null);
    end loop;
  else
    for r in select obyekt_id, array_agg(id order by id) ids, array_agg(true) och,
                    array_agg(distinct replaces_line_id) filter (where replaces_line_id is not null) rl
               from _eski group by obyekt_id loop
      perform public._t2_rev_qator_yoz(r.obyekt_id, r.ids, r.och, r.rl);
    end loop;
  end if;
  return null;
end $$;
comment on function public._t2_rev_qator_trg() is
  't2_qator statement triggeri → _t2_rev_qator_yoz (obyekt bo''yicha guruhlab). versiya: texnik (versiya_holat <> faol → ochirildi).';

drop trigger if exists t2_qator_rev_ins on public.t2_qator;
drop trigger if exists t2_qator_rev_upd on public.t2_qator;
drop trigger if exists t2_qator_rev_del on public.t2_qator;
create trigger t2_qator_rev_ins after insert on public.t2_qator
  referencing new table as _yangi for each statement execute function public._t2_rev_qator_trg();
create trigger t2_qator_rev_upd after update on public.t2_qator
  referencing old table as _eski new table as _yangi for each statement execute function public._t2_rev_qator_trg();
create trigger t2_qator_rev_del after delete on public.t2_qator
  referencing old table as _eski for each statement execute function public._t2_rev_qator_trg();

-- ── Triggerlar: t2_akt_qator (fakt/F2 qatorlari → qator holati) ───────────────────────────────────────────────
create or replace function public._t2_rev_akt_qator_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select obyekt_id, array_agg(distinct qator_id) ids from _yangi group by obyekt_id loop
      perform public._t2_rev_holat_yoz(r.obyekt_id, r.ids);
    end loop;
  elsif tg_op = 'UPDATE' then
    for r in select s.obyekt_id, array_agg(distinct s.qator_id) ids from (
               select n.obyekt_id, n.qator_id from _yangi n join _eski o on o.id = n.id where n.versiya is distinct from o.versiya
               union all
               select o.obyekt_id, o.qator_id from _yangi n join _eski o on o.id = n.id
                where n.qator_id is distinct from o.qator_id or n.obyekt_id is distinct from o.obyekt_id
             ) s group by s.obyekt_id loop
      perform public._t2_rev_holat_yoz(r.obyekt_id, r.ids);
    end loop;
  else
    for r in select obyekt_id, array_agg(distinct qator_id) ids from _eski group by obyekt_id loop
      perform public._t2_rev_holat_yoz(r.obyekt_id, r.ids);
    end loop;
  end if;
  return null;
end $$;
comment on function public._t2_rev_akt_qator_trg() is 't2_akt_qator statement triggeri → _t2_rev_holat_yoz (qator + bolalari). versiya: texnik.';

drop trigger if exists t2_akt_qator_rev_ins on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_rev_upd on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_rev_del on public.t2_akt_qator;
create trigger t2_akt_qator_rev_ins after insert on public.t2_akt_qator
  referencing new table as _yangi for each statement execute function public._t2_rev_akt_qator_trg();
create trigger t2_akt_qator_rev_upd after update on public.t2_akt_qator
  referencing old table as _eski new table as _yangi for each statement execute function public._t2_rev_akt_qator_trg();
create trigger t2_akt_qator_rev_del after delete on public.t2_akt_qator
  referencing old table as _eski for each statement execute function public._t2_rev_akt_qator_trg();

-- ── Triggerlar: t2_akt (F2 ro'yxati → meta; holat/lifecycle → aktning barcha qatorlari holati) ────────────────
-- Eslatma: transition table bilan `UPDATE OF ustun` ishlatib bo'lmaydi — filtr funksiya ichida.
create or replace function public._t2_rev_akt_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select distinct obyekt_id from _yangi loop perform public._t2_rev_oshir(r.obyekt_id, true); end loop;
  elsif tg_op = 'UPDATE' then
    -- Holat/lifecycle/tur o'zgargan aktlar: ularning qatorlari holati.
    for r in select n.obyekt_id, array_agg(distinct aq.qator_id) ids
               from _yangi n join _eski o on o.id = n.id
               join public.t2_akt_qator aq on aq.akt_id = n.id
              where n.holat is distinct from o.holat or n.lifecycle_status is distinct from o.lifecycle_status
                 or n.tur is distinct from o.tur
              group by n.obyekt_id loop
      perform public._t2_rev_holat_yoz(r.obyekt_id, r.ids, true);
    end loop;
    -- Har qanday mazmun o'zgarishi — F2 ro'yxati (paket `f2`) meta.
    for r in select distinct n.obyekt_id from _yangi n join _eski o on o.id = n.id where n.versiya is distinct from o.versiya loop
      perform public._t2_rev_oshir(r.obyekt_id, true);
    end loop;
  else
    for r in select distinct obyekt_id from _eski loop perform public._t2_rev_oshir(r.obyekt_id, true); end loop;
  end if;
  return null;
end $$;
comment on function public._t2_rev_akt_trg() is 't2_akt statement triggeri: meta_rev (F2 ro''yxati) va holat/lifecycle o''zgarsa aktning qatorlari holat_rev. versiya: texnik.';

drop trigger if exists t2_akt_rev_ins on public.t2_akt;
drop trigger if exists t2_akt_rev_upd on public.t2_akt;
drop trigger if exists t2_akt_rev_del on public.t2_akt;
create trigger t2_akt_rev_ins after insert on public.t2_akt
  referencing new table as _yangi for each statement execute function public._t2_rev_akt_trg();
create trigger t2_akt_rev_upd after update on public.t2_akt
  referencing old table as _eski new table as _yangi for each statement execute function public._t2_rev_akt_trg();
create trigger t2_akt_rev_del after delete on public.t2_akt
  referencing old table as _eski for each statement execute function public._t2_rev_akt_trg();

-- ── Meta jadvallar → meta_rev ─────────────────────────────────────────────────────────────────────────────────
-- t2_obyekt: o'zi; yangi obyekt — rev qatori; o'chirilgan — rev/ozgarish qatorlari tozalanadi.
create or replace function public._t2_rev_obyekt_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select id from _yangi loop perform public._t2_rev_oshir(r.id, true); end loop;
  elsif tg_op = 'UPDATE' then
    for r in select n.id from _yangi n join _eski o on o.id = n.id where n is distinct from o loop
      perform public._t2_rev_oshir(r.id, true);
    end loop;
  else
    delete from public.t2_obyekt_ozgarish z using _eski o where z.obyekt_id = o.id;
    delete from public.t2_obyekt_rev x using _eski o where x.obyekt_id = o.id;
  end if;
  return null;
end $$;
comment on function public._t2_rev_obyekt_trg() is 't2_obyekt statement triggeri: meta_rev; DELETE — rev/ozgarish qatorlarini tozalaydi.';

-- obyekt_id ustunli meta jadvallar (t2_shartnoma_bog, t2_smeta_versiya, t2_svod_yaxlit).
create or replace function public._t2_rev_meta_obyekt_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    for r in select distinct obyekt_id from _yangi where obyekt_id is not null loop perform public._t2_rev_oshir(r.obyekt_id, true); end loop;
  elsif tg_op = 'UPDATE' then
    for r in select distinct x from (select n.obyekt_id x from _yangi n union select o.obyekt_id from _eski o) s where x is not null loop
      perform public._t2_rev_oshir(r.x, true);
    end loop;
  else
    for r in select distinct obyekt_id from _eski where obyekt_id is not null loop perform public._t2_rev_oshir(r.obyekt_id, true); end loop;
  end if;
  return null;
end $$;
comment on function public._t2_rev_meta_obyekt_trg() is 'obyekt_id ustunli meta jadval statement triggeri → meta_rev.';

-- kompaniya darajasidagi nakrutka (t2_nakrutka, t2_nakrutka_koef) va podval (obyekt_id null bo'lsa — kompaniya).
create or replace function public._t2_rev_meta_kompaniya_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; v_k bigint[];
begin
  if tg_op = 'INSERT' then select array_agg(distinct kompaniya_id) into v_k from _yangi;
  elsif tg_op = 'UPDATE' then select array_agg(distinct x) into v_k from (select kompaniya_id x from _yangi union select kompaniya_id from _eski) s;
  else select array_agg(distinct kompaniya_id) into v_k from _eski;
  end if;
  for r in select o.id from public.t2_obyekt o where o.kompaniya_id = any (coalesce(v_k, '{}')) order by o.id loop
    perform public._t2_rev_oshir(r.id, true);
  end loop;
  return null;
end $$;
comment on function public._t2_rev_meta_kompaniya_trg() is 'Kompaniya darajasidagi nakrutka jadvallari → kompaniyaning barcha obyektlari meta_rev.';

create or replace function public._t2_rev_meta_podval_trg()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; v_ob bigint[]; v_k bigint[];
begin
  -- Transition table faqat o'z hodisasida mavjud — har tarmoq alohida so'rov.
  if tg_op = 'INSERT' then
    select array_agg(obyekt_id) filter (where obyekt_id is not null), array_agg(kompaniya_id) filter (where obyekt_id is null) into v_ob, v_k from _yangi;
  elsif tg_op = 'UPDATE' then
    select array_agg(obyekt_id) filter (where obyekt_id is not null), array_agg(kompaniya_id) filter (where obyekt_id is null) into v_ob, v_k
      from (select obyekt_id, kompaniya_id from _yangi union select obyekt_id, kompaniya_id from _eski) s;
  else
    select array_agg(obyekt_id) filter (where obyekt_id is not null), array_agg(kompaniya_id) filter (where obyekt_id is null) into v_ob, v_k from _eski;
  end if;
  for r in select distinct x from (
             select unnest(coalesce(v_ob, '{}')) x
             union all
             select o.id from public.t2_obyekt o where o.kompaniya_id = any (coalesce(v_k, '{}'))) t
           order by x
  loop
    perform public._t2_rev_oshir(r.x, true);
  end loop;
  return null;
end $$;
comment on function public._t2_rev_meta_podval_trg() is 't2_nakrutka_podval → obyekt (yoki obyekt_id null bo''lsa kompaniyaning barcha obyektlari) meta_rev.';

drop trigger if exists t2_obyekt_rev_ins on public.t2_obyekt;
drop trigger if exists t2_obyekt_rev_upd on public.t2_obyekt;
drop trigger if exists t2_obyekt_rev_del on public.t2_obyekt;
create trigger t2_obyekt_rev_ins after insert on public.t2_obyekt
  referencing new table as _yangi for each statement execute function public._t2_rev_obyekt_trg();
create trigger t2_obyekt_rev_upd after update on public.t2_obyekt
  referencing old table as _eski new table as _yangi for each statement execute function public._t2_rev_obyekt_trg();
create trigger t2_obyekt_rev_del after delete on public.t2_obyekt
  referencing old table as _eski for each statement execute function public._t2_rev_obyekt_trg();

do $$
declare t text; f text;
begin
  for t, f in select v.a, v.b from (values ('t2_shartnoma_bog', '_t2_rev_meta_obyekt_trg'), ('t2_smeta_versiya', '_t2_rev_meta_obyekt_trg'),
                     ('t2_svod_yaxlit', '_t2_rev_meta_obyekt_trg'), ('t2_nakrutka', '_t2_rev_meta_kompaniya_trg'),
                     ('t2_nakrutka_koef', '_t2_rev_meta_kompaniya_trg'), ('t2_nakrutka_podval', '_t2_rev_meta_podval_trg')) v(a, b) loop
    execute format('drop trigger if exists %I on public.%I', t || '_rev_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rev_upd', t);
    execute format('drop trigger if exists %I on public.%I', t || '_rev_del', t);
    execute format('create trigger %I after insert on public.%I referencing new table as _yangi for each statement execute function public.%I()', t || '_rev_ins', t, f);
    execute format('create trigger %I after update on public.%I referencing old table as _eski new table as _yangi for each statement execute function public.%I()', t || '_rev_upd', t, f);
    execute format('create trigger %I after delete on public.%I referencing old table as _eski for each statement execute function public.%I()', t || '_rev_del', t, f);
  end loop;
end $$;

-- ── Saqlash: tombstone tozalash (pg_cron jadvali alohida — TODO, egasi qo'llaydi) ──────────────────────────────
create or replace function public._t2_obyekt_ozgarish_tozala(p_kun integer default 30)
returns integer
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n integer;
begin
  with d as (
    delete from public.t2_obyekt_ozgarish
     where ochirildi and vaqt < now() - make_interval(days => greatest(p_kun, 1))
    returning obyekt_id, greatest(qator_rev, holat_rev) r
  ), m as (select obyekt_id, max(r) r, count(*) n from d group by obyekt_id),
  u as (update public.t2_obyekt_rev x set min_rev = greatest(x.min_rev, m.r) from m where x.obyekt_id = m.obyekt_id returning 1)
  select coalesce(sum(n), 0) into v_n from m;
  return v_n;
end $$;
comment on function public._t2_obyekt_ozgarish_tozala(integer) is
  'p_kun dan eski tombstone''larni o''chiradi va min_rev ni ko''taradi (dan_rev < min_rev → to''liq paket). Kunlik pg_cron uchun.';

-- ── Huquqlar ──────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._t2_rev_oshir(bigint, boolean) from public, anon, authenticated;
revoke all on function public._t2_rev_toliq(bigint) from public, anon, authenticated;
revoke all on function public._t2_rev_holat_yoz(bigint, bigint[], boolean) from public, anon, authenticated;
revoke all on function public._t2_rev_qator_yoz(bigint, bigint[], boolean[], bigint[]) from public, anon, authenticated;
revoke all on function public._t2_rev_qator_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_akt_qator_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_akt_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_obyekt_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_meta_obyekt_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_meta_kompaniya_trg() from public, anon, authenticated;
revoke all on function public._t2_rev_meta_podval_trg() from public, anon, authenticated;
revoke all on function public._t2_obyekt_ozgarish_tozala(integer) from public, anon, authenticated;
grant execute on function public._t2_obyekt_ozgarish_tozala(integer) to service_role;

-- ── Backfill: har obyektga bitta rev qatori (rev=meta=toliq=min=1; tarixda delta yo'q) ─────────────────────────
insert into public.t2_obyekt_rev (obyekt_id) select id from public.t2_obyekt on conflict (obyekt_id) do nothing;

-- ── Triggerni chetlab o'tuvchilar: _t2_rev_toliq (joriy prod ta'rifiga MINIMAL qo'shimcha, langar bo'yicha) ────
-- snapshot.qaytar `session_replication_role = replica` da yozadi — triggerlar ishlamaydi. Replica tiklangandan keyin,
-- natija yozilishidan oldin bitta qator. Langar topilmasa yoki bir nechta bo'lsa — migratsiya to'xtaydi (jim emas).
do $$
declare
  v_def text := pg_get_functiondef('snapshot.qaytar(bigint,text,text)'::regprocedure);
  v_langar text := E'  v_natija := jsonb_build_object(\n    ''snapshot_id''';
  v_n integer;
begin
  if v_def ~ '_t2_rev_toliq' then raise notice 'snapshot.qaytar allaqachon yamalgan'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, v_langar, ''))) / length(v_langar);
  if v_n <> 1 then raise exception 'snapshot.qaytar: langar % marta topildi (1 kutilgan) — yamoq qo''llanmadi', v_n; end if;
  execute replace(v_def, v_langar, E'  perform public._t2_rev_toliq(v_s.obyekt_id); -- obyekt paketi: replica rejimda triggerlar ishlamagan\n' || v_langar);
end $$;

-- t2_smeta_versiya_faollashtir_v1: eski qatorlarni ommaviy almashtiradi (triggerlar ishlaydi, >5000 da toliq bo'ladi) —
-- ADR §1.1 bo'yicha kafolat uchun oxirida aniq _t2_rev_toliq.
do $$
declare
  v_def text := pg_get_functiondef('public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid)'::regprocedure);
  v_langar text := E'  v_out := jsonb_build_object(''ok'', true, ''obyekt_id'', p_obyekt_id, ''almashtirilgan_versiya_id''';
  v_n integer;
begin
  if v_def ~ '_t2_rev_toliq' then raise notice 't2_smeta_versiya_faollashtir_v1 allaqachon yamalgan'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, v_langar, ''))) / length(v_langar);
  if v_n <> 1 then raise exception 't2_smeta_versiya_faollashtir_v1: langar % marta topildi (1 kutilgan) — yamoq qo''llanmadi', v_n; end if;
  execute replace(v_def, v_langar, E'  perform public._t2_rev_toliq(p_obyekt_id); -- obyekt paketi: versiya almashdi — to''liq qayta olish\n' || v_langar);
end $$;
