import { typeColors, type TypeKey } from '@stylify/shared/brand'
import { Logo } from '@/components/brand/Logo'
import { Garment } from '@/components/brand/Garment'
import { chunkyClasses } from '@/components/app/ChunkyButton'
import { Walkthrough } from './Walkthrough'

const FEATURES: { type: TypeKey; title: string; body: string }[] = [
  { type: 'top', title: 'Snap it', body: "One photo per piece. That's the whole job." },
  {
    type: 'outerwear',
    title: 'It knows what it is',
    body: 'On iPhone, a model running on your phone fills in the type for you.',
  },
  {
    type: 'trousers',
    title: 'See it all',
    body: 'Your whole closet at a glance, on the web and on your phone.',
  },
]

// `/` when signed out. Sign-up and sign-in are server redirects, so plain links.
export function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <a
          href="/api/login"
          className="rounded-xl px-3 py-2 text-base font-extrabold text-ink hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          Sign in
        </a>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-12 pb-16 pt-8 lg:grid-cols-[1fr_auto] lg:gap-16 lg:pb-20 lg:pt-14">
          <div className="max-w-2xl">
            <h1 className="text-[2.75rem] font-black leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
              Know{' '}
              <span className="box-decoration-clone rounded-xl bg-sun px-2">everything</span> in
              your closet.
            </h1>
            <p className="mt-6 max-w-lg text-lg font-bold leading-relaxed text-muted sm:text-xl">
              Wardrobe apps are a chore, so nobody keeps one up. Stylify takes one photo and does
              the rest.
            </p>
            <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <a href="/api/register" className={chunkyClasses('primary', 'lg')}>
                Get started
              </a>
              <a
                href="/api/login"
                className="rounded-xl px-1 py-2 text-base font-extrabold text-muted underline decoration-line decoration-2 underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
              >
                I already have an account
              </a>
            </div>
          </div>

          <div className="relative flex justify-center">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffe1d6] max-sm:h-[320px] max-sm:w-[320px]"
            />
            <div className="relative">
              <Walkthrough />
            </div>
          </div>
        </section>

        <section aria-label="What Stylify does" className="grid gap-5 pb-16 sm:grid-cols-3">
          {FEATURES.map(({ type, title, body }) => {
            const { bg, fg } = typeColors[type]
            return (
              <div
                key={title}
                className="rounded-[20px] border-b-[5px] border-black/[.08] bg-white p-6"
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: bg, color: fg }}
                >
                  <Garment kind={type} className="h-10 w-10" />
                </div>
                <h2 className="mt-5 text-xl font-black tracking-tight">{title}</h2>
                <p className="mt-1.5 font-bold leading-relaxed text-muted">{body}</p>
              </div>
            )
          })}
        </section>
      </main>

      <footer className="border-t-2 border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm font-extrabold text-muted sm:px-6">
          <span>Made by Minh Le</span>
          <a
            href="https://github.com/mlhv/Stylify"
            className="rounded-lg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
