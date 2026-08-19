import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EmptyState } from "@/components/ui/empty-state"

function TestIcon({ className }: { className?: string }): React.ReactElement {
  return <svg data-testid="icon" className={className} />
}

describe("<EmptyState />", () => {
  it("renders the title and subtitle", () => {
    render(
      <EmptyState
        icon={TestIcon}
        title="No signals yet"
        subtitle="Signals appear once a run completes."
      />
    )
    expect(screen.getByText("No signals yet")).toBeInTheDocument()
    expect(
      screen.getByText("Signals appear once a run completes.")
    ).toBeInTheDocument()
  })

  it("renders the supplied icon with sizing classes", () => {
    render(<EmptyState icon={TestIcon} title="Empty" subtitle="Nothing here" />)
    const icon = screen.getByTestId("icon")
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass("h-7", "w-7")
  })

  it("uses light ink colours by default", () => {
    render(<EmptyState icon={TestIcon} title="Empty" subtitle="Nothing here" />)
    expect(screen.getByTestId("icon")).toHaveClass("text-ink-faint")
    expect(screen.getByText("Empty")).toHaveClass("text-ink")
    expect(screen.getByText("Nothing here")).toHaveClass("text-ink-soft")
  })

  it("switches to on-canvas ink colours for the dark variant", () => {
    render(
      <EmptyState
        icon={TestIcon}
        title="Empty"
        subtitle="Nothing here"
        variant="dark"
      />
    )
    expect(screen.getByTestId("icon")).toHaveClass("text-ink-on-canvas-soft")
    expect(screen.getByText("Empty")).toHaveClass("text-ink-on-canvas")
    expect(screen.getByText("Nothing here")).toHaveClass(
      "text-ink-on-canvas-soft"
    )
  })
})
