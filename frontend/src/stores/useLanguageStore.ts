import { create } from 'zustand'
import { Language, getTranslation } from '@/locales'

const initialLang = (localStorage.getItem('emenu_language') as Language) || 'km'
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLang
}

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: initialLang,
  setLanguage: (lang: Language) => {
    localStorage.setItem('emenu_language', lang)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
    set({ language: lang })
  },
  t: (key: string) => {
    const lang = get().language
    return getTranslation(lang, key)
  },
}))
