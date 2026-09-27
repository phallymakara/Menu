import { useState, useEffect, type FC, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

export interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

export const LoginModal: FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { t, language } = useLanguageStore()
  const isKm = language === 'km'
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { switchToRegister } = useAuthModalStore()
  const queryClient = useQueryClient()

  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [googleNotice, setGoogleNotice] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setErrorMessage(null)
      setGoogleNotice(null)
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleGoogleAuth = () => {
    setGoogleNotice(t('googleComingSoon'))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLoading(true)

    try {
      const isEmail = emailOrPhone.includes('@')
      const payload = {
        identifier: isEmail ? emailOrPhone.trim().toLowerCase() : emailOrPhone.trim(),
        password: password,
      }

      const response = await api.post('/auth/login', payload)

      if (response?.data?.access_token) {
        const token = response.data.access_token
        // Fetch current user details
        const meRes = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)

        const user = meRes?.data ? {
          id: meRes.data.user_id,
          full_name: meRes.data.full_name,
          email: meRes.data.email,
          role: 'OWNER' as const,
          created_at: new Date().toISOString(),
        } : {
          id: 'usr_owner',
          full_name: emailOrPhone.split('@')[0],
          email: isEmail ? emailOrPhone : 'owner@restaurant.com',
          role: 'OWNER' as const,
          created_at: new Date().toISOString(),
        }

        setAuth(token, user)
        if (meRes?.data?.memberships?.[0]?.organization_id) {
          const orgId = meRes.data.memberships[0].organization_id
          localStorage.setItem('emenu_tenant_id', orgId)
          localStorage.setItem('emenu_organization_id', orgId)
        }
        localStorage.setItem('emenu_onboarding_completed', 'true')
        queryClient.invalidateQueries()
      }

      onClose()
      navigate('/admin')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      let msg: string
      if (typeof detail === 'string') {
        if (detail.includes('Invalid email, phone number, or password')) {
          msg =
            isKm
              ? 'អ៊ីមែល លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ'
              : 'Invalid email, phone number, or password.'
        } else if (detail.includes('not active')) {
          msg = isKm ? 'គណនីនេះត្រូវបានផ្អាកដំណើរការ' : 'This account is not active.'
        } else {
          msg = detail
        }
      } else if (Array.isArray(detail) && detail.length > 0) {
        msg = detail[0]?.msg || (isKm ? 'ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ' : 'Invalid input format.')
      } else {
        msg =
          isKm
            ? 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ'
            : 'Invalid email or password. Please try again.'
      }
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm modal-backdrop-animate"
        onClick={onClose}
      />

      {/* Dialog Body */}
      <div className="relative w-full max-w-lg z-10 bg-white rounded-[28px] sm:rounded-[32px] border border-zinc-200 p-6 sm:p-8 my-auto shadow-2xl modal-dialog-animate">
        {/* Close Button Top-Right */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute top-5 right-5 sm:top-6 sm:right-6 rounded-full p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Centered Logo and Title */}
        <div className="flex flex-col items-center justify-center text-center pt-2 mb-6">
          <img
            src="/logo-mark.svg"
            alt="E-Menu Cambodia"
            className="w-14 h-14 object-contain mb-3"
          />
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
            {t('welcomeBack')}
          </h2>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Email or Phone */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
              {t('emailOrPhone')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                value={emailOrPhone}
                onChange={(e) => {
                  setEmailOrPhone(e.target.value)
                  if (errorMessage) setErrorMessage(null)
                }}
                placeholder={t('emailOrPhonePlaceholder')}
                className={`w-full pl-11 pr-5 py-2.5 sm:py-3 rounded-full border ${
                  errorMessage
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 focus:border-zinc-900'
                } bg-white text-zinc-900 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors`}
              />
            </div>
          </div>

          {/* 2. Password */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
              {t('password')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (errorMessage) setErrorMessage(null)
                }}
                placeholder={isKm ? 'បញ្ចូលពាក្យសម្ងាត់' : 'Enter password'}
                className={`w-full pl-11 pr-11 py-2.5 sm:py-3 rounded-full border ${
                  errorMessage
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 focus:border-zinc-900'
                } bg-white text-zinc-900 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMessage && (
              <p className="text-xs text-red-500 mt-1 pl-3 font-medium">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-0.5 text-xs sm:text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>{t('rememberMe')}</span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full h-11 sm:h-12 rounded-full text-sm sm:text-base font-semibold justify-center shadow-md shadow-emerald-900/10"
              isLoading={isLoading}
            >
              {t('signInButton')}
            </Button>
          </div>

          {/* Divider with Or */}
          <div className="relative my-2 text-center text-xs text-zinc-400">
            <span>{t('or')}</span>
          </div>

          {/* Google OAuth Button at Bottom */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            className="w-full h-11 sm:h-12 rounded-full border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold text-sm sm:text-base flex items-center justify-center gap-3 transition-colors"
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
            <span>{isKm ? 'ចូលជាមួយ Google' : 'Sign in with Google'}</span>
          </button>
          {googleNotice && (
            <p className="text-xs text-zinc-500 mt-1 text-center">
              {googleNotice}
            </p>
          )}

          {/* Switch to Register Link */}
          <div className="pt-2 text-center text-xs sm:text-sm text-zinc-500">
            <span>{t('dontHaveAccount')} </span>
            <button
              type="button"
              onClick={switchToRegister}
              className="font-semibold text-emerald-600 hover:underline cursor-pointer"
            >
              {t('createAccount')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
