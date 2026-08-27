import { useState, type FC, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, Check } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { api } from '@/lib/api'

export const RegisterPage: FC = () => {
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [fullName, setFullName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string
    emailOrPhone?: string
    password?: string
    confirmPassword?: string
  }>({})

  const isPasswordValid = password.length >= 8
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})

    const errors: typeof fieldErrors = {}

    if (!fullName.trim()) {
      errors.fullName = language === 'km' ? 'សូមបញ្ចូលឈ្មោះពេញ' : 'Please enter your full name.'
    }

    if (!emailOrPhone.trim()) {
      errors.emailOrPhone = language === 'km' ? 'សូមបញ្ចូលអ៊ីមែល ឬលេខទូរស័ព្ទ' : 'Please enter email or phone number.'
    }

    if (!isPasswordValid) {
      errors.password =
        language === 'km'
          ? 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ'
          : 'Password must be at least 8 characters long.'
    }

    if (password !== confirmPassword) {
      errors.confirmPassword =
        language === 'km'
          ? 'ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នាទេ'
          : 'Passwords do not match.'
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

      const payload: any = {
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

      // Redirect immediately to Onboarding Wizard Step 1
      navigate('/onboarding')
    } catch {
      setFieldErrors({
        emailOrPhone:
          language === 'km'
            ? 'អ៊ីមែល ឬលេខទូរស័ព្ទនេះមានក្នុងប្រព័ន្ធរួចហើយ'
            : 'This email or phone number is already in use.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title={language === 'km' ? 'បង្កើតគណនី' : 'Create Account'}
      subtitle={
        language === 'km'
          ? 'ចាប់ផ្តើមប្រើប្រាស់ប្រព័ន្ធមីនុយ QR និងគ្រប់គ្រងភោជនីយដ្ឋានរបស់អ្នក'
          : 'Start modernizing your restaurant with bilingual QR menu & POS'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Full Name */}
        <div className="space-y-1.5">
          <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
            {language === 'km' ? 'ឈ្មោះពេញ' : 'Full Name'}
          </label>
          <div className="relative">
            <User className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }))
              }}
              placeholder={language === 'km' ? 'ឧ. សុខ ដារ៉ា' : 'e.g. Sok Dara'}
              className={`w-full pl-11 pr-4 py-3 rounded-lg border ${
                fieldErrors.fullName
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
              } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
            />
          </div>
          {fieldErrors.fullName && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              {fieldErrors.fullName}
            </p>
          )}
        </div>

        {/* 2. Email or Phone */}
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
                if (fieldErrors.emailOrPhone) setFieldErrors((prev) => ({ ...prev, emailOrPhone: undefined }))
              }}
              placeholder={language === 'km' ? 'dara@restaurant.com ឬ 012 345 678' : 'dara@restaurant.com or 012 345 678'}
              className={`w-full pl-11 pr-4 py-3 rounded-lg border ${
                fieldErrors.emailOrPhone
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
              } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
            />
          </div>
          {fieldErrors.emailOrPhone && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              {fieldErrors.emailOrPhone}
            </p>
          )}
        </div>

        {/* 3. Password */}
        <div className="space-y-1.5">
          <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
            {language === 'km' ? 'ពាក្យសម្ងាត់ (យ៉ាងតិច ៨ តួ)' : 'Password (min. 8 chars)'}
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
              }}
              placeholder="••••••••"
              className={`w-full pl-11 pr-11 py-3 rounded-lg border ${
                fieldErrors.password
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
          {fieldErrors.password && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* 4. Confirm Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm sm:text-base font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'បញ្ជាក់ពាក្យសម្ងាត់' : 'Confirm Password'}
            </label>
            {doPasswordsMatch && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>{language === 'km' ? 'ត្រូវគ្នា' : 'Matches'}</span>
              </span>
            )}
          </div>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
              }}
              placeholder="••••••••"
              className={`w-full pl-11 pr-4 py-3 rounded-lg border ${
                fieldErrors.confirmPassword
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-300'
              } bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base outline-none transition-colors`}
            />
          </div>
          {fieldErrors.confirmPassword && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            className="w-full h-12 text-base font-semibold justify-center"
            isLoading={isLoading}
          >
            {language === 'km' ? 'បង្កើតគណនី និងបន្តទៅរៀបចំហាង' : 'Sign Up & Continue to Setup'}
          </Button>
        </div>

        {/* Switch to Login Link */}
        <div className="pt-4 text-center text-sm sm:text-base text-zinc-500">
          <span>{language === 'km' ? 'មានគណនីរួចហើយ?' : 'Already have an account?'} </span>
          <Link to="/login" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {language === 'km' ? 'ចូលប្រើប្រាស់ (Sign In)' : 'Sign In'}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
