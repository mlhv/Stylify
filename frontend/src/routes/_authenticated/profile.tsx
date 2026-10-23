import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { groupByType, TYPE_NAMES, typeColors } from '@stylify/shared/brand'
import { getAllItemsQueryOptions, userQueryOptions } from '@/lib/api'
import { Garment } from '@/components/brand/Garment'
import { chunkyClasses } from '@/components/app/ChunkyButton'
import { ErrorPanel } from '@/components/app/ErrorPanel'

export const Route = createFileRoute('/_authenticated/profile')({
  component: Profile,
})

const edge = { boxShadow: '0 5px 0 0 rgba(0,0,0,.08)' }

function Profile() {
  const user = useQuery(userQueryOptions)
  const items = useQuery(getAllItemsQueryOptions)

  if (user.isPending || items.isPending) return <ProfileSkeleton />

  if (user.error || items.error) {
    return (
      <div className="px-4 py-10">
        <ErrorPanel
          title="Couldn't load your profile"
          message="Check your connection and try again."
          onAction={() => {
            if (user.error) void user.refetch()
            if (items.error) void items.refetch()
          }}
        />
      </div>
    )
  }

  const { given_name, family_name, email } = user.data.user
  const fullName = [given_name, family_name].filter(Boolean).join(' ')
  const groups = groupByType(items.data.items)
  const total = items.data.items.length

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-[20px] bg-white p-6" style={edge}>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-sun text-3xl font-black text-ink">
            {getInitials(given_name, family_name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">{fullName || 'You'}</h1>
            {email && <p className="truncate text-muted">{email}</p>}
          </div>
        </div>

        <h2 className="mt-8 text-lg font-extrabold">Your closet in numbers</h2>
        {total === 0 ? (
          <div className="mt-3">
            <p className="text-muted">Nothing to count yet. Add your first piece!</p>
            <Link to="/create-item" className={`${chunkyClasses('primary')} mt-4`}>
              Add a piece
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-6xl font-black leading-none">{total}</span>
              <span className="font-bold text-muted">{total === 1 ? 'piece' : 'pieces'}</span>
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {groups.map(({ key, count }) => {
                const { bg, fg } = typeColors[key]
                return (
                  <li
                    key={key}
                    className="flex items-center gap-3 rounded-2xl p-3"
                    style={{ backgroundColor: bg, color: fg, ...edge }}
                  >
                    <Garment kind={key} className="h-9 w-9 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-2xl font-black leading-none">{count}</p>
                      <p className="truncate text-sm font-bold">{TYPE_NAMES[key]}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="mt-8 flex justify-center border-t-2 border-line pt-4">
          <a href="/api/logout" className={chunkyClasses('quiet')}>
            Sign out
          </a>
        </div>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8" aria-hidden="true">
      <div className="rounded-[20px] bg-white p-6" style={edge}>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 animate-pulse rounded-full bg-line" />
          <div className="space-y-2">
            <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
            <div className="h-4 w-56 max-w-full animate-pulse rounded-full bg-line" />
          </div>
        </div>
        <div className="mt-8 h-5 w-48 animate-pulse rounded-full bg-line" />
        <div className="mt-4 h-14 w-24 animate-pulse rounded-2xl bg-line" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-line" />
          ))}
        </div>
      </div>
    </div>
  )
}

function getInitials(firstName?: string, lastName?: string) {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
