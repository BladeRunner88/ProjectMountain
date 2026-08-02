import { Link } from 'react-router-dom'

function CardArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M6 14L14 6M14 6H7M14 6V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RequestDemoBand() {
  return (
    <section className="border-t border-hairline px-4 py-16 md:px-6 md:py-24">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          to="/request-access"
          className="group flex h-[60vh] min-h-[520px] flex-col justify-between bg-canvas p-12 transition-colors duration-fast ease-out hover:bg-white/[0.03] md:p-16"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-on-canvas-soft">Get started</p>
            <h2 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-on-canvas md:text-[40px]">
              See ASE on your data.
            </h2>
          </div>
          <span className="flex h-11 w-11 items-center justify-center border border-app text-ink-on-canvas transition-colors duration-fast ease-out group-hover:bg-app group-hover:text-ink">
            <CardArrow />
          </span>
        </Link>

        <div
          id="transforming-lives"
          className="scroll-mt-14 flex h-[60vh] min-h-[520px] flex-col justify-between border border-hairline bg-app p-12 md:p-16"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-soft">Our mission</p>
            <h2 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink md:text-[40px]">
              Transforming lives.
            </h2>
          </div>
          <span className="flex h-11 w-11 items-center justify-center border border-ink text-ink">
            <CardArrow />
          </span>
        </div>
      </div>
    </section>
  )
}
