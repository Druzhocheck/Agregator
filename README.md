# Dreams — Prediction Markets Aggregator

Aggregator for prediction market protocols (Polymarket, Opinion, Limitless and others) with trading UI, orderbook, profile, trading/research tools and deposits/withdrawals.

## Stack

- **React 18** + **TypeScript**
- **Vite** — build and dev server
- **Tailwind CSS** — design system (dark theme, glassmorphism, purple/blue accents)
- **Wagmi + Viem** — wallet and chain (Avalanche, Polygon, Gnosis)
- **TanStack Query** — server state and caching
- **React Router** — routing

## Design

- Dark theme: `#0f172a` / `#1e293b` background, violet `#8b5cf6`, blue `#3b82f6`, pink `#ec4899`
- Glassmorphism: `backdrop-blur`, semi-transparent panels, thin borders
- Typography: Inter / Plus Jakarta Sans, JetBrains Mono for numbers and addresses
- Custom scrollbars, 12–16px radius, 200–300ms transitions

## Structure (FSD-style)

- `app/` — layout, router, providers
- `pages/` — markets, market detail, profile
- `widgets/` — header, sidebars, orderbook, order form, featured, grid, activity
- `features/` — search, deposit/withdraw modals
- `entities/` — market/event types
- `shared/` — api (Polymarket Gamma/CLOB/Data), config, lib (cn), WebSocket stub

## Platform APIs

- **Gamma** (`gamma-api.polymarket.com`): events, markets, search, tags
- **CLOB** (`clob.polymarket.com`): orderbook (`/book?token_id=...`), order submission (auth)
- **Data** (`data-api.polymarket.com`): leaderboard, positions, trades
- **WebSocket** (`ws-subscriptions-clob.polymarket.com/ws/market`): real-time book and trades

### Predict (Mainnet, read-only in this release)

- **REST** (`api.predict.fun`): markets, market by id, orderbook
- **WS** (`ws.predict.fun/ws`): available for future streaming integration
- Unified event merge uses:
  - strict `conditionId` (`Polymarket`) <-> `polymarketConditionIds` (`Predict`),
  - Predict `categorySlug` grouping for multi-outcome events,
  - heuristic title/outcome overlap fallback.

## Scripts

```bash
npm install
npm run dev    # http://localhost:5173
npm run build
npm run preview
```

Backend smoke scripts:

```bash
cd backend
npm run smoke:predict
npm run smoke:merge
```
