import type { FC } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/stores/useThemeStore'
import { cn } from '@/lib/utils'

export const ThemeToggle: FC<{ className?: string }> = ({ className }) => {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className={cn(
        'p-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center',
        className
      )}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-200" />
      ) : (
        <Moon className="w-4 h-4 text-zinc-600 dark:text-zinc-400 animate-in spin-in-180 duration-200" />
      )}
    </button>
  )
}
