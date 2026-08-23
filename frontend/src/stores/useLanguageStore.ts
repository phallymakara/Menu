import { create } from 'zustand'
import { Language, getTranslation } from '@/locales'

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: (localStorage.getItem('emenu_language') as Language) || 'km',
  setLanguage: (lang: Language) => {
    localStorage.setItem('emenu_language', lang)
    document.documentElement.lang = lang
    set({ language: lang })
  },
  t: (key: string) => {
    const lang = get().language
    return getTranslation(lang, key)
  },
}))
