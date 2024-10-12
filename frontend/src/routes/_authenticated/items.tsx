import { createFileRoute } from '@tanstack/react-router'
import { getAllItemsQueryOptions, loadingCreateItemQueryOptions, deleteItem } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Trash } from 'lucide-react'

import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/items')({
  component: Items,
})

function Items() {
  const { isPending, error, data } = useQuery(getAllItemsQueryOptions)
  const { data: loadingCreateItem } = useQuery(loadingCreateItemQueryOptions);

  if (isPending) return 'Loading...'

  if (error) return 'An error has occurred: ' + error.message
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">My Wardrobe</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loadingCreateItem?.item && <LoadingSkeleton />}
        {isPending
          ? 'Loading...'
          : data.items.map((item) => (
              <Card key={item.id} className="flex flex-col overflow-hidden">
                <CardHeader className="p-0">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-48 object-cover"
                  />
                </CardHeader>
                <CardContent className="flex-grow p-4">
                  <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{item.color}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.type}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-end">
                  <ItemDeleteButton id={item.id} name={item.name} />
                </CardFooter>
              </Card>
            ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="p-0">
        <Skeleton className="w-full h-48" />
      </CardHeader>
      <CardContent className="flex-grow p-4">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-end">
        <Skeleton className="h-8 w-8" />
      </CardFooter>
    </Card>
  )
}

function ItemDeleteButton({ id, name }: { id: number; name: string | null }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: deleteItem,

    onError: () => {
      toast('An error occurred', {
        description: `Failed to delete item: ${name}`
      }
      )
    },
    onSuccess: () => {
      toast('Item deleted', {
        description: `Item was successfully deleted: ${name}`
      })

      queryClient.setQueryData(getAllItemsQueryOptions.queryKey, (existingItems) => ({
        ...existingItems,
        items: existingItems!.items.filter((item) => item.id !== id),
      }));
    },

  })

  return (
    <Button 
      disabled={mutation.isPending}
      variant="outline" 
      size="icon"
      onClick={() => mutation.mutate({ id })}
    >
      {mutation.isPending ? '...' : <Trash className="h-4 w-4"/>}
    </Button>
  );
}
