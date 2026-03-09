import { parseUnits, formatUnits, maxUint256 } from 'viem'
import {
  useReadContract,
  useWriteContract,
  useAccount,
  useChainId,
  useSwitchChain,
} from 'wagmi'
import {
  COPY_TRADING_VAULT_ADDRESS,
  USDC_AVALANCHE,
  AVALANCHE_CHAIN_ID,
  COPY_TRADING_VAULT_ABI,
  ERC20_APPROVE_ABI,
} from '@/shared/config/copy-trading-vault'

/**
 * Hook for Copy Trading Vault on Avalanche: balance, deposit, withdraw.
 */
export function useCopyTradingVault() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const isAvalanche = chainId === AVALANCHE_CHAIN_ID

  const { data: vaultBalanceRaw, refetch: refetchVaultBalance } = useReadContract({
    address: COPY_TRADING_VAULT_ADDRESS as `0x${string}`,
    abi: COPY_TRADING_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: AVALANCHE_CHAIN_ID,
  })

  const { data: allowanceRaw } = useReadContract({
    address: USDC_AVALANCHE as `0x${string}`,
    abi: ERC20_APPROVE_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, COPY_TRADING_VAULT_ADDRESS as `0x${string}`] : undefined,
    chainId: AVALANCHE_CHAIN_ID,
  })

  const { writeContractAsync: writeApprove } = useWriteContract()
  const { writeContractAsync: writeDeposit } = useWriteContract()
  const { writeContractAsync: writeWithdraw } = useWriteContract()

  const vaultBalance =
    vaultBalanceRaw != null ? Number(formatUnits(vaultBalanceRaw, 6)) : 0
  const allowance = allowanceRaw != null ? allowanceRaw : 0n

  const ensureAvalanche = async () => {
    if (chainId === AVALANCHE_CHAIN_ID) return true
    if (!switchChainAsync) return false
    try {
      await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID })
      return true
    } catch {
      return false
    }
  }

  const approve = async () => {
    const ok = await ensureAvalanche()
    if (!ok) throw new Error('Switch to Avalanche to approve')
    await writeApprove({
      address: USDC_AVALANCHE as `0x${string}`,
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [COPY_TRADING_VAULT_ADDRESS as `0x${string}`, maxUint256],
      chainId: AVALANCHE_CHAIN_ID,
    })
    refetchVaultBalance()
  }

  const deposit = async (amountUsdc: number) => {
    if (amountUsdc <= 0) throw new Error('Amount must be positive')
    const ok = await ensureAvalanche()
    if (!ok) throw new Error('Switch to Avalanche to deposit')
    const amountWei = parseUnits(amountUsdc.toFixed(6), 6)
    if (allowance < amountWei) {
      throw new Error('Approve USDC first. Click Approve and wait for confirmation.')
    }
    await writeDeposit({
      address: COPY_TRADING_VAULT_ADDRESS as `0x${string}`,
      abi: COPY_TRADING_VAULT_ABI,
      functionName: 'deposit',
      args: [amountWei],
      chainId: AVALANCHE_CHAIN_ID,
    })
    refetchVaultBalance()
  }

  const withdraw = async (amountUsdc: number) => {
    if (amountUsdc <= 0) throw new Error('Amount must be positive')
    const ok = await ensureAvalanche()
    if (!ok) throw new Error('Switch to Avalanche to withdraw')
    const amountWei = parseUnits(amountUsdc.toFixed(6), 6)
    await writeWithdraw({
      address: COPY_TRADING_VAULT_ADDRESS as `0x${string}`,
      abi: COPY_TRADING_VAULT_ABI,
      functionName: 'withdraw',
      args: [amountWei],
      chainId: AVALANCHE_CHAIN_ID,
    })
    refetchVaultBalance()
  }

  const switchToAvalanche = async () => {
    if (!switchChainAsync) return false
    try {
      await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID })
      return true
    } catch {
      return false
    }
  }

  return {
    vaultBalance,
    allowance: allowanceRaw != null ? Number(formatUnits(allowanceRaw, 6)) : 0,
    isAvalanche,
    isConnected,
    address,
    approve,
    deposit,
    withdraw,
    switchToAvalanche,
    refetchVaultBalance,
  }
}
