import { createContext } from 'react';

export type Language = 'en' | 'no' | 'is' | 'nl';

export type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

export const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => undefined
});
