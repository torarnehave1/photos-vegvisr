import { translations } from './i18n';
import type { Language } from './LanguageContext';

const resolvePath = (obj: Record<string, unknown>, path: string) => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object' || !(key in acc)) return null;
    return (acc as Record<string, unknown>)[key];
  }, obj);
};

export const useTranslation = (language: Language) => {
  return (key: string) => {
    const value = resolvePath(translations[language], key) ?? resolvePath(translations.en, key);
    return typeof value === 'string' ? value : key;
  };
};
