import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from './connect-modal'

function truncateAddress(addr: string) {
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function avatarLetters(addr: string) {
  return addr.slice(2, 4).toUpperCase()
}

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const { openConnectModal, ConnectModal } = useConnectModal()

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          onClick={openConnectModal}
          className="h-10 px-4 rounded-panel bg-accent-violet hover:bg-accent-violet/90 text-text-primary font-medium text-small transition-all duration-200"
        >
          Connect Wallet
        </button>
        <ConnectModal />
      </>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-10 px-3 rounded-panel bg-bg-tertiary/80 border border-white/10 hover:border-status-success/50 hover:bg-white/5 transition-all duration-200"
      >
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center text-tiny font-mono font-medium bg-gradient-to-br from-accent-violet to-accent-blue text-white"
          title={address}
        >
          {avatarLetters(address)}
        </span>
        <span className="text-small font-mono text-text-body">{truncateAddress(address)}</span>
        <ChevronDown className="w-4 h-4 text-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-panel bg-bg-secondary/95 backdrop-blur-panel border border-white/10 shadow-xl py-1">
            <div className="px-3 py-2 font-mono text-tiny text-text-muted break-all">{address}</div>
            <button
              type="button"
              onClick={() => {
                disconnect()
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-small text-status-error hover:bg-white/5"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
