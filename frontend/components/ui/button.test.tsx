import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button, buttonVariants } from "@/components/ui/button"

describe("buttonVariants", () => {
  it("applies the default variant and size", () => {
    const classes = buttonVariants()
    expect(classes).toContain("bg-primary")
    expect(classes).toContain("h-9")
  })

  it("applies the requested variant", () => {
    expect(buttonVariants({ variant: "destructive" })).toContain(
      "text-destructive"
    )
    expect(buttonVariants({ variant: "link" })).toContain("underline-offset-4")
  })

  it("applies the requested size", () => {
    expect(buttonVariants({ size: "icon" })).toContain("size-9")
    expect(buttonVariants({ size: "lg" })).toContain("h-10")
  })

  it("merges an extra className", () => {
    expect(buttonVariants({ className: "custom-class" })).toContain(
      "custom-class"
    )
  })
})

describe("<Button />", () => {
  it("renders its children into a button element", () => {
    render(<Button>Run report</Button>)
    const button = screen.getByRole("button", { name: "Run report" })
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe("BUTTON")
  })

  it("carries the data-slot marker", () => {
    render(<Button>Tagged</Button>)
    expect(screen.getByRole("button")).toHaveAttribute("data-slot", "button")
  })

  it("applies default variant classes", () => {
    render(<Button>Default</Button>)
    expect(screen.getByRole("button")).toHaveClass("bg-primary")
  })

  it("applies variant and size props", () => {
    render(
      <Button variant="outline" size="sm">
        Outlined
      </Button>
    )
    const button = screen.getByRole("button")
    expect(button).toHaveClass("border-border")
    expect(button).toHaveClass("h-8")
  })

  it("lets a caller className override a conflicting variant class", () => {
    render(<Button className="h-20">Tall</Button>)
    const button = screen.getByRole("button")
    expect(button).toHaveClass("h-20")
    expect(button).not.toHaveClass("h-9")
  })

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)
    await userEvent.click(screen.getByRole("button", { name: "Click me" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not fire onClick while disabled", async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    )
    const button = screen.getByRole("button", { name: "Disabled" })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("forwards arbitrary props such as type and aria-label", () => {
    render(<Button type="submit" aria-label="Submit form" />)
    const button = screen.getByRole("button", { name: "Submit form" })
    expect(button).toHaveAttribute("type", "submit")
  })
})
