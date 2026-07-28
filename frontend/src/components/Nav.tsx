import { SquareButton } from './SquareButton'

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-hairline bg-app/70 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 md:px-10">
        <span className="text-[15px] font-semibold text-ink">Isildur</span>
        <SquareButton tone="light" to="/request-access">
          Get Started
        </SquareButton>
      </div>
    </header>
  )
}
