import { create } from 'zustand'
import { Language, translations, TranslationKey } from '@/lib/i18n'

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: (localStorage.getItem('emenu_language') as Language) || 'km',
  setLanguage: (lang: Language) => {
    localStorage.setItem('emenu_language', lang)
    document.documentElement.lang = lang
    set({ language: lang })
  },
  t: (key: TranslationKey) => {
    const lang = get().language
    return translations[lang][key] || translations.en[key] || String(key)
  },
}))
