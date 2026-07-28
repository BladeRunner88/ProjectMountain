import { Nav } from '../components/Nav'
import { Hero } from '../components/Hero'
import { OurSoftware } from '../components/landing/OurSoftware'
import { Manifesto } from '../components/landing/Manifesto'
import { WhatIsIsildur } from '../components/landing/WhatIsIsildur'
import { FeatureModule } from '../components/landing/FeatureModule'
import { ShowcasePanel } from '../components/landing/ShowcasePanel'
import { Security } from '../components/landing/Security'
import { RequestDemoBand } from '../components/landing/RequestDemoBand'
import { Footer } from '../components/Footer'

export function Landing() {
  return (
    <div className="min-h-screen bg-app font-inter">
      <Nav />
      <main className="pt-14">
        <Hero />
        <OurSoftware />
        <Manifesto />
        <WhatIsIsildur />
        <FeatureModule />
        <ShowcasePanel />
        <Security />
        <RequestDemoBand />
      </main>
      <Footer />
    </div>
  )
}
