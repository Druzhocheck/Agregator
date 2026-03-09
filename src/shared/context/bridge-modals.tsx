import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type ModalKind = 'deposit' | 'withdraw' | null

interface BridgeModalsContextValue {
  openModal: ModalKind
  openDeposit: () => void
  openWithdraw: () => void
  closeModal: () => void
}

const BridgeModalsContext = createContext<BridgeModalsContextValue | null>(null)

export function BridgeModalsProvider({ children }: { children: ReactNode }) {
  const [openModal, setOpenModal] = useState<ModalKind>(null)
  const openDeposit = useCallback(() => setOpenModal('deposit'), [])
  const openWithdraw = useCallback(() => setOpenModal('withdraw'), [])
  const closeModal = useCallback(() => setOpenModal(null), [])

  return (
    <BridgeModalsContext.Provider
      value={{ openModal, openDeposit, openWithdraw, closeModal }}
    >
      {children}
    </BridgeModalsContext.Provider>
  )
}

export function useBridgeModals() {
  const ctx = useContext(BridgeModalsContext)
  if (!ctx) throw new Error('useBridgeModals must be used within BridgeModalsProvider')
  return ctx
}
