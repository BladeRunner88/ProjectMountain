import { Link } from 'react-router-dom'
import { GraphMock } from './GraphMock'

export function FeatureModule() {
  return (
    <section className="border-t border-hairline py-8 md:py-12">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <Link
          to="/how-it-works"
          className="group grid grid-cols-1 border border-hairline md:min-h-[78vh] md:grid-cols-[55%_45%]"
        >
          <div className="relative h-[60vh] overflow-hidden bg-canvas md:h-auto">
            <GraphMock />
          </div>
          <div className="flex flex-col justify-center gap-6 border-t border-hairline px-8 py-14 md:border-l md:border-t-0 md:py-0 md:pl-16 md:pr-12">
            <h2 className="max-w-lg text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-[64px]">
              See how everything connects.
            </h2>
            <p className="max-w-[48ch] text-[18px] leading-[1.5] text-ink-soft md:text-[22px]">
              Every system resolved into one model. Every relationship, every discrepancy, and
              where each value came from, in a single view.
            </p>
            <span className="mt-2 inline-block w-fit border border-ink bg-ink px-8 py-4 text-[16px] font-medium text-app transition-colors duration-fast ease-out group-hover:bg-app group-hover:text-ink">
              Learn more
            </span>
          </div>
        </Link>
      </div>
    </section>
  )
}
