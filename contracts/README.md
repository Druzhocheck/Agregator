# Copy Trading Vault (Avalanche)

Смарт-контракт для депозита и вывода USDC в рамках copy-trading на Avalanche.

## Сборка (Foundry)

Установите [Foundry](https://book.getfoundry.sh/getting-started/installation), затем:

```bash
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge build
```

## Альтернатива: Remix IDE

1. Откройте [remix.ethereum.org](https://remix.ethereum.org)
2. Создайте файл `CopyTradingVault.sol` и вставьте код
3. В NPM Module Manager добавьте `@openzeppelin/contracts`
4. Скомпилируйте и задеплойте, передав в конструктор адрес USDC: `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`

## Деплой

USDC на Avalanche C-Chain: `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`

```bash
forge create contracts/CopyTradingVault.sol:CopyTradingVault \
  --rpc-url https://api.avax.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY \
  --constructor-args 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E
```

## Деплой

Адрес контракта (Avalanche C-Chain): `0xC85f003E34Aa97d7e6e1646ab4FaE44857E8f065`

- [Snowtrace](https://snowtrace.io/address/0xC85f003E34Aa97d7e6e1646ab4FaE44857E8f065)

## API

- `deposit(uint256 amount)` — внести USDC (6 decimals)
- `withdraw(uint256 amount)` — вывести USDC
- `balanceOf(address user)` — баланс пользователя
- `totalSupply()` — общий объём USDC в контракте
