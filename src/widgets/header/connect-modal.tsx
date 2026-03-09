import { useState } from 'react'
import { useConnect, useAccount } from 'wagmi'

export function useConnectModal() {
  const [open, setOpen] = useState(false)
  const { connectors, connect, isPending } = useConnect()
  useAccount()

  const openConnectModal = () => setOpen(true)
  const close = () => setOpen(false)

  const ConnectModal = () => (
    <>
      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden />
          <div className="relative flex min-h-[100dvh] items-center justify-center py-8">
            <div className="w-full max-w-md rounded-panel-lg bg-bg-secondary border border-white/10 shadow-xl p-6">
            <h2 className="text-h3 text-text-primary mb-4">Connect Wallet</h2>
            <div className="space-y-2">
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  disabled={isPending}
                  onClick={() => connect({ connector: c }, { onSuccess: close })}
                  className="w-full flex items-center gap-3 h-12 px-4 rounded-panel bg-bg-tertiary border border-white/10 hover:border-accent-violet/50 hover:bg-white/5 transition-all duration-200 text-left text-body"
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={close}
              className="mt-4 w-full py-2 text-small text-text-muted hover:text-text-body"
            >
              Cancel
            </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return { openConnectModal, ConnectModal }
}
