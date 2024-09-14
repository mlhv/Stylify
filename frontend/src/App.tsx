import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from "@/components/ui/badge"
import './App.css'
import { useEffect, useState } from 'react';

import { api } from '@/lib/api'

function App() {
  const wardrobeItems = [
    {
      id: 1,
      name: "White T-Shirt",
      type: "shirt",
      color: "White",
      image: "/placeholder.svg?height=200&width=200",
    },
    {
      id: 2,
      name: "Blue Jeans",
      type: "pants",
      color: "Blue",
      image: "/placeholder.svg?height=200&width=200",
    },
    {
      id: 3,
      name: "Gray Sweater",
      type: "sweater",
      color: "Gray",
      image: "/placeholder.svg?height=200&width=200",
    },
    {
      id: 4,
      name: "Black Leather Jacket",
      type: "jacket",
      color: "Black",
      image: "/placeholder.svg?height=200&width=200",
    },
  ]
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    async function fetchTotalItems() {
      const res = await api.wardrobe["total-clothes"].$get();
      const data = await res.json();
      setTotalItems(data.totalClothes);
    }
    fetchTotalItems();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">My Wardrobe</h1>
      <p className="text-center text-muted-foreground mb-6">
        Total Items: <span className="font-semibold">{totalItems}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {wardrobeItems.map((item) => (
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

export default App
