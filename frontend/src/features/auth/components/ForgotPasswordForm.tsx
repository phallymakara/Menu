import { useState, type FC, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getApiErrorStatus } from '@/lib/api-error'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useRequestPasswordReset } from '../hooks/useAuthMutations'

export interface ForgotPasswordFormProps {
  /** Prefills the field, for example with what was typed on the sign-in form. */
  initialIdentifier?: string
  onBack: () => void
}

/** Requests a password reset link for an email address or phone number. */
export const ForgotPasswordForm: FC<ForgotPasswordFormProps> = ({
  initialIdentifier = '',
  onBack,
}) => {
  const { t } = useLanguageStore()
  const requestReset = useRequestPasswordReset()

  const [identifier, setIdentifier] = useState(initialIdentifier)
  const [isSent, setIsSent] = useState(false)
  const [debugToken, setDebugToken] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const value = identifier.trim()
    if (!value) {
      setErrorMessage(t('auth.enterEmailOrPhone'))
      return
    }

    try {
      const result = await requestReset.mutateAsync({
        identifier: value.includes('@') ? value.toLowerCase() : value,
      })
      // The backend only returns this token in development, before email or SMS exists.
      setDebugToken(import.meta.env.DEV ? (result.debug_reset_token ?? null) : null)
      setIsSent(true)
    } catch (err) {
      setErrorMessage(
        getApiErrorStatus(err) === 429 ? t('auth.tooManyAttempts') : t('auth.requestFailed')
      )
    }
  }

  if (isSent) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="flex gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p>{t('auth.resetRequestSent')}</p>
        </div>
        {debugToken && (
          <Link
            to={`/reset-password?token=${encodeURIComponent(debugToken)}`}
            className="block text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t('auth.devResetLink')}
          </Link>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 text-base font-semibold justify-center"
          onClick={onBack}
        >
          {t('auth.backToSignIn')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="reset-identifier"
          className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block"
        >
          {t('auth.emailOrPhone')}
        </label>
        <div className="relative">
          <Mail className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="reset-identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
            placeholder={t('auth.emailOrPhonePlaceholder')}
            className={`w-full pl-11 pr-4 py-3 rounded-full border ${
              errorMessage
                ? 'border-red-500 focus:border-red-500'
                : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
            } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
          />
        </div>
        {errorMessage && (
          <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">
            {errorMessage}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full h-12 text-base font-semibold justify-center"
        isLoading={requestReset.isPending}
      >
        {t('auth.sendResetLink')}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {t('auth.backToSignIn')}
        </button>
      </div>
    </form>
  )
}
