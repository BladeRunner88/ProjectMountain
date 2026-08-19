const LINES = [
  "Connect every enterprise system.",
  "Resolve every entity.",
  "Search everything instantly.",
  "Ask questions in plain English.",
]

export function Manifesto() {
  return (
    <section className="border-t border-hairline py-24 md:py-32">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-6 md:px-10">
        {LINES.map((line) => (
          <p
            key={line}
            className="text-[32px] leading-tight font-semibold tracking-[-0.025em] text-ink md:text-[48px]"
          >
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}
