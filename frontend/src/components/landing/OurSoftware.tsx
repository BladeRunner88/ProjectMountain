import { Section } from './Section'

type Product = {
  index: string
  name: string
  status: string
  description: string
  href?: string
  quiet?: boolean
}

const PRODUCTS: Product[] = [
  {
    index: '/0.1',
    name: 'ASE',
    status: 'Available',
    description:
      'An ontology powered intelligence system, entirely under your control. Connect the ' +
      'systems you already run, resolve them into one model, and see every relationship, ' +
      'every discrepancy, and where each number came from.',
    href: '#ase',
  },
  {
    index: '/0.2',
    name: 'Elendil',
    status: 'Coming soon',
    description:
      'The central system for orchestrating decisions, with a human feedback loop at its core. ' +
      'Every decision reviewed, every judgment captured, every action traced back to who made ' +
      'it and why.',
    quiet: true,
  },
]

function ProductRow({ product, bordered }: { product: Product; bordered: boolean }) {
  const nameColor = product.quiet ? 'text-ink-faint' : 'text-ink'
  const descColor = product.quiet ? 'text-ink-faint' : 'text-ink-soft'

  const content = (
    <div className={`flex items-start justify-between gap-8 py-12 md:py-16 ${bordered ? 'border-t border-hairline' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-4">
          <h3 className={`text-[40px] font-semibold leading-none tracking-[-0.02em] md:text-[72px] ${nameColor}`}>
            {product.name}
          </h3>
          <span className="text-[14px] text-ink-faint">{product.status}</span>
        </div>
        <p className={`mt-4 max-w-2xl text-[16px] leading-[1.6] md:text-[17px] ${descColor}`}>
          {product.description}
        </p>
      </div>
      <span className="shrink-0 text-[14px] text-ink-faint">{product.index}</span>
    </div>
  )

  if (product.href) {
    return (
      <a href={product.href} className="block transition-opacity duration-fast ease-out hover:opacity-70">
        {content}
      </a>
    )
  }
  return <div className="cursor-default">{content}</div>
}

export function OurSoftware() {
  return (
    <Section id="ase" className="max-w-6xl">
      <p className="text-[15px] font-medium text-ink">Our Software</p>
      <div className="mt-6 border-t border-hairline" />
      <div>
        {PRODUCTS.map((product, i) => (
          <ProductRow key={product.name} product={product} bordered={i > 0} />
        ))}
      </div>
    </Section>
  )
}
