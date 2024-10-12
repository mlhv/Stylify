import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { userQueryOptions } from '@/lib/api'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_authenticated/profile')({
  component: Profile,
})

function Profile() {
  const { isPending, error, data } = useQuery(userQueryOptions)

  if (isPending) return <ProfileSkeleton />

  if (error) return <ErrorState />

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-3xl mx-auto">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="w-20 h-20">
            {/* <AvatarImage src={data.user.picture} alt={data.user.given_name} /> */}
            <AvatarFallback>{getInitials(data.user.given_name, data.user.family_name)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-2xl">{data.user.given_name}</CardTitle>
            <p className="text-muted-foreground">{data.user.email}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <section>
              <h2 className="text-xl font-semibold mb-2">Profile Information</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">First Name</p>
                  <p>{data.user.given_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Name</p>
                  <p>{data.user.family_name}</p>
                </div>
                {/* <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p>{data.user.nickname}</p>
                </div> */}
                {/* <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p>{new Date(data.user.updated_at).toLocaleDateString()}</p>
                </div> */}
              </div>
            </section>
            <section>
              <h2 className="text-xl font-semibold mb-2">Recent Wardrobe Items</h2>
              <ul className="list-disc pl-5">
                <li>Blue Denim Jacket</li>
                <li>Black Leather Boots</li>
                <li>White Cotton T-Shirt</li>
                <li>Khaki Chino Pants</li>
              </ul>
            </section>
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline">Edit Profile</Button>
              <Button variant="destructive" asChild>
                <a href="/api/logout">Logout</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-3xl mx-auto">
        <CardHeader className="flex flex-row items-center gap-4">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-2 gap-4">
              {Array(4).fill(null).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2">
              {Array(4).fill(null).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="container mx-auto p-4 text-center">
      <h1 className="text-2xl font-bold mb-4">Oops! Something went wrong</h1>
      <p className="text-muted-foreground mb-4">You might not be logged in or there was an error fetching your profile.</p>
      <Button asChild>
        <a href="/api/login">Go to Login</a>
      </Button>
    </div>
  )
}

function getInitials(firstName: string, lastName: string) {
  const full_name = firstName + ' ' + lastName
  return full_name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
