import { describe, expect, it } from "vitest"

import type { AccessFormValues } from "../types/form"
import { ACCESS_FORM_DEFAULTS } from "../types/form"
import { toAccessRequestPayload } from "./payload"

const filled: AccessFormValues = {
  ...ACCESS_FORM_DEFAULTS,
  companyName: "Northwind Fabrication",
  businessEmail: "ops@northwind.example",
  phoneDial: "+1",
  phoneNumber: "5550100",
  website: "https://northwind.example",
  industry: "manufacturing",
  companySize: "11-50",
  country: "DE",
  addressLine1: "1 Werkstrasse",
  city: "Stuttgart",
  statePlant: "Baden-Wurttemberg",
  postalCode: "70173",
  businessDescription: "Contract machining across three plants.",
  useCase: "Reconciling MES and CMMS asset registers.",
  deploymentEnvironment: "on-prem",
  expectedAnalysts: "1-5",
  systems: ["mes", "cmms"],
  targetTimeline: "this quarter",
  billingContactName: "A Person",
  billingContactEmail: "billing@northwind.example",
}

describe("toAccessRequestPayload", () => {
  it("maps the form state/plant field onto the API state_region contract", () => {
    const payload = toAccessRequestPayload(filled)

    expect(payload.state_region).toBe("Baden-Wurttemberg")
    expect(payload).not.toHaveProperty("state_plant")
  })
})
