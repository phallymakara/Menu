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
        'p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center',
        className
      )}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-amber-400 animate-in spin-in-180 duration-200" />
      ) : (
        <Moon className="w-5 h-5 text-zinc-700 dark:text-zinc-300 animate-in spin-in-180 duration-200" />
      )}
    </button>
  )
}
