import { useState, type FC, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, User, CheckCircle2, AlertCircle, ArrowRight, LogIn } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useCurrentUser } from '@/features/admin/hooks/useStaffQueries'
import { useAcceptStaffInvitation, useAcceptStaffInvitationExisting } from './hooks/useAuthMutations'
import { ApiError } from '@/lib/api-error'

export const StaffInvitationPage: FC = () => {
  const { token } = useParams<{ token: string }>()
  const { language } = useLanguageStore()
  const navigate = useNavigate()

  const { data: currentUser } = useCurrentUser()
  const acceptNewMutation = useAcceptStaffInvitation()
  const acceptExistingMutation = useAcceptStaffInvitationExisting()

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isKm = language === 'km'

  const handleAcceptExisting = async () => {
    if (!token) {
      setErrorMessage(isKm ? 'តំណអញ្ជើញមិនត្រឹមត្រូវទេ' : 'Invitation token is missing or invalid')
      return
    }
    setErrorMessage(null)
    try {
      await acceptExistingMutation.mutateAsync({ token })
      setSuccessMessage(
        isKm
          ? 'អ្នកបានចូលរួមដោយជោគជ័យ! កំពុងបញ្ជូនទៅផ្ទាំងគ្រប់គ្រង...'
          : 'Successfully joined organization! Redirecting to workspace...'
      )
      setTimeout(() => {
        navigate('/admin')
      }, 1500)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(typeof err.detail === 'string' ? err.detail : err.message)
      } else {
        setErrorMessage(
          isKm
            ? 'មិនអាចយល់ព្រមទទួលការអញ្ជើញបានទេ។ សូមព្យាយាមម្តងទៀត។'
            : 'Failed to accept invitation. Please verify token.'
        )
      }
    }
  }

  const handleAcceptNew = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) {
      setErrorMessage(isKm ? 'តំណអញ្ជើញមិនត្រឹមត្រូវទេ' : 'Invitation token is missing')
      return
    }
    if (password.length < 8) {
      setErrorMessage(
        isKm ? 'ពាក្យសម្ងាត់ត្រូវតែមានយ៉ាងតិច 8 តួអក្សរ' : 'Password must be at least 8 characters long'
      )
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage(isKm ? 'ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ' : 'Passwords do not match')
      return
    }

    setErrorMessage(null)
    try {
      await acceptNewMutation.mutateAsync({
        token,
        password,
        full_name: fullName.trim() || undefined,
      })
      setSuccessMessage(
        isKm
          ? 'គណនីរបស់អ្នកត្រូវបានបង្កើតដោយជោគជ័យ! សូមចូលប្រើប្រាស់...'
          : 'Your account is ready! Redirecting to sign in...'
      )
      setTimeout(() => {
        navigate('/login?invitation_accepted=true')
      }, 1500)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(typeof err.detail === 'string' ? err.detail : err.message)
      } else {
        setErrorMessage(
          isKm
            ? 'មិនអាចយល់ព្រមទទួលការអញ្ជើញបានទេ។ តំណអាចផុតកំណត់ ឬមិនត្រឹមត្រូវ។'
            : 'Failed to accept invitation. Token may have expired or is invalid.'
        )
      }
    }
  }

  if (!token) {
    return (
      <AuthLayout
        title={isKm ? 'តំណអញ្ជើញមិនត្រឹមត្រូវ' : 'Invalid Invitation'}
        subtitle={isKm ? 'តំណអញ្ជើញនេះមិនត្រឹមត្រូវ ឬបាត់បង់លេខកូដសម្គាល់' : 'The invitation link is missing a valid token'}
      >
        <div className="text-center py-6 space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {isKm
              ? 'សូមទាក់ទងអ្នកគ្រប់គ្រងរបស់អ្នកដើម្បីទទួលបានតំណអញ្ជើញថ្មី។'
              : 'Please request a fresh invitation link from your restaurant administrator.'}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <LogIn className="w-4 h-4" />
            {isKm ? 'ត្រឡប់ទៅទំព័រចូល' : 'Back to Sign In'}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={isKm ? 'ការអញ្ជើញចូលរួមក្រុម' : 'Team Invitation'}
      subtitle={
        isKm
          ? 'អ្នកត្រូវបានអញ្ជើញឱ្យចូលរួមជាសមាជិកបុគ្គលិកភោជនីយដ្ឋាន'
          : 'You have been invited to join restaurant staff workspace'
      }
    >
      {successMessage ? (
        <div className="text-center py-8 space-y-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
          <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50">
            {isKm ? 'សូមស្វាគមន៍មកកាន់ក្រុម!' : 'Welcome to the Team!'}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{successMessage}</p>
        </div>
      ) : currentUser ? (
        /* Signed-in User View */
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80">
            <span className="text-xs uppercase tracking-wider text-zinc-500 block mb-1">
              {isKm ? 'គណនីដែលកំពុងចូលប្រើ' : 'Signed in as'}
            </span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                {currentUser.full_name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {currentUser.full_name}
                </p>
                <p className="text-xs text-zinc-500 truncate">{currentUser.email || currentUser.phone}</p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              disabled={acceptExistingMutation.isPending}
              onClick={handleAcceptExisting}
            >
              {acceptExistingMutation.isPending ? (
                isKm ? 'កំពុងដំណើរការ...' : 'Accepting...'
              ) : (
                <>
                  <span>{isKm ? 'យល់ព្រមទទួលការអញ្ជើញ' : 'Accept Invitation'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {isKm ? 'ចង់ប្រើគណនីផ្សេងទៀត?' : 'Want to sign in with a different account?'}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* New User Password Setup Form */
        <form onSubmit={handleAcceptNew} className="space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
              {isKm ? 'ឈ្មោះពេញ' : 'Full Name'}
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={isKm ? 'ឈ្មោះរបស់អ្នក (ស្រេចចិត្ត)' : 'Your name (optional)'}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
              {isKm ? 'ពាក្យសម្ងាត់ថ្មី (យ៉ាងតិច ៨ តួ)' : 'New Password (min. 8 characters)'} *
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
              {isKm ? 'ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់' : 'Confirm Password'} *
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2 mt-2"
            disabled={acceptNewMutation.isPending}
          >
            {acceptNewMutation.isPending ? (
              isKm ? 'កំពុងបង្កើត...' : 'Activating Account...'
            ) : (
              <>
                <span>{isKm ? 'បង្កើតគណនី និងចូលរួម' : 'Activate Account & Join'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>

          <div className="pt-2 text-center text-xs text-zinc-500">
            {isKm ? 'មានគណនីរួចហើយ?' : 'Already have an account?'}{' '}
            <Link
              to="/login"
              className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {isKm ? 'ចូលប្រើប្រាស់នៅទីនេះ' : 'Sign in here'}
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
