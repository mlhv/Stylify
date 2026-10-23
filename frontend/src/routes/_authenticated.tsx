import { userQueryOptions } from '@/lib/api'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppHeader } from '@/components/app/AppHeader'
import { Landing } from '@/components/landing/Landing'

const Component = () => {
  const { user } = Route.useRouteContext()
  if (!user) {
    return <Landing />
  }
    
  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  )
};

// src/routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const queryClient = context.queryClient

    try {
      const data = await queryClient.fetchQuery(userQueryOptions)
      return data
    } catch (e) {
      return { user: null}
    }
  },
  component: Component,
});


