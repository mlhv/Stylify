import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/lib/api'
import {
    useQuery,
  } from '@tanstack/react-query'
  import { Card, CardContent, CardHeader } from '@/components/ui/card'
  import { Badge } from "@/components/ui/badge"
  

export const Route = createFileRoute('/items')({
  component: Items,
})

async function getAllItems() {
    const res = await api.wardrobe.$get();
    if (!res.ok) {
      throw new Error("Network response was not ok");
    }
    const data = res.json();
    return data
  }

function Items() {
    const { isPending, error, data } = useQuery({ queryKey: ['get-all-items'], queryFn: getAllItems })

  if (isPending) return 'Loading...'

  if (error) return 'An error has occurred: ' + error.message
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">My Wardrobe</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isPending ? 'Loading...' : data.clothes.map((item) => (
          <Card key={item.id} className="flex flex-col overflow-hidden">
            <CardHeader className="p-0">
              <img
                src={item.image}
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
          </Card>
        ))}
      </div>
    </div>
  )
}
