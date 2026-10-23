import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  TYPE_NAMES,
  filterItems,
  groupByType,
  resolveFilter,
  type Filter,
} from '@stylify/shared/brand'
import {
  getAllItemsQueryOptions,
  loadingCreateItemQueryOptions,
  getTotalClothesQueryOptions,
} from '@/lib/api'
import { Pill } from '@/components/app/Pill'
import { ItemTile, ItemTileSkeleton } from '@/components/app/ItemTile'
import { EmptyCloset } from '@/components/app/EmptyCloset'
import { ErrorPanel } from '@/components/app/ErrorPanel'

export const Route = createFileRoute('/_authenticated/')({
  component: Items,
})

const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

function Items() {
  const [selected, setSelected] = useState<Filter>('all')
  const { isPending, error, data, refetch } = useQuery(getAllItemsQueryOptions)
  const { data: loadingCreateItem } = useQuery(loadingCreateItemQueryOptions)
  const { data: total } = useQuery(getTotalClothesQueryOptions)

  const items = data?.items ?? []
  const groups = groupByType(items)
  const filter = resolveFilter(selected, groups)
  const visible = filterItems(items, filter)

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-extrabold">
        Your <span className="rounded-lg bg-sun px-1.5">closet</span>
      </h1>
      <p className="mt-2 min-h-6 text-muted">
        {total ? `${total.total} ${total.total === 1 ? 'piece' : 'pieces'}, nicely sorted.` : null}
      </p>

      {error ? (
        <div className="mt-8">
          <ErrorPanel
            title="Couldn't load your closet"
            message={error.message}
            onAction={() => void refetch()}
          />
        </div>
      ) : isPending ? (
        <div className={`${gridClass} mt-8`}>
          {Array.from({ length: 8 }, (_, i) => (
            <ItemTileSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 && !loadingCreateItem?.item ? (
        <EmptyCloset />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3 pb-2">
            <Pill selected={filter === 'all'} onClick={() => setSelected('all')}>
              All
            </Pill>
            {groups.map(({ key }) => (
              <Pill key={key} selected={filter === key} onClick={() => setSelected(key)}>
                {TYPE_NAMES[key]}
              </Pill>
            ))}
          </div>
          <div className={`${gridClass} mt-6`}>
            {loadingCreateItem?.item && <ItemTileSkeleton />}
            {visible.map((item, i) => (
              <ItemTile key={item.id} item={item} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Items
