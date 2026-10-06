import { useState, type FC, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { getApiErrorStatus } from '@/lib/api-error'
import { clearSession } from '@/lib/auth-session'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useConfirmPasswordReset } from './hooks/useAuthMutations'

const MIN_PASSWORD_LENGTH = 8
/** Shorter values cannot be a token issued by the backend. */
const MIN_TOKEN_LENGTH = 20

const inputClassName = (hasError: boolean) =>
  `w-full pl-11 pr-11 py-3 rounded-full border ${
    hasError
      ? 'border-red-500 focus:border-red-500'
      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
  } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`

/** Redeems the token from a password reset link (`/reset-password?token=...`). */
export const ResetPasswordPage: FC = () => {
  const { t } = useLanguageStore()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const confirmReset = useConfirmPasswordReset()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isTokenRejected, setIsTokenRejected] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const isLinkInvalid = token.length < MIN_TOKEN_LENGTH || isTokenRejected

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(t('auth.passwordTooShort'))
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('auth.passwordsDoNotMatch'))
      return
    }

    try {
      await confirmReset.mutateAsync({ token, new_password: password })
      // Every session of the account was revoked, including any on this device.
      clearSession()
      setIsDone(true)
    } catch (err) {
      const status = getApiErrorStatus(err)
      if (status === 400) {
        setIsTokenRejected(true)
      } else if (status === 429) {
        setErrorMessage(t('auth.tooManyAttempts'))
      } else if (status === 422) {
        setErrorMessage(t('auth.passwordTooShort'))
      } else {
        setErrorMessage(t('auth.requestFailed'))
      }
    }
  }

  if (isDone) {
    return (
      <AuthLayout title={t('auth.resetPasswordTitle')} subtitle={t('auth.resetPasswordSubtitle')}>
        <div className="space-y-4">
          <div
            role="status"
            className="flex gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-800 dark:text-emerald-200"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p>{t('auth.resetPasswordSuccess')}</p>
          </div>
          <Link
            to="/login"
            className="flex h-12 w-full items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
          >
            {t('auth.goToSignIn')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (isLinkInvalid) {
    return (
      <AuthLayout title={t('auth.resetPasswordTitle')} subtitle={t('auth.resetPasswordSubtitle')}>
        <div className="space-y-4">
          <div
            role="alert"
            className="flex gap-3 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{t('auth.resetLinkInvalid')}</p>
          </div>
          <Link
            to="/login?view=forgot"
            className="flex h-12 w-full items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
          >
            {t('auth.requestNewLink')}
          </Link>
          <div className="text-center">
            <Link
              to="/login"
              className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.resetPasswordTitle')} subtitle={t('auth.resetPasswordSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label
            htmlFor="new-password"
            className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block"
          >
            {t('auth.newPassword')}
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              className={inputClassName(!!errorMessage)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirm-new-password"
            className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block"
          >
            {t('auth.confirmNewPassword')}
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="confirm-new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              className={inputClassName(!!errorMessage)}
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
          isLoading={confirmReset.isPending}
        >
          {t('auth.resetPasswordButton')}
        </Button>

        <div className="text-center">
          <Link
            to="/login"
            className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {t('auth.backToSignIn')}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
