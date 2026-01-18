export const translations = {
  en: {
    app: {
      title: 'Vegvisr Photos',
      badge: 'Early access'
    }
  },
  no: {
    app: {
      title: 'Vegvisr Bilder',
      badge: 'Tidlig tilgang'
    }
  },
  is: {
    app: {
      title: 'Vegvisr Myndir',
      badge: 'Snemma aðgangur'
    }
  },
  nl: {
    app: {
      title: 'Vegvisr Foto\'s',
      badge: 'Vroege toegang'
    }
  }
} as const;

export type TranslationKey = keyof typeof translations.en;
