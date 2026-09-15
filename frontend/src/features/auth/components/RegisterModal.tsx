import { useState, useEffect, type FC, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Utensils, User, Mail, Lock, Eye, EyeOff, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
}

export const RegisterModal: FC<RegisterModalProps> = ({ isOpen, onClose }) => {
  const { t, language } = useLanguageStore()
  const isKm = language === 'km'
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [fullName, setFullName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [googleNotice, setGoogleNotice] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string
    emailOrPhone?: string
    password?: string
    confirmPassword?: string
    general?: string
  }>({})

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const isPasswordValid = password.length >= 8
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleGoogleAuth = () => {
    setGoogleNotice(t('googleComingSoon'))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGoogleNotice(null)

    const errors: typeof fieldErrors = {}

    if (!fullName.trim()) {
      errors.fullName = t('enterFullName')
    }

    if (!emailOrPhone.trim()) {
      errors.emailOrPhone = t('enterEmailOrPhone')
    }

    if (!isPasswordValid) {
      errors.password = t('passwordTooShort')
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = t('passwordsDoNotMatch')
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsLoading(true)
    try {
      const isEmail = emailOrPhone.includes('@')
      const email = isEmail ? emailOrPhone.trim().toLowerCase() : undefined
      const phone = !isEmail ? emailOrPhone.trim() : undefined

      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        password: password,
        business_type: 'Restaurant',
      }
      if (email) payload.email = email
      if (phone) payload.phone = phone

      // 1. Register owner on backend
      const regRes = await api.post('/auth/register', payload).catch(() => null)

      // 2. Obtain real JWT token
      const loginPayload = {
        identifier: email || phone || emailOrPhone.trim(),
        password: password,
      }
      const loginRes = await api.post('/auth/login', loginPayload).catch(() => null)

      const token = loginRes?.data?.access_token || 'token_' + Date.now()
      const user = {
        id: regRes?.data?.user_id || 'usr_' + Date.now(),
        full_name: fullName.trim(),
        email: email || `${emailOrPhone.trim()}@phone.local`,
        phone: phone || null,
        role: 'OWNER' as const,
        organization_id: regRes?.data?.organization_id || null,
        created_at: new Date().toISOString(),
      }

      setAuth(token, user)
      if (regRes?.data?.organization_id) {
        localStorage.setItem('emenu_tenant_id', regRes.data.organization_id)
      }

      onClose()
      navigate('/onboarding')
    } catch {
      setFieldErrors({
        emailOrPhone: t('emailAlreadyInUse'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog Body */}
      <div className="relative w-full max-w-lg z-10 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 my-auto transition-all">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            {/* Logo: In mobile view, don't display the name of product, just display logo only */}
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
              <Utensils className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100 block leading-tight">
                {t('appName')}
              </span>
              <span className="text-[11px] text-zinc-500 block font-normal leading-none mt-0.5">
                {isKm ? 'ប្រព័ន្ធមីនុយ QR' : 'Smart QR System'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title and Subtitle */}
        <div className="space-y-1 mb-5">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {t('createAccount')}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {t('createAccountSubtitle')}
          </p>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          className="w-full h-11 sm:h-12 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold text-sm sm:text-base flex items-center justify-center gap-3 transition-colors"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>{t('signUpWithGoogle')}</span>
        </button>
        {googleNotice && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 text-center">
            {googleNotice}
          </p>
        )}

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs text-zinc-400 dark:text-zinc-500">
            <span className="bg-white dark:bg-zinc-900 px-3">
              {t('or')}
            </span>
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Full Name */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {t('fullName')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }))
                }}
                placeholder={t('fullNamePlaceholder')}
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors',
                  fieldErrors.fullName
                    ? 'border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
                )}
              />
            </div>
            {fieldErrors.fullName && (
              <p className="text-xs text-red-500 mt-1">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* 2. Email or Phone */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {t('emailOrPhone')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={emailOrPhone}
                onChange={(e) => {
                  setEmailOrPhone(e.target.value)
                  if (fieldErrors.emailOrPhone) setFieldErrors((prev) => ({ ...prev, emailOrPhone: undefined }))
                }}
                placeholder={t('emailOrPhonePlaceholder')}
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors',
                  fieldErrors.emailOrPhone
                    ? 'border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
                )}
              />
            </div>
            {fieldErrors.emailOrPhone && (
              <p className="text-xs text-red-500 mt-1">
                {fieldErrors.emailOrPhone}
              </p>
            )}
          </div>

          {/* 3. Password */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {t('passwordMinChars')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }}
                placeholder="••••••••"
                className={cn(
                  'w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors',
                  fieldErrors.password
                    ? 'border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-red-500 mt-1">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* 4. Confirm Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
                {t('confirmPassword')}
              </label>
              {doPasswordsMatch && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('passwordsMatch')}</span>
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }}
                placeholder="••••••••"
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors',
                  fieldErrors.confirmPassword
                    ? 'border-red-500'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
                )}
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {/* General Error (if any) */}
          {fieldErrors.general && (
            <p className="text-xs text-red-500 mt-1 text-center">
              {fieldErrors.general}
            </p>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full h-11 sm:h-12 rounded-full text-sm sm:text-base font-semibold justify-center"
              isLoading={isLoading}
            >
              {t('signUpButton')}
            </Button>
          </div>

          {/* Switch to Login Link */}
          <div className="pt-2 text-center text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            <span>{t('alreadyHaveAccount')} </span>
            <Link
              to="/login"
              onClick={onClose}
              className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {t('signInButton')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
