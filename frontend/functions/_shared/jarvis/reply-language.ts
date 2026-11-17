import { lotinKirill } from '../../../src/i18n/lotin-kirill';

export type JarvisLanguage = 'uz' | 'uz-Cyrl' | 'ru';
export type JarvisText = (uzbek: string, russian: string, values?: Record<string, string | number>) => string;

export function jarvisLanguage(question: string, preference?: unknown): JarvisLanguage {
  if (preference === 'uz' || preference === 'ru' || preference === 'uz-Cyrl') return preference;
  const q = question.toLowerCase();
  if (/(?:^|[^\p{L}])(?:шу|бу|билан|учун|борми|сўм|омбор|нима)(?!\p{L})/u.test(q)) return 'uz-Cyrl';
  if (/(?:^|[^\p{L}])(?:bilan|uchun|qancha|shuni|qanday|qaysi|korsat)(?!\p{L})/u.test(q)) return 'uz';
  if (/(?:^|[^\p{L}])(?:сколько|каков\p{L}*|какой|найди|покажи\p{L}*|подготовь|что|сравни\p{L}*|итого|статус|ндс|остатки)(?!\p{L})/u.test(q)) return 'ru';
  if (/[ўқғҳ]/u.test(q)) return 'uz-Cyrl';
  if (/[а-яё]/u.test(q) && !/[a-z]{2,}/u.test(q)) return 'ru';
  return 'uz';
}

export function jarvisText(language: JarvisLanguage = 'uz'): JarvisText {
  return (uzbek, russian, values) => {
    const template = language === 'ru' ? russian : language === 'uz-Cyrl'
      ? lotinKirill(uzbek).replace(/\bQQS\b/g, 'ҚҚС').replace(/([Оо])бект/g, '$1бъект').replace(/([Рр])еэстр/g, '$1еестр') : uzbek;
    // Translate the template before inserting source data, codes, and deep links.
    return values ? template.replace(/\{([a-z]+)\}/g, (token, name: string) => Object.hasOwn(values, name) ? String(values[name]) : token) : template;
  };
}
