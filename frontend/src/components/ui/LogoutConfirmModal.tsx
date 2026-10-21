import { useState, useEffect, type FC, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { logout } from '@/lib/auth-session'

export interface LogoutButtonProps {
  className?: string
  title?: string
  align?: 'left' | 'right'
  direction?: 'top' | 'bottom'
  children?: ReactNode
  onLoggedOut?: () => void
}

/**
 * Reusable Logout Button with an anchored confirmation popover modal.
 * Shows a clear confirmation question with "Yes" / "No" action buttons right near the logout button.
 */
export const LogoutButton: FC<LogoutButtonProps> = ({
  className,
  title,
  align = 'right',
  direction = 'bottom',
  children,
  onLoggedOut,
}) => {
  const { language } = useLanguageStore()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      if (onLoggedOut) {
        onLoggedOut()
      } else {
        navigate('/login')
      }
    } catch {
      navigate('/login')
    } finally {
      setIsLoggingOut(false)
      setIsOpen(false)
    }
  }

  const defaultTitle = language === 'km' ? 'ចាកចេញពីគណនី' : 'Sign Out'

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={className}
        title={title || defaultTitle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {children || <LogOut className="w-4 h-4" />}
      </button>

      {isOpen && (
        <>
          {/* Subtle click-outside backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/10 dark:bg-black/30 backdrop-blur-[0.5px]"
            onClick={() => !isLoggingOut && setIsOpen(false)}
          />

          {/* Small Confirmation Modal Popup anchored near the button */}
          <div
            role="dialog"
            aria-modal="true"
            className={`absolute z-50 ${
              align === 'left' ? 'left-0' : 'right-0'
            } ${
              direction === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            } w-64 sm:w-72 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-150`}
          >
            <div className="mb-3">
              <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                {language === 'km' ? 'តើអ្នកចង់ចាកចេញមែនទេ?' : 'Confirm Logout?'}
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                {language === 'km'
                  ? 'សូមបញ្ជាក់ ប្រសិនបើអ្នកពិតជាចង់ចាកចេញពីគណនី។'
                  : 'Are you sure you want to sign out of your account?'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {language === 'km' ? 'ទេ' : 'No'}
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogout}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isLoggingOut && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <span>{language === 'km' ? 'បាទ/ចាស' : 'Yes'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
