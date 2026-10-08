import { FC } from 'react'
import { useRouteError, useNavigate } from 'react-router-dom'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const RouteErrorBoundary: FC = () => {
  const error = useRouteError()
  const navigate = useNavigate()
  const { language } = useLanguageStore()

  // Log technical error internally for developers without leaking internals to the UI
  if (process.env.NODE_ENV !== 'production') {
    console.error('Route caught error:', error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 p-6 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>

        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          {language === 'km' ? 'មានបញ្ហាមួយចំនួនបានកើតឡើង' : 'Something went wrong'}
        </h2>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
          {language === 'km'
            ? 'ទំព័រនេះមិនអាចដំណើរការបានទេ។ សូមព្យាយាមផ្ទុកទំព័រឡើងវិញ ឬត្រឡប់ទៅទំព័រដើម។'
            : 'Unable to display this screen right now. Please try reloading or head back to the main page.'}
        </p>

        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'ផ្ទុកឡើងវិញ' : 'Reload Page'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{language === 'km' ? 'ទំព័រដើម' : 'Home'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
