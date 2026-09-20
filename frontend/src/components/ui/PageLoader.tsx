import type { FC } from 'react'

export const PageLoader: FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="min-h-[50vh] flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200">
      <div className="flex items-center justify-center mb-4">
        <img
          src="/logo-mark.svg"
          alt="E-Menu Cambodia"
          className="w-14 h-14 object-contain animate-pulse"
        />
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
