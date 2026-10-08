import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Building2, Check, ChevronDown, FileSpreadsheet, Layers3, MessageCircle, Phone, X } from 'lucide-react';
import { useTil } from '../../i18n/til';
import './public-entry.css';
import { SupportConversation } from './SupportConversation';
import type { PublicSupportPort } from './support-port';

export const OWNER_PHONE = '+998505012566';
export type ProductScreenshot = { src: string; alt: string; caption: string };
type Props = { children: ReactNode; onChooseAuth: (mode: 'login' | 'signup') => void; screenshots?: readonly ProductScreenshot[]; supportPort?: PublicSupportPort };

const copy = {
  uz: {
    capabilities: 'Imkoniyatlar', workflow: 'Qanday ishlaydi', contact: 'Aloqa', login: 'Tizimga kirish', signup: "Ro'yxatdan o'tish",
    eyebrow: 'QURILISH HUJJATLARI · BITTA ISH JOYI', title: 'Hisoblar tartibli.', titleAccent: 'Ishingiz yengilroq.',
    description: 'Smeta, bajarilgan ishlar va F2 hujjatlarini bir joyda boshqaring. Qaysi ish bajarilganini, nimasi qolganini va summa qayerdan kelganini ko‘ring.',
    start: 'Hisob ochish', tour: 'Imkoniyatlarni ko‘rish', path: 'SMETA → FAKT → F2',
    pathTitle: 'Hujjatlar orasida emas, ish ustida ishlang.', pathText: 'Har bosqichdagi ma’lumot keyingi bosqich uchun asos. Tasdiqlangan F2 tarixi alohida saqlanadi.',
    estimate: 'Smetani tartibga soling', estimateText: 'Excel manbasini yuklang. Bo‘lim, ish va resurslarni daraxt shaklida ko‘ring.',
    progress: 'Bajarilgan ishni kiriting', progressText: 'Fakt hajmini qayd eting. Qoldiq va F2ga olish mumkin bo‘lgan hajmni kuzating.',
    certificate: 'F2ni tayyorlang', certificateText: 'Manba qatorlarini bog‘lang, farqlarni ko‘rib chiqing va hujjatni tekshiring.',
    featuresTitle: 'PTO uchun kundalik ishlar — bir joyda.', featuresText: 'Ma’lumotning manbasi, davri va tasdiqlash holatini yo‘qotmasdan ishlash uchun.',
    f2: 'F2 import va tekshiruv', f2Text: 'Smeta bilan yonma-yon solishtirish, bog‘lanishni ko‘rish va mos kelmagan qatorni aniqlash.',
    history: 'Davrlar va hujjat tarixi', historyText: 'Tasdiqlangan ishlarni davr bo‘yicha ko‘rish. Oldingi, joriy va jami qiymatlarni ajratish.',
    export: 'Excel hujjatlari', exportText: 'LRV, F2 va Nakopitelniy hujjatlarini yuklab olish va manba bilan solishtirish.',
    screenshots: 'Tizimning haqiqiy ko‘rinishlari', faq: 'Boshlashdan oldin',
    q1: 'Mavjud Excel smetam bilan ishlay olamanmi?', a1: 'Smeta importi mavjud. Fayl tuzilishi tahlil qilinadi; noaniq varaq yoki bog‘lanish operator tomonidan tekshirilishi kerak.',
    q2: 'Login va ro‘yxatdan o‘tish qayerda?', a2: 'Shu sahifadagi kirish blokidan foydalaning. Yangi hisob uchun ro‘yxatdan o‘tishni tanlang va email tasdiqlash bosqichini bajaring.',
    q3: 'Savol yoki muammom bo‘lsa kimga murojaat qilaman?', a3: 'Anvar bilan telefon orqali bog‘laning. Xato bo‘lgan sahifa nomi va nima qilganingizni aytsangiz, muammoni aniqlash osonlashadi.',
    contactTitle: 'Boshlashga yordam kerakmi?', contactText: 'Tizim bo‘yicha savollar va muammolar uchun Anvar bilan bog‘laning.', call: 'Qo‘ng‘iroq qilish',
    help: 'Yordam', helpTitle: 'Boshlash bo‘yicha yordam', helpNote: 'Bu sahifa yo‘riqnomasi. Xabar yuborilmaydi; jonli operator yoki AI chat hali ulanmagan.', close: 'Yordamni yopish',
    footer: 'TIZIM_02 · Qurilish uchun raqamli ish joyi', skip: 'Kirish formasiga o‘tish',
  },
  ru: {
    capabilities: 'Возможности', workflow: 'Как это работает', contact: 'Контакты', login: 'Войти', signup: 'Регистрация',
    eyebrow: 'СТРОИТЕЛЬНЫЕ ДОКУМЕНТЫ · ЕДИНОЕ РАБОЧЕЕ МЕСТО', title: 'Порядок в расчётах.', titleAccent: 'Меньше ручной работы.',
    description: 'Управляйте сметой, выполненными работами и Ф2 в одном месте. Проверяйте объёмы, остатки и источник каждой суммы.',
    start: 'Создать аккаунт', tour: 'Посмотреть возможности', path: 'СМЕТА → ФАКТ → Ф2',
    pathTitle: 'Работайте над задачей, а не между файлами.', pathText: 'Данные каждого этапа служат основой следующего. История утверждённых Ф2 сохраняется отдельно.',
    estimate: 'Организуйте смету', estimateText: 'Загрузите Excel. Просматривайте разделы, работы и ресурсы в дереве.',
    progress: 'Внесите выполненные объёмы', progressText: 'Укажите факт. Контролируйте остаток и доступный для Ф2 объём.',
    certificate: 'Подготовьте Ф2', certificateText: 'Свяжите строки источника, проверьте расхождения и документ.',
    featuresTitle: 'Ежедневные задачи ПТО — в одном месте.', featuresText: 'Работайте с источником, периодом и статусом утверждения данных.',
    f2: 'Импорт и проверка Ф2', f2Text: 'Сопоставление со сметой в двух панелях, проверка связей и несовпавших строк.',
    history: 'Периоды и история документов', historyText: 'Утверждённые работы по периодам. Предыдущие, текущие и накопительные значения отдельно.',
    export: 'Документы Excel', exportText: 'Скачивайте ЛРВ, Ф2 и накопительную ведомость и сверяйте их с источником.',
    screenshots: 'Реальные экраны системы', faq: 'Перед началом',
    q1: 'Можно работать с моей сметой Excel?', a1: 'Импорт сметы доступен. Структура файла анализируется; неоднозначные листы и связи необходимо проверить оператору.',
    q2: 'Где вход и регистрация?', a2: 'Используйте форму на этой странице. Для нового аккаунта выберите регистрацию и подтвердите email.',
    q3: 'К кому обратиться с вопросом?', a3: 'Свяжитесь с Анваром по телефону. Укажите страницу и действия перед ошибкой — это поможет разобраться.',
    contactTitle: 'Нужна помощь с началом?', contactText: 'Вопросы и проблемы по системе можно обсудить с Анваром.', call: 'Позвонить',
    help: 'Помощь', helpTitle: 'Помощь с началом', helpNote: 'Это справочник страницы. Сообщения не отправляются; чат с оператором или AI пока не подключён.', close: 'Закрыть помощь',
    footer: 'TIZIM_02 · Цифровое рабочее место для строительства', skip: 'Перейти к форме входа',
  },
  en: {
    capabilities: 'Features', workflow: 'How it works', contact: 'Contact', login: 'Sign in', signup: 'Sign up',
    eyebrow: 'CONSTRUCTION DOCUMENTS · ONE WORKSPACE', title: 'Clear calculations.', titleAccent: 'Less manual work.',
    description: 'Manage estimates, completed work and F2 documents in one place. See quantities, remaining scope and the source of each amount.',
    start: 'Create an account', tour: 'Explore features', path: 'ESTIMATE → PROGRESS → F2',
    pathTitle: 'Work on the task, not between files.', pathText: 'Each stage provides evidence for the next. Approved F2 history is retained separately.',
    estimate: 'Organise your estimate', estimateText: 'Upload Excel. Browse sections, work and resources in a tree.',
    progress: 'Record completed work', progressText: 'Enter actual quantities. Check remaining and eligible F2 quantities.',
    certificate: 'Prepare F2', certificateText: 'Link source lines, review differences and check the document.',
    featuresTitle: 'Your daily document work, in one place.', featuresText: 'Keep the source, period and approval status in view.',
    f2: 'F2 import and review', f2Text: 'Compare with the estimate side by side, inspect links and identify unmatched lines.',
    history: 'Periods and document history', historyText: 'Review approved work by period, with separate previous, current and cumulative values.',
    export: 'Excel documents', exportText: 'Download LRV, F2 and cumulative statements and reconcile them with the source.',
    screenshots: 'Actual product screens', faq: 'Before you begin',
    q1: 'Can I use my existing Excel estimate?', a1: 'Estimate import is available. The file structure is analysed; ambiguous sheets and links require operator review.',
    q2: 'Where do I sign in or sign up?', a2: 'Use the form on this page. Select registration for a new account and complete email verification.',
    q3: 'Who can help with a question?', a3: 'Call Anvar. Include the page name and what you did before the error to help identify the problem.',
    contactTitle: 'Need help getting started?', contactText: 'Contact Anvar with questions and issues about the system.', call: 'Call Anvar',
    help: 'Help', helpTitle: 'Getting started', helpNote: 'This is a page guide. No messages are sent; live operator and AI chat are not connected yet.', close: 'Close help',
    footer: 'TIZIM_02 · A digital workspace for construction', skip: 'Skip to sign-in form',
  },
};

export function PublicEntry({ children, onChooseAuth, screenshots = [], supportPort }: Props) {
  const { til, t } = useTil();
  const c = copy[til === 'ru' ? 'ru' : til === 'en' ? 'en' : 'uz'];
  const [help, setHelp] = useState(false);
  const text = (s: string) => til === 'uz-Cyrl' ? t(s) : s;
  const choose = (mode: 'login' | 'signup') => {
    onChooseAuth(mode);
    document.getElementById('entry-account')?.scrollIntoView?.({ block: 'start' });
    document.getElementById('entry-account')?.focus({ preventScroll: true });
  };
  const faq = [[c.q1, c.a1], [c.q2, c.a2], [c.q3, c.a3]];
  return <div className="public-entry">
    <a className="entry-skip" href="#entry-account">{text(c.skip)}</a>
    <header className="entry-header"><a className="entry-brand" href="#entry-top"><span><Building2 size={21} /></span>TIZIM<span className="entry-brand-number">02</span></a>
      <nav aria-label={text(c.capabilities)}><a href="#entry-features">{text(c.capabilities)}</a><a href="#entry-workflow">{text(c.workflow)}</a><a href="#entry-contact">{text(c.contact)}</a></nav>
      <button className="entry-small-button" onClick={() => choose('login')}>{text(c.login)}<ArrowUpRight size={15} /></button>
    </header>
    <main>
      <section id="entry-top" className="entry-hero">
        <div className="entry-pitch"><p className="entry-eyebrow"><span />{text(c.eyebrow)}</p>
          <h1>{text(c.title)}<br /><span>{text(c.titleAccent)}</span></h1><p className="entry-description">{text(c.description)}</p>
          <div className="entry-actions"><button className="entry-primary" onClick={() => choose('signup')}>{text(c.start)}<ArrowUpRight size={18} /></button><a className="entry-secondary" href="#entry-features">{text(c.tour)}<ChevronDown size={17} /></a></div>
          <div className="entry-flow" aria-label={text(c.path)}>{[c.estimate, c.progress, c.certificate].map((v, i) => <span key={v}><i>0{i + 1}</i>{text(v)}{i < 2 && <b aria-hidden="true">→</b>}</span>)}</div>
          <a className="entry-hero-contact" href={`tel:${OWNER_PHONE}`}><Phone size={15} />+998 50 501 25 66<span>{text(c.contact)}</span></a>
        </div>
        <section id="entry-account" tabIndex={-1} aria-label={text(c.login)} className="entry-account">{children}</section>
      </section>
      <section id="entry-workflow" className="entry-section"><p className="entry-eyebrow">{text(c.path)}</p><h2>{text(c.pathTitle)}</h2><p className="entry-section-description">{text(c.pathText)}</p>
        <div className="entry-step-grid">{[[c.estimate, c.estimateText], [c.progress, c.progressText], [c.certificate, c.certificateText]].map(([title, detail], i) => <article key={title}><span className="entry-step-number">0{i + 1}</span><h3>{text(title)}</h3><p>{text(detail)}</p></article>)}</div>
      </section>
      <section id="entry-features" className="entry-section"><h2>{text(c.featuresTitle)}</h2><p className="entry-section-description">{text(c.featuresText)}</p>
        <div className="entry-feature-grid">{[[c.f2, c.f2Text, FileSpreadsheet], [c.history, c.historyText, Layers3], [c.export, c.exportText, Check]].map(([title, detail, Icon]) => { const Symbol = Icon as typeof Check; return <article key={String(title)}><Symbol size={25} /><h3>{text(String(title))}</h3><p>{text(String(detail))}</p></article>; })}</div>
      </section>
      {screenshots.length > 0 && <section className="entry-section"><h2>{text(c.screenshots)}</h2><div className="entry-screenshots">{screenshots.map(s => <figure key={s.src}><img src={s.src} alt={s.alt} loading="lazy" decoding="async" /><figcaption>{s.caption}</figcaption></figure>)}</div></section>}
      <section className="entry-section entry-faq"><h2>{text(c.faq)}</h2>{faq.map(([q, a]) => <details key={q}><summary>{text(q)}<ChevronDown size={18} /></summary><p>{text(a)}</p></details>)}</section>
      <section id="entry-contact" className="entry-contact"><div><p className="entry-eyebrow">{text(c.contact)}</p><h2>{text(c.contactTitle)}</h2><p>{text(c.contactText)}</p></div><a href={`tel:${OWNER_PHONE}`} className="entry-phone"><span>{text(c.call)}</span><strong>+998 50 501 25 66</strong><ArrowUpRight size={22} /></a></section>
    </main>
    <footer className="entry-footer"><span>{text(c.footer)}</span><a href="#entry-account" onClick={() => choose('signup')}>{text(c.signup)}<ArrowUpRight size={14} /></a></footer>
    <button className="entry-help-toggle" aria-expanded={help} aria-controls="entry-help" onClick={() => setHelp(!help)}><MessageCircle size={20} />{text(c.help)}</button>
    {help && <aside id="entry-help" className="entry-help" aria-label={text(c.helpTitle)}><header><h2>{text(c.helpTitle)}</h2><button aria-label={text(c.close)} onClick={() => setHelp(false)}><X size={20} /></button></header>{supportPort ? <SupportConversation port={supportPort} /> : <><p>{text(c.helpNote)}</p>{faq.map(([q, a]) => <details key={q}><summary>{text(q)}</summary><p>{text(a)}</p></details>)}</>}<a className="entry-primary" href={`tel:${OWNER_PHONE}`}><Phone size={17} />+998 50 501 25 66</a></aside>}
  </div>;
}
