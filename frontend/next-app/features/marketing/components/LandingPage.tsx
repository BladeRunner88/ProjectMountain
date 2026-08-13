import { Hero } from "./Hero"
import { MarketingShell } from "./MarketingShell"
import { FeatureModule } from "./landing/FeatureModule"
import { Manifesto } from "./landing/Manifesto"
import { OurSoftware } from "./landing/OurSoftware"
import { RequestDemoBand } from "./landing/RequestDemoBand"
import { Security } from "./landing/Security"
import { ShowcasePanel } from "./landing/ShowcasePanel"
import { WhatIsIsildur } from "./landing/WhatIsIsildur"

export function LandingPage() {
  return (
    <MarketingShell>
      <Hero />
      <OurSoftware />
      <Manifesto />
      <WhatIsIsildur />
      <FeatureModule />
      <ShowcasePanel />
      <Security />
      <RequestDemoBand />
    </MarketingShell>
  )
}
