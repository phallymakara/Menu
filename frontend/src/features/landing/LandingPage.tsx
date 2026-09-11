import { type FC } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from './components/HeroSection'
import { HowItWorksSection } from './components/HowItWorksSection'
import { FeatureGrid } from './components/FeatureGrid'
import { PricingTable } from './components/PricingTable'
import { EmailSignupSection } from './components/EmailSignupSection'

export const LandingPage: FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-600 selection:text-white flex flex-col justify-between overflow-x-hidden">
      <Navbar />

      {/* Hero Section spreads across the entire width of the page */}
      <div className="w-full">
        <HeroSection />
      </div>

      {/* Main Container for rest of sections */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 flex-1 w-full space-y-6 sm:space-y-10">
        <HowItWorksSection />
        <FeatureGrid />
        <PricingTable />
        <EmailSignupSection />
      </main>

      <Footer />
    </div>
  )
}
