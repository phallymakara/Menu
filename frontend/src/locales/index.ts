import { en } from './en'
import { km } from './km'

export type Language = 'en' | 'km'

export const resources = {
  en,
  km,
}

/**
 * Type-safe dot-path helper or flat-string resolver
 */
export function getTranslation(lang: Language, key: string): string {
  const dict = resources[lang] || resources.en
  const enDict = resources.en

  // 1. Direct path lookup e.g. "auth.fullName" or "common.save"
  if (key.includes('.')) {
    const parts = key.split('.')
    let current: any = dict
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part]
      } else {
        current = undefined
        break
      }
    }
    if (typeof current === 'string') return current

    // Fallback to EN
    let enCurrent: any = enDict
    for (const part of parts) {
      if (enCurrent && typeof enCurrent === 'object' && part in enCurrent) {
        enCurrent = enCurrent[part]
      } else {
        enCurrent = undefined
        break
      }
    }
    if (typeof enCurrent === 'string') return enCurrent
  }

  // 2. Search across common namespaces if given flat key e.g. "appName", "pricing", "heroHeadline"
  const namespaces = ['common', 'landing', 'auth', 'onboarding', 'guest', 'pos', 'kds'] as const
  for (const ns of namespaces) {
    if ((dict as any)[ns] && (dict as any)[ns][key]) {
      return (dict as any)[ns][key]
    }
    if ((enDict as any)[ns] && (enDict as any)[ns][key]) {
      return (enDict as any)[ns][key]
    }
  }

  return key
}

export { en, km }
