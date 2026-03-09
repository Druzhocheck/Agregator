# Ave Onboarding Backend (dev)

Lightweight local backend for Polymarket onboarding flow.

## Run

1. Install deps:
   - `cd backend`
   - `npm install`
2. Start server:
   - `npm run dev`
3. Start frontend in project root:
   - `npm run dev`

Frontend calls `/api/onboard/*` and Vite proxies to `http://localhost:3001`.

## Endpoints

- `GET /onboard/status?eoa=0x...`
- `GET /onboard/requirements?eoa=0x...`
- `GET /onboard/sign-payload?eoa=0x...&chainId=137`
- `POST /onboard/create`
- `POST /onboard/unlink`

Notes:
- This is a dev baseline and stores credentials in memory only.
- Proxy deploy/register via relayer is supported when env vars are set (см. ниже).

---

## Переменные окружения (Relayer + Builder API)

Чтобы кнопка «Привязать» могла создавать proxy-кошелёк без захода пользователя на polymarket.com, нужны переменные окружения. Пошагово:

### Шаг 1. RELAYER_URL

**Откуда взять:** это публичный URL релейера Polymarket, его не нужно «получать» — просто подставь значение.

**Значение:**
```env
RELAYER_URL=https://relayer-v2.polymarket.com/
```

Слэш в конце допустим (backend обрезает его при необходимости). Менять не нужно, если Polymarket не объявит другой URL.

---

### Шаг 2. Builder API ключ (BUILDER_API_KEY, BUILDER_SECRET, BUILDER_PASSPHRASE)

**Откуда взять:** из раздела Builder в настройках аккаунта на Polymarket.

1. Зайди на **https://polymarket.com** и войди в аккаунт (подключи кошелёк).
2. Открой настройки:
   - либо по прямой ссылке: **https://polymarket.com/settings?tab=builder**  
   - либо: клик по аватару → пункт **«Builders»** (Builders).
3. В блоке **«Builder Keys»** нажми **«+ Create New»** (создать новый ключ).
4. После создания тебе покажут **три значения** (один раз):
   - **key** (публичный идентификатор) → в `.env` как `BUILDER_API_KEY`
   - **secret** (секретный ключ) → как `BUILDER_SECRET`
   - **passphrase** → как `BUILDER_PASSPHRASE`
5. **Сразу скопируй и сохрани** secret и passphrase — в интерфейсе они больше не отображаются. Если потерял — придётся создать новый ключ.

**Ограничения:** для релейера и gasless-транзакций нужен доступ к [Builder Program](https://docs.polymarket.com/builders/api-keys) (лимиты по тиру: Unverified / Verified / Partner). При превышении лимита нужно ждать сброса или связаться с Polymarket для апгрейда тира.

---

### Шаг 3. Добавить переменные в проект

1. В папке **backend** создай файл **`.env`** (если его ещё нет).
2. Скопируй шаблон из **`.env.example`**:
   - в корне backend: `cp .env.example .env` (или скопируй содержимое вручную).
3. Открой **`.env`** и заполни:

```env
RELAYER_URL=https://relayer-v2.polymarket.com/

BUILDER_API_KEY=твой_key_из_полимаркета
BUILDER_SECRET=твой_secret_из_полимаркета
BUILDER_PASSPHRASE=твой_passphrase_из_полимаркета
```

4. Сохрани файл. Убедись, что **`.env`** добавлен в **`.gitignore`**, чтобы ключи не попали в репозиторий.

---

### Шаг 4. Запуск backend с переменными

- Backend при старте подгружает переменные из **`backend/.env`** (через `dotenv`). После `npm install` и заполнения `.env` просто запусти `npm run dev` в папке `backend`.
- После перезапуска эндпоинт `/onboard/relayer-config` (или логи при старте) покажет, что relayer настроен (`canDeployProxy: true`), если все четыре переменные заданы.

---

### Краткая сводка

| Переменная           | Откуда взять | Обязательна для deploy proxy |
|----------------------|--------------|------------------------------|
| `RELAYER_URL`        | Константа (см. выше) | Да  |
| `BUILDER_API_KEY`    | polymarket.com/settings?tab=builder → Create New | Да  |
| `BUILDER_SECRET`     | Там же, показывается один раз      | Да  |
| `BUILDER_PASSPHRASE` | Там же, показывается один раз      | Да  |

Без них backend работает для онбординга по уже существующему proxy (derive/create API key), но не может сам разворачивать новый proxy через relayer.
