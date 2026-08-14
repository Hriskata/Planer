# CLAUDE.md — Планер

Кратка ориентация за бъдещи сесии. Не е изчерпателна документация — за пълния roadmap виж `task-app-project-brief.md`, за admin/deploy стъпки `README.md`, за потребителски setup стъпки `handbook.md`.

## 1. Какво е проектът

Self-hosted календар/task manager за планиране на съдържание (Reel/Post/Story/Carrousel) — първоначално затворено семейно приложение за 2-4 души, в момента се разширява към публична регистрация (лендинг страница + Google Sign-In).

**Backend**: Node.js + Express, `node:sqlite` (вграден в Node >=22.5, **синхронен** API, без native compile стъпка), JWT auth, bcryptjs.
**Frontend**: Svelte 5 (руни: `$state`/`$derived`/`$effect`/`$props`, snippets — не Svelte 4 патърни), Vite, `vite-plugin-pwa` (injectManifest, custom `src/sw.js` заради push notifications).
**Интеграции**: `web-push` (VAPID, напомняния), `nodemailer` (per-user Gmail SMTP, не общ акаунт), `google-auth-library` (Sign in with Google), `helmet` (security headers).
**Deploy**: Docker (multi-stage Dockerfile, `docker-compose.yml`), Cloudflare Tunnel за външен достъп.

## 2. Структура

```
backend/src/
  app.js            Express app — helmet (CSP + COOP конфигурирани за Google popup), route mounting, SPA catch-all
  index.js          entry point — dotenv, fail-fast ако липсва JWT_SECRET
  db.js             SQLite connection + migrации (виж т.4)
  schema.sql        пълна схема (users, tasks, push_subscriptions, calendar_shares, library_assets)
  seed.js           CLI за създаване на username/password акаунти
  crypto.js         AES-256-GCM за Gmail App Password at rest
  email.js          per-user Gmail SMTP изпращане
  validators.js     споделени EMAIL_RE + normalizeEmail
  calendarAccess.js resolveViewedOwnerId — споделено между tasks.js и library.js
  notifications.js  push напомняния (setInterval, 30s)
  middleware/auth.js  requireAuth (JWT verify)
  routes/           auth, tasks, account, sharing, push, uploads, library

frontend/src/
  App.svelte        LandingPage → LoginView → MainView, по auth състояние
  lib/MainView.svelte   основната обвивка (header, page state calendar/library, филтри, изгледи, FAB, TaskForm modal)
  lib/TaskForm.svelte   create/edit/view modal (readOnly режим през <fieldset disabled>)
  lib/PostTile.svelte, WeekCalendar.svelte, MonthCalendar.svelte, BacklogColumn.svelte
  lib/SettingsMenu.svelte   Известия / Имейл подател / Споделяне на календар
  lib/CalendarSwitcher.svelte   header dropdown за превключване между календари (споделен и от LibraryPage)
  lib/LibraryPage.svelte   Асет библиотека — клиент sidebar, тип табове, upload modal
  lib/Icon.svelte      споделени Feather икони (SVG paths директно от feathericons.com)
  lib/api.js           всички backend извиквания + offline localStorage кеш
  lib/dragDrop.svelte.js   споделена pointer-based drag логика (.svelte.js за руни извън компонент)

desktop-widget/     отделно Electron приложение (собствен README.md)
```

## 3. Стартиране и тестване

**Няма автоматизиран тест suite.** Тестването досега е било ръчно: curl скриптове за backend + Playwright за frontend, срещу локално пуснат instance.

```bash
# Backend (dev)
cd backend && npm install && cp .env.example .env   # попълни JWT_SECRET, ENCRYPTION_KEY, GOOGLE_CLIENT_ID
npm run seed -- alice password123
npm run dev

# Frontend (dev, port 5173, проксира /api към localhost:3000)
cd frontend && npm install && npm run dev

# Пълен stack през Docker — задължително -p (Cyrillic име на директорията чупи auto project name)
docker compose -p planer up -d --build app
```

**Установен pattern за бързо локално тестване без да пипаш реалните Docker данни**: пускай backend directly (`cd backend && PORT=4001 ENCRYPTION_KEY=... node src/index.js`) — ползва `backend/data/tasks.db`, отделна база от Docker-ския named volume (`planer-data`). Свободно можеш да сееш/трошиш тестови данни там.

## 4. Ключови архитектурни решения

- **Auth**: JWT, 30 дни валидност, без refresh token (умишлено просто). Токен в `localStorage` (`planer_auth`).
- **Users**: `username` UNIQUE NOT NULL, `password_hash` NOT NULL дори за Google-only акаунти (случаен непозволен hash, не nullable колона). `email` е с двойна роля — И самоличност за calendar_shares съвпадение, И подателски адрес за completion имейли.
- **Няма публичен /register** исторически — акаунти през `npm run seed` CLI, сега и през Google Sign-In (по избор ограничено с `GOOGLE_ALLOWED_EMAILS`).
- **Миграции**: `schema.sql` използва `CREATE TABLE IF NOT EXISTS` (безопасно на всеки старт), но нови КОЛОНИ на съществуващи таблици изискват изричен `ALTER TABLE ADD COLUMN` loop в `db.js` — SQLite няма `IF NOT EXISTS` за колони.
- **Email изпращане**: per-user, не общ SMTP акаунт — всеки праща през своя Gmail App Password (криптиран). Hardcode-нато към `smtp.gmail.com:587`.
- **Две различни sharing механики съжителстват**: `tasks.shared` (булево, видимо за ВСИЧКИ потребители в инстанцията) vs. `calendar_shares` (targeted, по имейл, целия календар на притежателя).
- **`calendar_shares` дава различни права в различните фийчъри**: за задачи е строго read-only; за `library_assets` НЕ Е read-only — споделен потребител може да качва/преглежда/сваля, но да трие само собствените си качвания (`uploaded_by`), докато собственикът (`owner_id`) може да трие всичко в своята библиотека — умишлено различен модел от tasks sharing, не пропускай при бъдещи промени.
- **Read-only enforcement**: `<fieldset disabled={readOnly}>` в TaskForm (не per-field), `readOnly` prop прекаран през PostTile/WeekCalendar/MonthCalendar/BacklogColumn за checkbox/drag/click-to-create.
- **Design system**: CSS custom properties в `app.css` (light+dark блокове), Feather икони чрез `Icon.svelte`, цветовете по тип пост са координирано hue-rotation семейство, приоритетните цветове са отделен red→gray градиент (умишлено различен визуален език).
- **Build/push дисциплина**: НИКОГА `docker compose build`/`up --build` или `git push` без буквалната дума **"Билдни"** от потребителя — не питай, само чакай.
- **Layout**: MainView.svelte-ов `.app-shell` (header + page body) е `height:100dvh; overflow-y:auto` — самият shell скролва, не страницата; header-ът е `position:sticky; top:0`. Вложени flex деца (напр. LibraryPage-ов `.client-sidebar`) се нуждаят от изричен `min-height:0`, иначе `min-height:auto` подразбирането ги кара да наложат собствената си content височина нагоре по цялата flex верига.

## 5. Капани / за какво да внимаваш

- `node:sqlite` е **синхронен** — няма `await` за `.get()/.all()/.run()`. Това реално се разчита на другаде (напр. изключва race condition между read+write в същия handler).
- Express 4 НЕ хваща автоматично rejected promises в async route handlers — mutating routes в `tasks.js` са умишлено синхронни, с fire-and-forget (`.then/.catch`, не `await`) за email изпращането, пуснато СЛЕД `res.json()`.
- Helmet-ови default-и чупят Google Identity Services: CSP блокира `accounts.google.com/gsi/*` скрипта, а `Cross-Origin-Opener-Policy: same-origin` null-ва `window.opener` в popup-а (фиксирано с `same-origin-allow-popups`) — внимавай при бъдещи подобни интеграции с трети страни.
- `PostTile`-ите показват `client - post_type` (или само едното), НЕ заглавието, освен ако и двете липсват — лесно подвежда тестови скриптове/очаквания.
- Docker Desktop понякога не е стартиран — трябва ръчно (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), после изчакай daemon-а.
- `ENCRYPTION_KEY` трябва да е точно 64 hex символа (32 байта) — смяната ѝ прави съществуващите Gmail App Password-и неразчитаеми.
- Google OAuth Client ID изисква ръчно добавени "Authorized JavaScript origins" в Google Cloud Console за всеки реално използван origin; OAuth consent screen да стои в "Testing" + explicit test users, докато не потрябва истинска публична регистрация.
- Едно-посочните Svelte binding-и (`checked={storeValue}`) не самокоригират native DOM състояние на checkbox, ако underlying стойността не се е променила реално — нужно е ръчно `e.target.checked = ...` в catch клона.

## 6. Compact Instructions

При компресиране на контекста, задължително запази:
- **Build/push правилото**: build/push САМО на буквалната дума "Билдни", без изключения, без да питаш предварително.
- **handbook.md правилото** (виж т.8 по-долу) — не пропускай запис там при нова user-facing setup функционалност.
- **Текущ статус (обновено 2026-08-14)**: Асет библиотеката е завършена и стабилна — тип "Цвят" (hex/rgb/снимка, поне едно, не всички задължителни), клиентите свързани с `tasks.client` ∪ `library_assets.client`, таб "Постове" (reuse на PostTile+TaskForm, read-only при споделен календар), филтрите/типовете сортирани азбучно (Друго последно), и `.app-shell` layout фикс (header `position:sticky`, `.app-shell` е дефинирано `100dvh` + `overflow-y:auto` — вътрешен скрол вместо скрол на цялата страница; nested flex деца се нуждаят от изричен `min-height:0`, иначе content-ът им пробива нагоре по веригата). Всичко билднато, commit-нато и пушнато (последен commit `d1fd227`). Няма чакаща некомитната работа.

## 7. Кога да се ъпдейтва този файл

- При голяма архитектурна промяна или нова конвенция в кода.
- След завършване на значима фийчър.
- Когато се установи повтарящо се недоразумение (напр. предложение на нещо вече отхвърлено).
- В края на по-дълга сесия — напомни на потребителя да провери дали има какво да се добави тук.

## 8. handbook.md

`handbook.md` в root-а е **потребителски** наръчник (не админ/dev) — стъпки, които крайният потребител трябва да направи в собствения си акаунт, за да проработи дадена функция (напр. Gmail App Password, споделяне на календар).

**Задължително правило**: при имплементиране на всяка нова функционалност, изискваща setup от потребителя (настройки, разрешения, конфигурация от негова страна), добави кратка записка в `handbook.md` — какво прави функцията и точно какво трябва да направи потребителят, за да я активира. Тези записки по-късно стават основа на пълен user manual.
