import { useState, useRef, useEffect, type FC } from 'react'
import { Globe, Check } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { cn } from '@/lib/utils'

export interface LanguageSwitcherProps {
  className?: string
}

export const LanguageSwitcher: FC<LanguageSwitcherProps> = ({ className }) => {
  const { language, setLanguage } = useLanguageStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={cn('relative inline-block', className)} ref={dropdownRef}>
      {/* Globe Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select Language"
        className={cn(
          'px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 text-sm font-medium',
          isOpen && 'bg-zinc-100 dark:bg-zinc-800'
        )}
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-semibold uppercase font-mono">{language}</span>
      </button>

      {/* Popover Options */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <button
            onClick={() => {
              setLanguage('km')
              setIsOpen(false)
            }}
            className={cn(
              'w-full flex items-center justify-between px-3.5 py-2.5 text-sm rounded-lg text-left transition-colors',
              language === 'km'
                ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            )}
          >
            <span>ភាសាខ្មែរ</span>
            {language === 'km' && <Check className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              setLanguage('en')
              setIsOpen(false)
            }}
            className={cn(
              'w-full flex items-center justify-between px-3.5 py-2.5 text-sm rounded-lg text-left transition-colors mt-1',
              language === 'en'
                ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            )}
          >
            <span>English</span>
            {language === 'en' && <Check className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
