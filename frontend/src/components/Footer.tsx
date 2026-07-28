import { SquareButton } from './SquareButton'

export function Footer() {
  return (
    <footer className="border-t border-hairline py-24 md:py-32">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center md:px-10">
        <span className="text-[17px] font-semibold text-ink">Isildur</span>
        <div className="mt-8">
          <SquareButton tone="light" to="/request-access">
            Request access
          </SquareButton>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px] text-ink-faint">
          <a href="#" className="transition-colors duration-fast ease-out hover:text-ink-soft">
            Terms of Service
          </a>
          <a href="#" className="transition-colors duration-fast ease-out hover:text-ink-soft">
            Privacy Policy
          </a>
          <a href="#" className="transition-colors duration-fast ease-out hover:text-ink-soft">
            Cookie Policy
          </a>
        </div>

        <p className="mt-8 text-[12px] text-ink-faint">© 2026 Isildur</p>
      </div>
    </footer>
  )
}
