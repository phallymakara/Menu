/**
 * Bilingual Translation System (Khmer & English)
 * Re-exports centralized translations from src/locales/
 */
import { resources, getTranslation, Language } from '@/locales'

export { resources as translations, getTranslation }
export type { Language }
export type TranslationKey = string
