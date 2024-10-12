import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { type QueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

import { SVGProps } from 'react';
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: Root,
});

function NavBar() {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800">
      <Link to="/" className="flex items-center gap-2">
        <MountainIcon className="h-6 w-6" />
        <span className="text-lg font-semibold">Stylify</span>
      </Link>
      <div className="hidden md:flex gap-4">
        <Link to="/" className="text-lg font-medium hover:underline underline-offset-4" >
          Home
        </Link>
        <Link to="/about" className="text-lg font-medium hover:underline underline-offset-4" >
          About
        </Link>
        <Link to="/items" className="text-lg font-medium hover:underline underline-offset-4">
          Items
        </Link>
        <Link to="/create-item" className="text-lg font-medium hover:underline underline-offset-4">
          Create
        </Link>
        <Link to="/profile" className="text-lg font-medium hover:underline underline-offset-4">
          Profile
        </Link>
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <MenuIcon className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <div className="grid w-[200px] p-4">
            <Link to="/" className="text-lg font-medium hover:underline underline-offset-4">
              Home
            </Link>
            <Link to="/about" className="text-lg font-medium hover:underline underline-offset-4">
              About
            </Link>
            <Link to="/items" className="text-lg font-medium hover:underline underline-offset-4">
              Items
            </Link>
            <Link to="/create-item" className="text-lg font-medium hover:underline underline-offset-4">
              Create
            </Link>
            <Link to="/profile" className="text-lg font-medium hover:underline underline-offset-4">
              Profile
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
    // return (
    //     <div className="p-2 flex gap-2">
    //     <Link to="/" className="[&.active]:font-bold">
    //       Home
    //     </Link>{' '}
    //     <Link to="/about" className="[&.active]:font-bold">
    //       About
    //     </Link>
    //     <Link to="/items" className="[&.active]:font-bold">
    //       Items
    //     </Link>
    //     <Link to="/create-item" className="[&.active]:font-bold">
    //       Create
    //     </Link>
    //     <Link to="/profile" className="[&.active]:font-bold">
    //       Profile
    //     </Link>
    //   </div>
    // )


function Root() {
    return (
        <>
            <NavBar />
            <hr />
            <Outlet />
            <Toaster />
            {/* <TanStackRouterDevtools /> */}
        </>
    )
}


function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  )
}

function MountainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  )
}