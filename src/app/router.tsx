import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './layout'
import { MarketsPage } from '@/pages/markets'
import { MarketDetailPage } from '@/pages/market-detail'
import { ProfilePage } from '@/pages/profile'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <MarketsPage /> },
      { path: 'market/:marketSlug', element: <MarketDetailPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
])

export function AppRouter() {
  return (
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true }}
    />
  )
}
