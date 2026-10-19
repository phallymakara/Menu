import type { FC } from 'react'
import { EmenuLoader } from './EmenuLoader'

export const PageLoader: FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="min-h-[50vh] flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200 bg-transparent">
      <EmenuLoader size="md" message={message} showBrandText />
    </div>
  )
}
