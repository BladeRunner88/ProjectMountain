export function Hero() {
  return (
    <section className="flex min-h-[85vh] items-center pt-14">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:px-10">
        <h1 className="text-[56px] leading-[1.05] font-semibold tracking-[-0.03em] md:text-[104px]">
          <span className="text-ink">Every system speaks.</span>
          <br />
          <span className="text-ink-faint">Nothing understands.</span>
        </h1>
        <p className="mt-8 max-w-[60ch] text-[19px] leading-[1.5] text-ink-faint">
          Isildur builds the layer that turns scattered operational data into
          one decision you can act on with confidence.
        </p>
      </div>
    </section>
  )
}
