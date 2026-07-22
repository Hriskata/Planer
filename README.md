# Планер

Self-hosted task manager за 2-4 потребители. Node.js + Express + вграден SQLite (`node:sqlite`) + JWT автентикация, Svelte + Vite PWA frontend.

Пълната пътна карта (всички етапи, обосновка на решенията) е в [task-app-project-brief.md](task-app-project-brief.md). Този README покрива това, което е готово в момента — backend (Етап 2) и frontend (Етап 3).

## Backend

### Изисквания

- Node.js **>= 22.5** (`node:sqlite` е вграден модул, без native compile стъпка — работи еднакво на Windows, Linux и в Docker)

### Setup

```bash
cd backend
npm install
cp .env.example .env
```

Отвори `.env` и задай истински `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Създай потребител (няма публичен `/register` endpoint нарочно — акаунтите се управляват ръчно, виж брифа за причината):

```bash
npm run seed -- alice password123
```

Стартирай в dev режим (auto-reload с nodemon):

```bash
npm run dev
```

Сървърът слуша на `http://localhost:3000` (порт от `.env` → `PORT`).

### API

Всички endpoints са под `/api`. `/api/tasks/*` изискват `Authorization: Bearer <token>`.

| Метод  | Път                    | Описание                                  |
|--------|------------------------|--------------------------------------------|
| POST   | `/api/auth/login`      | `{ username, password }` → `{ token, user }` |
| GET    | `/api/tasks?date=...` или `?from=...&to=...` | Списък задачи (собствени + споделени); `date` е точна дата, `from`/`to` е диапазон (вкл.) — и двата по избор, формат `YYYY-MM-DD` |
| POST   | `/api/tasks`           | Създава задача                             |
| PUT    | `/api/tasks/:id`       | Частична редакция (само собственик)        |
| DELETE | `/api/tasks/:id`       | Изтриване (само собственик)                |

### Пример с curl

```bash
# Логин
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}' | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).token)")

# Създаване на задача
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Купи хляб","date":"2026-07-21","time":"18:00"}'

# Списък задачи за дата
curl "http://localhost:3000/api/tasks?date=2026-07-21" -H "Authorization: Bearer $TOKEN"
```

### Бележки

- CORS се включва само ако е зададен `CORS_ORIGIN` в `.env` — не е задължителен за нормалния dev workflow, защото Vite dev сървърът препраща `/api` заявките директно (виж по-долу). В production същият Express сървър сервира build-натия frontend от `frontend/dist`, така че CORS остава изключен изцяло.
- SQLite файлът е на `DB_PATH` (по подразбиране `backend/data/tasks.db`) — не се качва в git.

## Frontend

Svelte 5 + Vite + `vite-plugin-pwa` (manifest.json + Service Worker се генерират автоматично, вместо да се пишат на ръка).

```bash
cd frontend
npm install
npm run dev
```

Отваря се на `http://localhost:5173`. Vite препраща всички `/api/*` заявки към backend-а на `http://localhost:3000` (виж `server.proxy` в `vite.config.js`) — затова backend-ът трябва да е стартиран паралелно (`cd backend && npm run dev`), но не е нужен CORS в dev.

### Какво е готово

- Логин екран (JWT се пази в `localStorage`, валиден 30 дни — виж бекенд бележките)
- Изглед по ден, седмица (списък с постове за деня, без часова мрежа) и месец, навигация напред/назад/днес; клик на ден в месечния изглед превключва към дневния
- Съботите и неделите са оцветени в светлосиво в седмичния и месечния изглед
- Създаване, редакция, отмятане като завършена, изтриване и **копиране** на задача (клиент, заглавие, тип пост, дата, час на стъпки от 15 мин, копи текст, снимка, "споделена")
- Цветово кодиране по тип на поста (Reel/Post/Story/Carrousel — фиксирани цветове в `frontend/src/lib/colors.js`) — видимо в дневния списък (лента отляво), седмичния и месечния изглед
- Филтри по клиент и тип пост (падащи менюта, комбинират се) плюс свободен текст в заглавие/копи
- Офлайн resilience: последно заредените задачи се кешират в `localStorage`; при загубена връзка се показват кешираните данни с банер "Няма връзка". Промени (създаване/редакция/изтриване) офлайн връщат грешка вместо да се опашкуват — пълна двупосочна синхронизация е извън обхвата на MVP.
- PWA: `manifest.webmanifest` + Service Worker се генерират от `vite-plugin-pwa` (иконите в `frontend/public/icons/` са временни placeholder-и — смени ги с истинско лого, когато имаш такова)

### Production build

```bash
npm run build
```

Създава `frontend/dist/`, който backend-ът (`backend/src/app.js`) автоматично засича и сервира от същия origin — вижда се веднага след build, без допълнителна настройка.

## Desktop Widget

`desktop-widget/` — малко Electron приложение, always-on-top панел с днешните задачи,
за да не се отваря цялото приложение всеки път. Виж `desktop-widget/README.md`.

## Deployment (Docker Compose + Cloudflare Tunnel)

Един `Dockerfile` в корена (multi-stage: build-ва frontend-а, после го копира в backend runtime-а) — в production backend-ът сервира и API-то, и статичния frontend от един процес/контейнер, без нужда от CORS.

### Локално стартиране на целия стек

```bash
cp .env.example .env
```

Отвори `.env` и задай истински `JWT_SECRET` (същия начин като при `backend/.env.example`). `TUNNEL_TOKEN` остава празен, докато не стигнеш до секцията за Cloudflare Tunnel по-долу.

```bash
docker compose build app
docker compose up -d app
```

(Ако името на директорията съдържа кирилица или други non-ASCII символи, Docker Compose не може да изведе валидно име на проекта автоматично — добави `-p <име>`, напр. `docker compose -p planer up -d app`.)

Първо стартиране — създай потребител вътре в контейнера:

```bash
docker compose exec app npm run seed -- alice password123
```

Приложението е достъпно на `http://localhost:3000`. SQLite файлът се пази в named volume (`planer-data`), така че данните оцеляват при пресъздаване на контейнера (`docker compose restart`, `docker compose up --build` и т.н.).

### Cloudflare Tunnel (за достъп отвън, без port forwarding)

Все още не е конфигуриран — изисква домейн, добавен към Cloudflare (безплатен план е достатъчен). Стъпки за когато си готов:

1. Добави домейна си в Cloudflare (Dashboard → Add a site) и смени nameservers-ите на домейна към тези, които Cloudflare ти даде.
2. Zero Trust Dashboard → Networks → Tunnels → Create a tunnel → избери "Cloudflared" → дай му име (напр. `planer`).
3. При избор на "Docker" като connector, Cloudflare ще ти покаже команда с токен във флага `--token` — копирай само стойността на токена.
4. В същия tunnel setup, добави Public Hostname: домейн/поддомейн по избор (напр. `planer.твоя-домейн.com`) → Service: `HTTP` → `app:3000` (`app` е името на service-а от `docker-compose.yml`, вижда се от `cloudflared` контейнера през вътрешната Docker мрежа — не се пише `localhost`).
5. Сложи токена в `.env` → `TUNNEL_TOKEN=...`.
6. Стартирай tunnel service-а:

   ```bash
   docker compose up -d cloudflared
   ```

7. Отвори `https://<твоя-поддомейн>` от телефон — трябва да видиш логин екрана с валиден HTTPS сертификат (нужен за PWA инсталация, виж брифа).

### Бекъпи

`backend/src/backup.js` прави консистентен snapshot на базата през `VACUUM INTO` (безопасно докато сървърът работи — за разлика от directно копиране на `.db` файла, което може да хване частично записана страница). Пази последните 14 бекъпа, по-старите се трият автоматично.

```bash
docker compose exec app npm run backup
```

Файловете излизат в `./backups/` (host папка, bind-mount, не вътре в `planer-data` volume-а — така при проблем с основния volume бекъпите остават достъпни). Копирай `./backups/` към външен диск или облак по свой избор за истинска offsite защита — това остава ръчна стъпка, извън обхвата на проекта.

За автоматично планиране, на реалната Linux машина (Етап 1) добави в `crontab -e`:

```cron
0 3 * * * cd /path/to/planer && docker compose exec -T app npm run backup >> /var/log/planer-backup.log 2>&1
```

### Бележки

- Портът `3000:3000` в `docker-compose.yml` е публикуван само за локално тестване/дебъг — не изисква и не разчита на отваряне на порт на рутера; достъпът отвън минава изцяло през `cloudflared`.
