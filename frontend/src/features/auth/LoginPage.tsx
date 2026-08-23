import { useState, type FC, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { api } from '@/lib/api'

export const LoginPage: FC = () => {
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

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
      }

      // Route to onboarding or dashboard
      navigate('/onboarding')
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        (language === 'km'
          ? 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ'
          : 'Invalid email or password. Please try again.')
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
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
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

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
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder={language === 'km' ? 'dara@restaurant.com ឬ 012 345 678' : 'dara@restaurant.com or 012 345 678'}
              className="w-full pl-11 pr-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
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
              onClick={() => alert(language === 'km' ? 'សូមទាក់ទងមកកាន់ Support ដើម្បីកំណត់ពាក្យសម្ងាត់ឡើងវិញ' : 'Please contact support to reset your password.')}
            >
              {language === 'km' ? 'ភ្លេចពាក្យសម្ងាត់?' : 'Forgot password?'}
            </button>
          </div>
          <div className="relative">
            <Lock className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-11 pr-11 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
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
