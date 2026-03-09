import { Outlet } from 'react-router-dom'
import { Header } from '@/widgets/header'

export function Layout() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
