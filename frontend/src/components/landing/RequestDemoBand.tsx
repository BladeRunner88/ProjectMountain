import { SquareButton } from '../SquareButton'

export function RequestDemoBand() {
  return (
    <section className="border-t border-hairline px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-6">
        <h2 className="text-[32px] font-semibold tracking-[-0.02em] text-ink md:text-[40px]">
          See ASE on your data.
        </h2>
        <SquareButton tone="light" to="/request-access">
          Request a demo
        </SquareButton>
      </div>
    </section>
  )
}
