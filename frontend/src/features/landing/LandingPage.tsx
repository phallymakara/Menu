import { type FC } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HeroSection } from './components/HeroSection'
import { PartnerLogos } from './components/PartnerLogos'
import { LiveDemoQRSection } from './components/LiveDemoQRSection'
import { FeatureGrid } from './components/FeatureGrid'
import { HowItWorksSection } from './components/HowItWorksSection'
import { PricingTable } from './components/PricingTable'

export const LandingPage: FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-emerald-600 selection:text-white flex flex-col justify-between">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 flex-1 w-full">
        <HeroSection />
        <PartnerLogos />
        <FeatureGrid />
        <HowItWorksSection />
        <LiveDemoQRSection />
        <PricingTable />
      </main>

      <Footer />
    </div>
  )
}
