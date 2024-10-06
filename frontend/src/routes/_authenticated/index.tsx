import { createFileRoute } from '@tanstack/react-router'

import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/')({
  component: Index,
})

async function getTotalCLothes() {
  const res = await api.wardrobe['total-items'].$get()
  if (!res.ok) {
    throw new Error('Network response was not ok')
  }
  const data = res.json()
  return data
}

function Index() {
  const { isPending, isLoading, error, data } = useQuery({
    queryKey: ['get-total-clothes'],
    queryFn: getTotalCLothes,
  })

  if (isPending) return 'Loading...'

  if (error) return 'An error has occurred: ' + error.message

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">My Wardrobe</h1>
      <p className="text-center text-muted-foreground mb-6">
        Total Items:{' '}
        <span className="font-semibold">
          {isLoading ? '...' : data.total}
        </span>
      </p>
    </div>
  )
}
