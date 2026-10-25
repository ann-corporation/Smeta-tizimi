import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion, motionValue, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Globe2, Link2, MessageCircle, Phone, X } from 'lucide-react';
import { useTil } from '../../i18n/til';
import { TilTanlagich } from '../../i18n/TilTanlagich';
import './public-entry.css';
import { SupportConversation } from './SupportConversation';
import type { PublicSupportPort } from './support-port';
import { chainSteps, productDomains, productRoles, scopeCopy, type EntryCopy } from './product-scope';
import { productScreens } from './product-screens';
import { ProductShowcase, type ProductScreenshot } from './ProductShowcase';
import { StudioPreview } from './StudioPreview';
import { introCopy as ic } from './intro/copy';
import { HeroSheet } from './intro/HeroSheet';
import { ChainFlow } from './intro/ChainFlow';
import { F2Anatomy } from './intro/F2Anatomy';
import { RoleScreen } from './intro/RoleScreens';
import { TokenGrid, TrustBoard } from './intro/TrustBoard';
import { GirihField } from './intro/GirihField';
import { Magnetic } from './intro/Magnetic';
import { useScrollStory } from './intro/hooks';
import { Reveal } from './intro/Reveal';
export type { ProductScreenshot } from './ProductShowcase';

export const OWNER_PHONE = '+998505012566';
const PHONE_LABEL = '+998 50 501 25 66';
/** Product name is a brand, not translatable copy. */
export const BRAND = 'TIZIM_02', BRAND_WORD = 'TIZIM', BRAND_NUMBER = '02';
type Props = { children: ReactNode; onChooseAuth: (mode: 'login' | 'signup') => void; screenshots?: readonly ProductScreenshot[]; supportPort?: PublicSupportPort };
type Local = (s: EntryCopy) => string;

const copy = {
  uz: {
    capabilities: 'Imkoniyatlar', workflow: 'Qanday ishlaydi', contact: 'Aloqa', login: 'Tizimga kirish', signup: "Ro'yxatdan o'tish",
    start: 'Hisob ochish', tour: 'Imkoniyatlarni ko‘rish',
    faq: 'Boshlashdan oldin',
    q1: 'Mavjud Excel smetam bilan ishlay olamanmi?', a1: 'Smeta importi mavjud. Fayl tuzilishi tahlil qilinadi; noaniq varaq yoki bog‘lanish operator tomonidan tekshirilishi kerak.',
    q2: 'Login va ro‘yxatdan o‘tish qayerda?', a2: 'Shu sahifadagi kirish blokidan foydalaning. Yangi hisob uchun ro‘yxatdan o‘tishni tanlang va email tasdiqlash bosqichini bajaring.',
    q3: 'Savolim bo‘lsa, kimga murojaat qilaman?', a3: 'Admin bilan telefon orqali bog‘laning. Qaysi sahifada va qaysi amalni bajarayotganda muammo yuz berganini ayting.',
    contactTitle: 'Ishni boshlashda yordam kerakmi?', contactText: 'Tizimdan foydalanish bo‘yicha savol va muammolar yuzasidan admin bilan bog‘laning.', call: 'Qo‘ng‘iroq qilish',
    help: 'Qo‘llanma', helpTitle: 'Tizimdan foydalanish qo‘llanmasi', helpNote: 'Bu yerda ko‘p so‘raladigan savollarga javob topasiz. Ushbu oynadan xabar yuborilmaydi; admin bilan telefon orqali bog‘lanishingiz mumkin.', close: 'Qo‘llanmani yopish',
    footer: 'TIZIM_02 · Qurilish uchun raqamli ish joyi', skip: 'Kirish formasiga o‘tish',
  },
  ru: {
    capabilities: 'Возможности', workflow: 'Как это работает', contact: 'Контакты', login: 'Войти', signup: 'Регистрация',
    start: 'Создать аккаунт', tour: 'Посмотреть возможности',
    faq: 'Перед началом',
    q1: 'Можно работать с моей сметой Excel?', a1: 'Импорт сметы доступен. Структура файла анализируется; неоднозначные листы и связи необходимо проверить оператору.',
    q2: 'Где вход и регистрация?', a2: 'Используйте форму на этой странице. Для нового аккаунта выберите регистрацию и подтвердите email.',
    q3: 'К кому обратиться с вопросом?', a3: 'Свяжитесь с администратором по телефону. Укажите страницу и действия перед ошибкой — это поможет разобраться.',
    contactTitle: 'Нужна помощь с началом?', contactText: 'Вопросы и проблемы по системе можно обсудить с администратором.', call: 'Позвонить',
    help: 'Руководство', helpTitle: 'Руководство по системе', helpNote: 'Здесь собраны ответы на частые вопросы. Сообщения из этого окна не отправляются; с администратором можно связаться по телефону.', close: 'Закрыть руководство',
    footer: 'TIZIM_02 · Цифровое рабочее место для строительства', skip: 'Перейти к форме входа',
  },
  en: {
    capabilities: 'Features', workflow: 'How it works', contact: 'Contact', login: 'Sign in', signup: 'Sign up',
    start: 'Create an account', tour: 'Explore features',
    faq: 'Before you begin',
    q1: 'Can I use my existing Excel estimate?', a1: 'Estimate import is available. The file structure is analysed; ambiguous sheets and links require operator review.',
    q2: 'Where do I sign in or sign up?', a2: 'Use the form on this page. Select registration for a new account and complete email verification.',
    q3: 'Who can help with a question?', a3: 'Call the admin. Include the page name and what you did before the error to help identify the problem.',
    contactTitle: 'Need help getting started?', contactText: 'Contact the admin with questions and issues about the system.', call: 'Call the admin',
    help: 'Guide', helpTitle: 'Getting started guide', helpNote: 'Find answers to common questions here. This panel does not send messages; you can contact the admin by phone.', close: 'Close guide',
    footer: 'TIZIM_02 · A digital workspace for construction', skip: 'Skip to sign-in form',
  },
};


function SectionHead({ eyebrow, title, note, id }: { eyebrow: string; title: string; note?: string; id?: string }) {
  return <Reveal className="entry-section-head">
    <p className="entry-eyebrow"><i className="entry-rhomb" aria-hidden="true" />{eyebrow}</p>
    <h2 id={id}>{title}</h2>
    {note && <p className="entry-section-description">{note}</p>}
  </Reveal>;
}

export function PublicEntry({ children, onChooseAuth, screenshots = [], supportPort }: Props) {
  const { til, t } = useTil();
  const c = copy[til === 'ru' ? 'ru' : til === 'en' ? 'en' : 'uz'];
  const [help, setHelp] = useState(false);
  const helpToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (help) document.getElementById('entry-help-close')?.focus(); }, [help]);
  const closeHelp = () => { setHelp(false); helpToggle.current?.focus(); };
  const [role, setRole] = useState('pto');
  const text = (s: string) => til === 'uz-Cyrl' ? t(s) : s;
  const local: Local = (s) => text(s[til === 'ru' ? 1 : til === 'en' ? 2 : 0]);
  const currentRole = productRoles.find(r => r.id === role) ?? productRoles[1];
  const realScreens = screenshots.length ? screenshots : productScreens.map(s => ({ src: s.src, alt: local(s.title), caption: local(s.caption) }));
  const screenCopy = {
    note: local(['Haqiqiy ekrandan lavhalar', 'Фрагменты реальных экранов', 'Actual product captures']),
    title: local(['O‘qib tasavvur qilmang. Ko‘rib tanlang.', 'Не представляйте. Посмотрите.', 'See the workspace for yourself.']),
    expand: local(['Lavhani katta ko‘rish', 'Увеличить экран', 'View full-size capture']),
    close: local(['Yopish uchun shu sarlavhani qayta bosing.', 'Нажмите заголовок повторно, чтобы свернуть.', 'Select the heading again to collapse.']),
  };
  const choose = (mode: 'login' | 'signup') => {
    onChooseAuth(mode);
    document.getElementById('entry-account')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    document.getElementById('entry-account')?.focus({ preventScroll: true });
  };
  const faq = [[c.q1, c.a1], [c.q2, c.a2], [c.q3, c.a3]];
  const startButton = (extra = '') => <Magnetic><button type="button" className={`entry-primary ${extra}`} onClick={() => choose('signup')}>{text(c.start)}<ArrowRight size={18} aria-hidden="true" /></button></Magnetic>;

  return <MotionConfig reducedMotion="user"><div className="public-entry">
    <a className="entry-skip" href="#entry-account">{text(c.skip)}</a>
    <EntryHeader c={c} text={text} local={local} onLogin={() => choose('login')} start={startButton('entry-primary--sm')} />
    <main>
      <Hero local={local}>
        <p className="entry-eyebrow"><i className="entry-rhomb" aria-hidden="true" />{local(scopeCopy.eyebrow)}</p>
        <h1>{local(scopeCopy.title)}<br /><span>{local(ic.accent)}</span></h1>
        <p className="entry-description">{local(ic.lead)}</p>
        <div className="entry-actions">{startButton()}<a className="entry-secondary" href="#entry-chain">{text(c.tour)}<ChevronDown size={17} aria-hidden="true" /></a></div>
        <div className="entry-hero-facts">
          <span className="entry-free"><i className="entry-rhomb" aria-hidden="true" />{local(ic.free)}</span>
          <a className="entry-hero-contact" href={`tel:${OWNER_PHONE}`}><Phone size={15} aria-hidden="true" />{PHONE_LABEL}<span>{text(c.contact)}</span></a>
        </div>
      </Hero>

      <section id="entry-chain" className="entry-band entry-band--chain" aria-labelledby="entry-chain-title">
        <ChainFlow local={local} />
      </section>

      <section id="entry-f2" className="entry-section" aria-labelledby="entry-f2-title">
        <SectionHead id="entry-f2-title" eyebrow={local(ic.f2Eyebrow)} title={local(ic.f2Title)} note={local(ic.f2Note)} />
        <F2Anatomy local={local} />
      </section>

      <section id="entry-ai" className="entry-section entry-ai-section">
        <SectionHead eyebrow={local(ic.aiEyebrow)} title={local(ic.aiTitle)} note={local(ic.aiNote)} />
        <Reveal delay={0.1}><StudioPreview local={local} /></Reveal>
      </section>

      <section id="entry-roles" className="entry-section entry-roles">
        <SectionHead eyebrow={local(ic.rolesEyebrow)} title={local(scopeCopy.roles)} note={local(scopeCopy.rolesNote)} />
        <div className="entry-role-options" role="group" aria-label={local(scopeCopy.roles)}>{productRoles.map(r =>
          <button key={r.id} type="button" aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
            {role === r.id && <motion.span layoutId="entry-role-pill" className="entry-role-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className="entry-role-label">{local(r.title)}</span>
          </button>)}</div>
        <article className="entry-role-detail" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={currentRole.id} className="entry-role-text" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.25 }}>
              <h3>{local(currentRole.title)}</h3><p>{local(currentRole.task)}</p>
              <div className="entry-role-output"><span>{local(scopeCopy.result)}</span><p>{local(currentRole.result)}</p></div>
              <button type="button" className="entry-link-button" onClick={() => choose('signup')}>{text(c.start)}<ArrowUpRight size={16} aria-hidden="true" /></button>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={currentRole.id} className="entry-role-visual" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
              <RoleScreen id={currentRole.id} local={local} />
            </motion.div>
          </AnimatePresence>
        </article>
        <ul className="entry-role-facts"><li><Link2 size={16} aria-hidden="true" />{local(ic.workspaces)}</li><li><Globe2 size={16} aria-hidden="true" />{local(ic.languages)}</li></ul>
      </section>

      <section id="entry-trust" className="entry-band entry-band--trust">
        <div className="entry-band-inner">
          <SectionHead eyebrow={local(ic.trustEyebrow)} title={local(ic.trustTitle)} note={local(scopeCopy.trust)} />
          <TrustBoard local={local} />
        </div>
      </section>

      <ProductShowcase screens={realScreens} title={screenCopy.title} note={screenCopy.note} expand={screenCopy.expand} close={screenCopy.close} start={text(c.start)} onStart={() => choose('signup')} />

      <section id="entry-features" className="entry-section entry-modules">
        <SectionHead eyebrow={local(scopeCopy.foundation)} title={local(scopeCopy.modules)} note={local(scopeCopy.modulesNote)} />
        <nav className="entry-domain-index" aria-label={local(scopeCopy.map)}>{productDomains.map((d, i) => <a key={d.id} href={`#entry-domain-${d.id}`}><span>0{i + 1}</span>{local(d.title)}</a>)}</nav>
        <div className="entry-domain-grid">{productDomains.map((d, i) => <Reveal as="article" id={`entry-domain-${d.id}`} key={d.id} delay={(i % 4) * 0.06}>
          <div className="entry-domain-number"><i className="entry-rhomb" aria-hidden="true" />0{i + 1}</div><h3>{local(d.title)}</h3><p>{local(d.detail)}</p><div className="entry-domain-items">{local(d.items)}</div>{d.note && <small>{local(scopeCopy.developing)}: {local(d.note)}</small>}</Reveal>)}</div>
        <div className="entry-workflow">
          <h3>{local(scopeCopy.workflow)}</h3><p>{local(scopeCopy.workflowNote)}</p>
          <ol className="entry-chain">{chainSteps.map((step, i) => <li key={step[0]}><span>0{i + 1}</span><b>{local(step)}</b></li>)}</ol>
        </div>
      </section>

      <section id="entry-pricing" className="entry-section entry-pricing">
        <div>
          <SectionHead eyebrow={local(ic.priceEyebrow)} title={local(ic.priceTitle)} note={local(ic.priceNote)} />
          <ul className="entry-price-points">{[ic.priceP1, ic.priceP2, ic.priceP3].map(p => <li key={p[0]}><Check size={16} aria-hidden="true" />{local(p)}</li>)}</ul>
          <div className="entry-actions">{startButton()}<button type="button" className="entry-link-button" onClick={() => choose('login')}>{text(c.login)}<ArrowUpRight size={16} aria-hidden="true" /></button></div>
        </div>
        <TokenGrid local={local} />
      </section>

      <section className="entry-section entry-faq"><h2>{text(c.faq)}</h2>{faq.map(([q, a]) => <details key={q}><summary>{text(q)}<ChevronDown size={18} aria-hidden="true" /></summary><p>{text(a)}</p></details>)}</section>
      <section className="entry-section entry-join"><div><p className="entry-eyebrow"><i className="entry-rhomb" aria-hidden="true" />{BRAND}</p><h2>{local(scopeCopy.account)}</h2><p className="entry-section-description">{local(scopeCopy.accountNote)}</p><p className="entry-free"><i className="entry-rhomb" aria-hidden="true" />{local(ic.free)}</p><a className="entry-hero-contact" href={`tel:${OWNER_PHONE}`}><Phone size={16} aria-hidden="true" />{PHONE_LABEL}</a></div><section id="entry-account" tabIndex={-1} aria-label={text(c.login)} className="entry-account">{children}</section></section>
      <section id="entry-contact" className="entry-contact"><div><p className="entry-eyebrow">{text(c.contact)}</p><h2>{text(c.contactTitle)}</h2><p>{text(c.contactText)}</p></div><a href={`tel:${OWNER_PHONE}`} className="entry-phone"><span>{text(c.call)}</span><strong>{PHONE_LABEL}</strong><ArrowUpRight size={22} aria-hidden="true" /></a></section>
    </main>
    <footer className="entry-footer"><span>{text(c.footer)}</span><a href="#entry-account" onClick={() => choose('signup')}>{text(c.signup)}<ArrowUpRight size={14} aria-hidden="true" /></a></footer>
    <MobileCta label={local(ic.stickyStart)} onStart={() => choose('signup')} />
    <button ref={helpToggle} className="entry-help-toggle" aria-expanded={help} aria-controls="entry-help" onClick={() => help ? closeHelp() : setHelp(true)}><MessageCircle size={18} aria-hidden="true" />{text(c.help)}</button>
    {help && <aside id="entry-help" className="entry-help" aria-label={text(c.helpTitle)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeHelp(); } }}><header><h2>{text(c.helpTitle)}</h2><button id="entry-help-close" aria-label={text(c.close)} onClick={closeHelp}><X size={20} /></button></header>{supportPort ? <SupportConversation port={supportPort} /> : <><p>{text(c.helpNote)}</p>{faq.map(([q, a]) => <details key={q}><summary>{text(q)}</summary><p>{text(a)}</p></details>)}</>}<a className="entry-primary" href={`tel:${OWNER_PHONE}`}><Phone size={17} aria-hidden="true" />{PHONE_LABEL}</a></aside>}
  </div></MotionConfig>;
}

function EntryHeader({ c, text, local, onLogin, start }: { c: typeof copy.uz; text: (s: string) => string; local: Local; onLogin: () => void; start: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <header className="entry-header">
    <a className="entry-brand" href="#entry-top"><span className="entry-brand-mark" aria-hidden="true"><i /></span>{BRAND_WORD}<span className="entry-brand-number">{BRAND_NUMBER}</span></a>
    <nav aria-label={text(c.capabilities)}><a href="#entry-chain">{text(c.workflow)}</a><a href="#entry-roles">{local(scopeCopy.audiences)}</a><a href="#entry-features">{text(c.capabilities)}</a><a href="#entry-pricing">{local(ic.priceEyebrow)}</a><a href="#entry-contact">{text(c.contact)}</a></nav>
    <div className="entry-header-actions"><TilTanlagich ixcham /><button type="button" className="entry-small-button" onClick={onLogin}>{text(c.login)}</button><span className="entry-header-start">{start}</span></div>
    <motion.i className="entry-progress" style={{ scaleX: bar }} aria-hidden="true" />
  </header>;
}

function Hero({ local, children }: { local: Local; children: ReactNode }) {
  const story = useScrollStory();
  return story ? <HeroScroll local={local}>{children}</HeroScroll> : <HeroLayout local={local} progress={null}>{children}</HeroLayout>;
}

function HeroScroll({ local, children }: { local: Local; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  return <div ref={ref} className="entry-hero-scroll"><HeroLayout local={local} progress={scrollYProgress}>{children}</HeroLayout></div>;
}

function HeroLayout({ local, progress, children }: { local: Local; progress: MotionValue<number> | null; children: ReactNode }) {
  const hint = useTransform(progress ?? zero, [0, 0.08], [1, 0]);
  return <section id="entry-top" className={`entry-hero ${progress ? 'is-sticky' : ''}`}>
    <GirihField />
    <motion.div className="entry-pitch" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>
    <motion.div className="entry-hero-visual" initial={{ opacity: 0, y: 30, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}>
      <HeroSheet local={local} progress={progress} />
    </motion.div>
    {progress && <motion.p className="entry-scroll-hint" style={{ opacity: hint }} aria-hidden="true"><ChevronDown size={16} />{local(ic.scrollHint)}</motion.p>}
  </section>;
}
const zero = motionValue(0);

function MobileCta({ label, onStart }: { label: string; onStart: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => {
      const acc = document.getElementById('entry-account')?.getBoundingClientRect();
      const accVisible = !!acc && acc.top < window.innerHeight && acc.bottom > 0;
      setShow(window.scrollY > window.innerHeight * 0.9 && !accVisible);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <AnimatePresence>{show && <motion.div className="entry-mobile-cta" initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
    <button type="button" className="entry-primary" onClick={onStart}>{label}<ArrowRight size={17} aria-hidden="true" /></button>
  </motion.div>}</AnimatePresence>;
}
