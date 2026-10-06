import { useState, type FC, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { ForgotPasswordForm } from './components/ForgotPasswordForm'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useLogin } from './hooks/useAuthMutations'
import { getLoginErrorMessage } from './utils/authErrors'

export const LoginPage: FC = () => {
  const { language, t } = useLanguageStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const login = useLogin()

  // The URL holds the view, so `/login?view=forgot` (linked from the sign-in modal and
  // the reset page) opens the reset form and the browser back button returns to sign-in.
  const isForgotView = searchParams.get('view') === 'forgot'
  const showForgotView = () => setSearchParams({ view: 'forgot' })
  const showLoginView = () => setSearchParams({})

  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    try {
      const isEmail = emailOrPhone.includes('@')
      await login.mutateAsync({
        identifier: isEmail ? emailOrPhone.trim().toLowerCase() : emailOrPhone.trim(),
        password,
      })
      navigate('/admin')
    } catch (err) {
      setErrorMessage(getLoginErrorMessage(err, language === 'km'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isForgotView) {
    return (
      <AuthLayout title={t('auth.forgotPasswordTitle')} subtitle={t('auth.forgotPasswordSubtitle')}>
        <ForgotPasswordForm initialIdentifier={emailOrPhone} onBack={showLoginView} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={language === 'km' ? 'ចូលប្រើប្រាស់គណនី' : 'Welcome Back'}
      subtitle={
        language === 'km'
          ? 'បញ្ចូលព័ត៌មានគណនីរបស់អ្នកដើម្បីគ្រប់គ្រងភោជនីយដ្ឋាន'
          : 'Sign in to manage your menu, POS, kitchen, and analytics'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Email or Phone */}
        <div className="space-y-1.5">
          <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
            {language === 'km' ? 'អ៊ីមែល ឬ លេខទូរស័ព្ទ' : 'Email or Phone Number'}
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={emailOrPhone}
              onChange={(e) => {
                setEmailOrPhone(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              placeholder={t('emailOrPhonePlaceholder')}
              className={`w-full pl-11 pr-4 py-3 rounded-full border ${
                errorMessage
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
              } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
            />
          </div>
        </div>

        {/* 2. Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ពាក្យសម្ងាត់' : 'Password'}
            </label>
            <button
              type="button"
              className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
              onClick={showForgotView}
            >
              {t('auth.forgotPassword')}
            </button>
          </div>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              placeholder="••••••••"
              className={`w-full pl-11 pr-11 py-3 rounded-full border ${
                errorMessage
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
              } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errorMessage && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              {errorMessage}
            </p>
          )}
        </div>

        {/* 3. Remember Me */}
        <div className="flex items-center gap-2.5 pt-1">
          <input
            type="checkbox"
            id="remember"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="remember" className="text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">
            {language === 'km' ? 'ចងចាំគណនីនេះ' : 'Remember me on this device'}
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            className="w-full h-12 text-base font-semibold justify-center"
            isLoading={isLoading}
          >
            {language === 'km' ? 'ចូលប្រើប្រាស់' : 'Sign In'}
          </Button>
        </div>

        {/* Switch to Register Link */}
        <div className="pt-4 text-center text-sm sm:text-base text-zinc-500">
          <span>{language === 'km' ? 'មិនទាន់មានគណនី?' : "Don't have an account?"} </span>
          <Link to="/register" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {language === 'km' ? 'បង្កើតគណនីថ្មី (Sign Up)' : 'Sign Up Free'}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
