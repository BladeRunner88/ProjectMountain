import { Link } from 'react-router-dom'
import type { AccessSummary } from '../../lib/access'

export function Confirmation({ summary }: { summary: AccessSummary }) {
  return (
    <div>
      <h1 className="text-[36px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
        Your request is under review.
      </h1>
      <p className="mt-4 text-[17px] leading-[1.5] text-ink-soft">
        We review every organization before granting access. Once approved,
        we will contact you at {summary.billingContactEmail} to discuss
        deployment and pricing.
      </p>

      <div className="mt-10 flex flex-col gap-4 border-t border-hairline pt-8">
        <SummaryRow label="Company" value={summary.companyName} />
        <SummaryRow label="Industry" value={summary.industry} />
        <SummaryRow label="Country" value={summary.country} />
        <SummaryRow label="Deployment environment" value={summary.deploymentEnvironment} />
      </div>

      <div className="mt-16">
        <Link
          to="/app"
          className="text-[14px] text-ink-faint transition-colors duration-fast ease-out hover:text-ink-soft"
        >
          Continue to demo workspace
        </Link>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-[14px] text-ink-soft">{label}</span>
      <span className="text-right text-[14px] font-medium text-ink">{value}</span>
    </div>
  )
}
