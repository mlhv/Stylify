import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { chunkyClasses } from './ChunkyButton'
import { cn } from '@/lib/utils'

const linkClass = 'rounded-xl px-3 py-2 text-base font-extrabold text-ink hover:text-coral data-[status=active]:text-coral'

export function AppHeader() {
  return (
    <header className="border-b-2 border-line bg-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link to="/" aria-label="Stylify home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            to="/"
            className={linkClass}
            activeOptions={{ exact: true }}
          >
            Closet
          </Link>
          <Link to="/create-item" className={cn(chunkyClasses('primary', 'md'), '!px-3 sm:!px-5')}>
            <Plus className="h-5 w-5" strokeWidth={3} aria-hidden />
            Add
          </Link>
          <Link
            to="/profile"
            className={linkClass}
          >
            Me
          </Link>
        </nav>
      </div>
    </header>
  )
}
