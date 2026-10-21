import { useState, useEffect, useCallback, type FC } from 'react'
import { ArrowLeft, Delete } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { playSuccessSound } from '@/lib/audio'

export interface POSStaffMember {
  id?: string
  full_name: string
  role?: string
  avatar_url?: string | null
  pos_pin?: string | null
  is_owner?: boolean
}

export interface POSCashierPinScreenProps {
  storeName?: string
  storeLogo?: string | null
  onVerifyPin: (pin: string) => Promise<{ valid: boolean }>
}

export const POSCashierPinScreen: FC<POSCashierPinScreenProps> = ({
  storeName,
  storeLogo,
  onVerifyPin,
}) => {
  const { language } = useLanguageStore()
  const [pin, setPin] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isShaking, setIsShaking] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

  const resolvedStoreName =
    storeName ||
    (language === 'km'
      ? localStorage.getItem('emenu_business_name_km') ||
        localStorage.getItem('emenu_business_name_en') ||
        'ហាងរបស់ខ្ញុំ'
      : localStorage.getItem('emenu_business_name_en') ||
        localStorage.getItem('emenu_business_name_km') ||
        'My Store')

  const resolvedLogo =
    storeLogo !== undefined
      ? storeLogo
      : localStorage.getItem('emenu_business_logo') || null

  const triggerError = useCallback((msg: string) => {
    setErrorMsg(msg)
    setIsShaking(true)
    setTimeout(() => {
      setIsShaking(false)
      setPin('')
    }, 500)
  }, [])

  const handleVerifyPin = useCallback(
    async (pinToVerify: string) => {
      if (pinToVerify.length !== 4) return
      setIsVerifying(true)
      setErrorMsg(null)

      try {
        const res = await onVerifyPin(pinToVerify)
        if (res.valid) {
          playSuccessSound()
          return
        }

        triggerError(
          language === 'km'
            ? 'លេខកូដសម្ងាត់មិនត្រឹមត្រូវ សូមព្យាយាមម្តងទៀត'
            : 'Incorrect PIN code. Please try again.'
        )
      } catch {
        triggerError(
          language === 'km'
            ? 'លេខកូដសម្ងាត់មិនត្រឹមត្រូវ ឬមានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់'
            : 'Verification failed. Please try again.'
        )
      } finally {
        setIsVerifying(false)
      }
    },
    [language, onVerifyPin, triggerError]
  )

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (isVerifying) return
      if (pin.length < 4) {
        const nextPin = pin + digit
        setPin(nextPin)
        if (nextPin.length === 4) {
          handleVerifyPin(nextPin)
        }
      }
    },
    [handleVerifyPin, isVerifying, pin]
  )

  const handleBackspace = useCallback(() => {
    if (isVerifying) return
    setErrorMsg(null)
    setPin((prev) => prev.slice(0, -1))
  }, [isVerifying])

  const handleClear = useCallback(() => {
    if (isVerifying) return
    setErrorMsg(null)
    setPin('')
  }, [isVerifying])

  // Keyboard support for 0-9, Backspace, Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleDigitPress(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault()
        handleClear()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleBackspace, handleClear, handleDigitPress])

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col transition-colors selection:bg-emerald-500 selection:text-white">
      {/* Top Header Bar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">
              {language === 'km' ? 'ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង' : 'Dashboard'}
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={resolvedStoreName}
                className="w-9 h-9 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-bold text-sm uppercase">
                {resolvedStoreName.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {resolvedStoreName}
              </h1>
              <p className="text-[11px] text-zinc-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {language === 'km' ? 'ប្រព័ន្ធបញ្ជាទិញ POS' : 'POS Terminal Gateway'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main PIN Terminal Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center">
          <h2 className="text-xl font-extrabold text-zinc-950 dark:text-zinc-50 text-center tracking-tight">
            {language === 'km' ? 'ចូលប្រើប្រព័ន្ធ POS' : 'Cashier Terminal Sign-In'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 text-center mt-1">
            {language === 'km'
              ? 'សូមបញ្ចូលលេខកូដសម្ងាត់បុគ្គលិក (PIN ៤ ខ្ទង់)'
              : 'Enter your 4-digit staff PIN to unlock terminal'}
          </p>

          {/* PIN Indicator Dots */}
          <div
            className={`my-6 flex items-center justify-center gap-4 transition-transform ${
              isShaking ? 'animate-bounce text-rose-500' : ''
            }`}
          >
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-emerald-600 dark:bg-emerald-400 scale-125 shadow-md shadow-emerald-500/30'
                      : 'border-2 border-zinc-300 dark:border-zinc-700 bg-transparent'
                  }`}
                />
              )
            })}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <p className="mb-4 text-xs font-semibold text-rose-500 text-center animate-fadeIn">
              {errorMsg}
            </p>
          )}

          {/* Numeric Touchpad */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={isVerifying}
                onClick={() => handleDigitPress(digit)}
                className="h-14 sm:h-16 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 active:scale-95 transition-all text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 shadow-sm flex items-center justify-center select-none"
              >
                {digit}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              disabled={isVerifying || pin.length === 0}
              onClick={handleClear}
              className="h-14 sm:h-16 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-800/30 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 transition-all text-xs sm:text-sm font-bold text-zinc-500 dark:text-zinc-400 flex items-center justify-center select-none disabled:opacity-40 disabled:hover:scale-100"
              title={language === 'km' ? 'សម្អាតទាំងអស់' : 'Clear all'}
            >
              {language === 'km' ? 'សម្អាត' : 'Clear'}
            </button>

            {/* Zero Button */}
            <button
              type="button"
              disabled={isVerifying}
              onClick={() => handleDigitPress('0')}
              className="h-14 sm:h-16 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 active:scale-95 transition-all text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 shadow-sm flex items-center justify-center select-none"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              disabled={isVerifying || pin.length === 0}
              onClick={handleBackspace}
              className="h-14 sm:h-16 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-800/30 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 transition-all text-zinc-700 dark:text-zinc-300 flex items-center justify-center select-none disabled:opacity-40 disabled:hover:scale-100"
              title={language === 'km' ? 'លុបមួយខ្ទង់' : 'Backspace'}
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
