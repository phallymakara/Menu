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
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-600 selection:text-white flex flex-col justify-between">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 flex-1 w-full">
        <HeroSection />
        <HowItWorksSection />
        <FeatureGrid />
        <PricingTable />
        <EmailSignupSection />
      </main>

      <Footer />
    </div>
  )
}
