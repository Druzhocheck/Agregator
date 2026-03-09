import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Settings, LogOut } from 'lucide-react'
import { useAccount } from 'wagmi'

const hasNotifications = false

export function ProfileDropdown() {
  const [open, setOpen] = useState(false)
  const { isConnected } = useAccount()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-10 h-10 rounded-full bg-bg-tertiary border border-white/10 hover:border-accent-violet/40 transition-all duration-200"
      >
        <User className="w-5 h-5 text-text-body" />
        {hasNotifications && (
          <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-status-error border-2 border-bg-secondary" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-panel bg-bg-secondary/95 backdrop-blur-panel border border-white/10 shadow-xl py-1">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-small text-text-body hover:bg-white/5"
            >
              <User className="w-4 h-4" />
              Profile
            </Link>
            <Link
              to="/profile#copy-trading"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-small text-text-body hover:bg-white/5"
            >
              Copy Trading Vault
            </Link>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-small text-text-body hover:bg-white/5"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            {isConnected && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-small text-status-error hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
