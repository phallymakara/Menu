import type { FC } from 'react'

export const HeroBackgroundGlow: FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 flex items-center justify-center">
      {/* Center Emerald Soft Aura */}
      <div className="w-[500px] sm:w-[750px] h-[350px] sm:h-[450px] bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl transform -translate-y-10" />
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-teal-400/10 dark:bg-teal-400/10 rounded-full blur-2xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/10 dark:bg-emerald-600/10 rounded-full blur-3xl" />
    </div>
  )
}
