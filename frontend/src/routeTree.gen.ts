/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as AboutImport } from './routes/about'
import { Route as AuthenticatedImport } from './routes/_authenticated'
import { Route as AuthenticatedIndexImport } from './routes/_authenticated/index'
import { Route as AuthenticatedProfileImport } from './routes/_authenticated/profile'
import { Route as AuthenticatedCreateItemImport } from './routes/_authenticated/create-item'
import { Route as AuthenticatedEditItemIdImport } from './routes/_authenticated/edit-item.$id'

// Create/Update Routes

const AboutRoute = AboutImport.update({
  path: '/about',
  getParentRoute: () => rootRoute,
} as any)

const AuthenticatedRoute = AuthenticatedImport.update({
  id: '/_authenticated',
  getParentRoute: () => rootRoute,
} as any)

const AuthenticatedIndexRoute = AuthenticatedIndexImport.update({
  path: '/',
  getParentRoute: () => AuthenticatedRoute,
} as any)

const AuthenticatedProfileRoute = AuthenticatedProfileImport.update({
  path: '/profile',
  getParentRoute: () => AuthenticatedRoute,
} as any)

const AuthenticatedCreateItemRoute = AuthenticatedCreateItemImport.update({
  path: '/create-item',
  getParentRoute: () => AuthenticatedRoute,
} as any)

const AuthenticatedEditItemIdRoute = AuthenticatedEditItemIdImport.update({
  path: '/edit-item/$id',
  getParentRoute: () => AuthenticatedRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/_authenticated': {
      id: '/_authenticated'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof AuthenticatedImport
      parentRoute: typeof rootRoute
    }
    '/about': {
      id: '/about'
      path: '/about'
      fullPath: '/about'
      preLoaderRoute: typeof AboutImport
      parentRoute: typeof rootRoute
    }
    '/_authenticated/create-item': {
      id: '/_authenticated/create-item'
      path: '/create-item'
      fullPath: '/create-item'
      preLoaderRoute: typeof AuthenticatedCreateItemImport
      parentRoute: typeof AuthenticatedImport
    }
    '/_authenticated/profile': {
      id: '/_authenticated/profile'
      path: '/profile'
      fullPath: '/profile'
      preLoaderRoute: typeof AuthenticatedProfileImport
      parentRoute: typeof AuthenticatedImport
    }
    '/_authenticated/': {
      id: '/_authenticated/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof AuthenticatedIndexImport
      parentRoute: typeof AuthenticatedImport
    }
    '/_authenticated/edit-item/$id': {
      id: '/_authenticated/edit-item/$id'
      path: '/edit-item/$id'
      fullPath: '/edit-item/$id'
      preLoaderRoute: typeof AuthenticatedEditItemIdImport
      parentRoute: typeof AuthenticatedImport
    }
  }
}

// Create and export the route tree

interface AuthenticatedRouteChildren {
  AuthenticatedCreateItemRoute: typeof AuthenticatedCreateItemRoute
  AuthenticatedProfileRoute: typeof AuthenticatedProfileRoute
  AuthenticatedIndexRoute: typeof AuthenticatedIndexRoute
  AuthenticatedEditItemIdRoute: typeof AuthenticatedEditItemIdRoute
}

const AuthenticatedRouteChildren: AuthenticatedRouteChildren = {
  AuthenticatedCreateItemRoute: AuthenticatedCreateItemRoute,
  AuthenticatedProfileRoute: AuthenticatedProfileRoute,
  AuthenticatedIndexRoute: AuthenticatedIndexRoute,
  AuthenticatedEditItemIdRoute: AuthenticatedEditItemIdRoute,
}

const AuthenticatedRouteWithChildren = AuthenticatedRoute._addFileChildren(
  AuthenticatedRouteChildren,
)

export interface FileRoutesByFullPath {
  '': typeof AuthenticatedRouteWithChildren
  '/about': typeof AboutRoute
  '/create-item': typeof AuthenticatedCreateItemRoute
  '/profile': typeof AuthenticatedProfileRoute
  '/': typeof AuthenticatedIndexRoute
  '/edit-item/$id': typeof AuthenticatedEditItemIdRoute
}

export interface FileRoutesByTo {
  '/about': typeof AboutRoute
  '/create-item': typeof AuthenticatedCreateItemRoute
  '/profile': typeof AuthenticatedProfileRoute
  '/': typeof AuthenticatedIndexRoute
  '/edit-item/$id': typeof AuthenticatedEditItemIdRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/_authenticated': typeof AuthenticatedRouteWithChildren
  '/about': typeof AboutRoute
  '/_authenticated/create-item': typeof AuthenticatedCreateItemRoute
  '/_authenticated/profile': typeof AuthenticatedProfileRoute
  '/_authenticated/': typeof AuthenticatedIndexRoute
  '/_authenticated/edit-item/$id': typeof AuthenticatedEditItemIdRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | ''
    | '/about'
    | '/create-item'
    | '/profile'
    | '/'
    | '/edit-item/$id'
  fileRoutesByTo: FileRoutesByTo
  to: '/about' | '/create-item' | '/profile' | '/' | '/edit-item/$id'
  id:
    | '__root__'
    | '/_authenticated'
    | '/about'
    | '/_authenticated/create-item'
    | '/_authenticated/profile'
    | '/_authenticated/'
    | '/_authenticated/edit-item/$id'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  AuthenticatedRoute: typeof AuthenticatedRouteWithChildren
  AboutRoute: typeof AboutRoute
}

const rootRouteChildren: RootRouteChildren = {
  AuthenticatedRoute: AuthenticatedRouteWithChildren,
  AboutRoute: AboutRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* prettier-ignore-end */

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/_authenticated",
        "/about"
      ]
    },
    "/_authenticated": {
      "filePath": "_authenticated.tsx",
      "children": [
        "/_authenticated/create-item",
        "/_authenticated/profile",
        "/_authenticated/",
        "/_authenticated/edit-item/$id"
      ]
    },
    "/about": {
      "filePath": "about.tsx"
    },
    "/_authenticated/create-item": {
      "filePath": "_authenticated/create-item.tsx",
      "parent": "/_authenticated"
    },
    "/_authenticated/profile": {
      "filePath": "_authenticated/profile.tsx",
      "parent": "/_authenticated"
    },
    "/_authenticated/": {
      "filePath": "_authenticated/index.tsx",
      "parent": "/_authenticated"
    },
    "/_authenticated/edit-item/$id": {
      "filePath": "_authenticated/edit-item.$id.tsx",
      "parent": "/_authenticated"
    }
  }
}
ROUTE_MANIFEST_END */
