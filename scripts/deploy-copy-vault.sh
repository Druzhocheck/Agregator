#!/bin/bash
# Deploy CopyTradingVault to Avalanche C-Chain
# Usage: PRIVATE_KEY=0x... ./scripts/deploy-copy-vault.sh

USDC_AVALANCHE="0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
RPC="https://api.avax.network/ext/bc/C/rpc"

forge create contracts/CopyTradingVault.sol:CopyTradingVault \
  --rpc-url "$RPC" \
  --private-key "${PRIVATE_KEY}" \
  --constructor-args "$USDC_AVALANCHE"
