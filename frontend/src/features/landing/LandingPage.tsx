import { useEffect, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from './components/HeroSection'
import { HowItWorksSection } from './components/HowItWorksSection'
import { FeatureGrid } from './components/FeatureGrid'
import { PricingTable } from './components/PricingTable'
import { EmailSignupSection } from './components/EmailSignupSection'
import { RegisterModal } from '@/features/auth/components/RegisterModal'
import { LoginModal } from '@/features/auth/components/LoginModal'
import { useAuthModalStore } from '@/stores/useAuthModalStore'

export const LandingPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    isRegisterOpen,
    openRegisterModal,
    closeRegisterModal,
    isLoginOpen,
    openLoginModal,
    closeLoginModal,
  } = useAuthModalStore()

  useEffect(() => {
    // Ensure Landing Page is immune to dark mode and always renders in clean light mode
    const wasDark = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')

    return () => {
      // Restore dark mode when navigating to other pages (Admin, POS, KDS) if theme is dark
      const savedTheme = localStorage.getItem('emenu_theme')
      if (savedTheme === 'dark' || wasDark) {
        document.documentElement.classList.add('dark')
      }
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('register') === 'true') {
      openRegisterModal()
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('register')
      setSearchParams(newParams, { replace: true })
    } else if (searchParams.get('login') === 'true') {
      openLoginModal()
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('login')
      setSearchParams(newParams, { replace: true })
    }
  }, [searchParams, openRegisterModal, openLoginModal, setSearchParams])

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased selection:bg-emerald-600 selection:text-white flex flex-col justify-between overflow-x-hidden">
      <Navbar />

      {/* Hero Section spreads across the entire width of the page */}
      <div className="w-full">
        <HeroSection />
      </div>

      {/* How It Works Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full">
        <HowItWorksSection />
      </div>

      {/* FeatureGrid Section - Spans entire screen width edge-to-edge */}
      <div className="w-full my-1 sm:my-2">
        <FeatureGrid />
      </div>

      {/* Main Container for rest of sections */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 flex-1 w-full space-y-2 sm:space-y-4">
        <PricingTable />
        <EmailSignupSection />
      </main>

      <Footer />

      {/* Register Popup Modal */}
      <RegisterModal isOpen={isRegisterOpen} onClose={closeRegisterModal} />

      {/* Login Popup Modal */}
      <LoginModal isOpen={isLoginOpen} onClose={closeLoginModal} />
    </div>
  )
}
