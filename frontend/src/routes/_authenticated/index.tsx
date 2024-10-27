import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  getAllItemsQueryOptions,
  loadingCreateItemQueryOptions,
  getTotalClothesQueryOptions,
  deleteItem,
} from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Trash, Edit2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/')({
  component: Items,
})

function Items() {
  const [selectedItem, setSelectedItem] = useState<number | null>(null)
  const { isPending, error, data } = useQuery(getAllItemsQueryOptions)
  const { data: loadingCreateItem } = useQuery(loadingCreateItemQueryOptions)
  const { isLoading, data: total } = useQuery(getTotalClothesQueryOptions)
  const navigate = useNavigate()

  if (isPending) return 'Loading...'
  if (error) return 'An error has occurred: ' + error.message

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Wardrobe</h1>
        <Button 
          onClick={() => navigate({ to: '/create-item' })}
          className="bg-primary hover:bg-primary/90"
        >
          Add New Item
        </Button>
      </div>
      <p className="text-center text-muted-foreground mb-6">
        Total Items: <span className="font-semibold">{isLoading ? '...' : total?.total}</span>
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loadingCreateItem?.item && <LoadingSkeleton />}
        <AnimatePresence>
          {data.items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Card 
                className={`group relative flex flex-col overflow-hidden transition-all duration-200 hover:shadow-lg ${
                  selectedItem === item.id ? 'ring-2 ring-primary' : ''
                }`}
              >
                <CardHeader className="p-0 relative">
                  <img
                    src={item.imageUrl || '/api/placeholder/400/320'}
                    alt={item.name}
                    className="w-full h-48 object-cover"
                  />
                  {/* Edit/Close button - always visible on mobile, visible on hover/select on desktop */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="bg-black backdrop-blur-sm hover:bg-grey-900"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedItem(selectedItem === item.id ? null : item.id)
                      }}
                    >
                      {selectedItem === item.id ? (
                        <X className="h-4 w-4" />
                      ) : (
                        <Edit2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-grow p-4">
                  <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{item.color}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.type}
                    </Badge>
                    <Badge variant="outline">{item.size}</Badge>
                  </div>
                </CardContent>

                <AnimatePresence>
                  {selectedItem === item.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CardFooter className="p-4 flex justify-between gap-2 border-t">
                        <Button
                          variant="default"
                          className="flex-1"
                          onClick={() => navigate({ to: `/edit-item/${item.id}` })}
                        >
                          Edit Details
                        </Button>
                        <ItemDeleteButton id={item.id} name={item.name} />
                      </CardFooter>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
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
        description: `Failed to delete item: ${name}`,
      })
    },
    onSuccess: async () => {
      toast('Item deleted', {
        description: `Item was successfully deleted: ${name}`,
      })

      const currentTotal = await queryClient.ensureQueryData(getTotalClothesQueryOptions)

      queryClient.setQueryData(
        getAllItemsQueryOptions.queryKey,
        (existingItems: any) => ({
          ...existingItems,
          items: existingItems.items.filter((item: any) => item.id !== id),
        }),
      )

      queryClient.setQueryData(getTotalClothesQueryOptions.queryKey, {
        ...currentTotal,
        total: currentTotal.total - 1,
      })
    },
  })

  return (
    <Button
      variant="outline"
      size="icon"
      className="hover:bg-destructive hover:text-destructive-foreground"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.stopPropagation()
        mutation.mutate({ id })
      }}
    >
      {mutation.isPending ? (
        <span className="h-4 w-4 animate-spin">...</span>
      ) : (
        <Trash className="h-4 w-4" />
      )}
    </Button>
  )
}

export default Items