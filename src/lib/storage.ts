import type { Language } from './LanguageContext';

const STORAGE_KEY = 'vegvisr_language';

export const getStoredLanguage = (): Language => {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'no' || stored === 'is' || stored === 'nl' || stored === 'en') {
    return stored;
  }
  return 'en';
};

export const setStoredLanguage = (language: Language) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, language);
};
