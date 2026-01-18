import { translations } from './i18n';
import type { Language } from './LanguageContext';

const resolvePath = (obj: Record<string, any>, path: string) => {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
};

export const useTranslation = (language: Language) => {
  return (key: string) => {
    const value = resolvePath(translations[language], key) ?? resolvePath(translations.en, key);
    return typeof value === 'string' ? value : key;
  };
};
