import { useState, useEffect, type FC, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAuthModalStore } from '@/stores/useAuthModalStore'
import { api } from '@/lib/api'
import { useOnboardingStore } from '@/features/onboarding/stores/useOnboardingStore'

export interface RegisterModalProps {
  isOpen: boolean
  onClose: () => void
}

export const RegisterModal: FC<RegisterModalProps> = ({ isOpen, onClose }) => {
  const { t, language } = useLanguageStore()
  const isKm = language === 'km'
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { switchToLogin } = useAuthModalStore()

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

  const validate = () => {
    const errors: typeof fieldErrors = {}

    if (!fullName.trim()) {
      errors.fullName = isKm ? 'សូមបញ្ចូលឈ្មោះពេញ' : 'Please enter your full name'
    }

    if (!emailOrPhone.trim()) {
      errors.emailOrPhone = isKm
        ? 'សូមបញ្ចូលអ៊ីមែល ឬលេខទូរស័ព្ទ'
        : 'Please enter email or phone number'
    } else {
      const isEmail = emailOrPhone.includes('@')
      if (isEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(emailOrPhone.trim())) {
          errors.emailOrPhone = isKm ? 'ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវទេ' : 'Invalid email format'
        }
      } else {
        const phoneDigits = emailOrPhone.replace(/\D/g, '')
        if (phoneDigits.length < 8 || phoneDigits.length > 12) {
          errors.emailOrPhone = isKm
            ? 'លេខទូរស័ព្ទត្រូវមានយ៉ាងតិច ៨ ខ្ទង់'
            : 'Phone number must be between 8 and 12 digits'
        }
      }
    }

    if (!password) {
      errors.password = isKm ? 'សូមបញ្ចូលពាក្យសម្ងាត់' : 'Please enter password'
    } else if (password.length < 8) {
      errors.password = isKm
        ? 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ'
        : 'Password must be at least 8 characters'
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = isKm
        ? 'ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ'
        : 'Passwords do not match'
    }

    return errors
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setGoogleNotice(null)

    const errors = validate()
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
      let regRes: any = null
      try {
        regRes = await api.post('/auth/register', payload)
      } catch (err: any) {
        if (err.response?.status === 409) {
          setFieldErrors({ emailOrPhone: t('emailAlreadyInUse') })
          return
        }
        throw err
      }

      // 2. Obtain real JWT token
      let token = regRes?.data?.access_token
      if (!token) {
        const loginPayload = {
          identifier: email || phone || emailOrPhone.trim(),
          password: password,
        }
        const loginRes = await api.post('/auth/login', loginPayload)
        token = loginRes?.data?.access_token
      }

      if (!token) {
        throw new Error('No access token returned after registration')
      }

      const user = {
        id: regRes?.data?.user_id || 'usr_owner',
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
        localStorage.setItem('emenu_organization_id', regRes.data.organization_id)
      }
      if (regRes?.data?.business_id) {
        localStorage.setItem('emenu_business_id', regRes.data.business_id)
      }
      if (regRes?.data?.branch_id) {
        localStorage.setItem('emenu_branch_id', regRes.data.branch_id)
      }

      useOnboardingStore.getState().resetOnboarding()
      onClose()
      navigate('/onboarding')
    } catch (err: any) {
      setFieldErrors({
        general:
          err?.response?.data?.detail ||
          (isKm
            ? 'មានបញ្ហាក្នុងការបង្កើតគណនី សូមព្យាយាមម្តងទៀត'
            : 'Failed to create account. Please check your details and try again.'),
      })
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
            {t('createAccount')}
          </h2>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Full Name */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
              {t('fullName')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }))
                }}
                placeholder={t('fullNamePlaceholder')}
                className={`w-full pl-11 pr-5 py-2.5 sm:py-3 rounded-full border ${
                  fieldErrors.fullName
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 focus:border-zinc-900'
                } bg-white text-zinc-900 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors`}
              />
            </div>
            {fieldErrors.fullName && (
              <p className="text-xs text-red-500 mt-1 pl-3">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* 2. Email or Phone */}
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
              {t('emailOrPhone')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={emailOrPhone}
                onChange={(e) => {
                  setEmailOrPhone(e.target.value)
                  if (fieldErrors.emailOrPhone) setFieldErrors((prev) => ({ ...prev, emailOrPhone: undefined }))
                }}
                placeholder={t('emailOrPhonePlaceholder')}
                className={`w-full pl-11 pr-5 py-2.5 sm:py-3 rounded-full border ${
                  fieldErrors.emailOrPhone
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 focus:border-zinc-900'
                } bg-white text-zinc-900 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors`}
              />
            </div>
            {fieldErrors.emailOrPhone && (
              <p className="text-xs text-red-500 mt-1 pl-3">
                {fieldErrors.emailOrPhone}
              </p>
            )}
          </div>

          {/* 3. Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
                {t('passwordMinChars')}
              </label>
              {isPasswordValid && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{isKm ? 'ត្រឹមត្រូវ' : 'Valid'}</span>
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }}
                placeholder={isKm ? 'បញ្ចូលពាក្យសម្ងាត់' : 'Enter password'}
                className={`w-full pl-11 pr-11 py-2.5 sm:py-3 rounded-full border ${
                  fieldErrors.password
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
            {fieldErrors.password && (
              <p className="text-xs text-red-500 mt-1 pl-3">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* 4. Confirm Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-zinc-800 block">
                {t('confirmPassword')}
              </label>
              {doPasswordsMatch && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('passwordsMatch')}</span>
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }}
                placeholder={isKm ? 'បញ្ជាក់ពាក្យសម្ងាត់ឡើងវិញ' : 'Confirm your password'}
                className={`w-full pl-11 pr-5 py-2.5 sm:py-3 rounded-full border ${
                  fieldErrors.confirmPassword
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-zinc-300 focus:border-zinc-900'
                } bg-white text-zinc-900 placeholder:text-zinc-400 text-sm sm:text-base outline-none transition-colors`}
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1 pl-3">
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
              className="w-full h-11 sm:h-12 rounded-full text-sm sm:text-base font-semibold justify-center shadow-md shadow-emerald-900/10"
              isLoading={isLoading}
            >
              {t('signUpButton')}
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
            <span>{t('signUpWithGoogle')}</span>
          </button>
          {googleNotice && (
            <p className="text-xs text-zinc-500 mt-1 text-center">
              {googleNotice}
            </p>
          )}

          {/* Switch to Login Link */}
          <div className="pt-2 text-center text-xs sm:text-sm text-zinc-500">
            <span>{t('alreadyHaveAccount')} </span>
            <button
              type="button"
              onClick={switchToLogin}
              className="font-semibold text-emerald-600 hover:underline cursor-pointer"
            >
              {t('signInButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
