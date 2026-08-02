import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

export function Contact() {
  return (
    <div className="min-h-screen bg-app font-inter">
      <Nav />
      <main className="pt-14">
        <section className="px-6 py-24 md:px-10 md:py-32">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-[40px] font-semibold tracking-[-0.025em] text-ink md:text-[56px]">
              Contact.
            </h1>
            <p className="mt-6 max-w-[60ch] text-[19px] font-normal leading-[1.5] text-ink-soft">
              A contact form is coming soon.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
