import type { FC } from 'react'
import { Utensils } from 'lucide-react'

export const PageLoader: FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="min-h-[50vh] flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200">
      <div className="flex items-center justify-center mb-4">
        {/* Inner brand box (Flat, Clean) */}
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white">
          <Utensils className="w-6 h-6" />
        </div>
      </div>
      {/* Subtle loader indicator */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" />
      </div>
      {message && (
        <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {message}
        </p>
      )}
    </div>
  )
}
