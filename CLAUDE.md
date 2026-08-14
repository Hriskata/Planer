# CLAUDE.md — Планер

Кратка ориентация за бъдещи сесии. Не е изчерпателна документация — за пълния roadmap виж `task-app-project-brief.md`, за admin/deploy стъпки `README.md`, за потребителски setup стъпки `handbook.md`.

## 1. Какво е проектът

Self-hosted календар/task manager за планиране на съдържание (Reel/Post/Story/Carrousel) — първоначално затворено семейно приложение за 2-4 души, в момента се разширява към публична регистрация (лендинг страница + Google Sign-In). Освен календара, приложението има и **Асет библиотека** — централно място за брандинг материали (лога, шрифтове, снимки, текстове, цветове) по клиент, свързана с реалните задачи (виж т.4).

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
  lib/MainView.svelte   .app-shell обвивка (виж т.4 Layout), header, page state calendar/library, филтри, изгледи, FAB, TaskForm modal
  lib/TaskForm.svelte   create/edit/view modal (readOnly режим през <fieldset disabled>), warning ако имейл подателят не е настроен
  lib/PostTile.svelte   плочка за пост — приоритетна цветна лента по левия ръб, "client - post_type" label
  lib/WeekCalendar.svelte, MonthCalendar.svelte, BacklogColumn.svelte
  lib/SettingsMenu.svelte   Известия / Имейл подател / Споделяне на календар
  lib/CalendarSwitcher.svelte   header dropdown за превключване между календари (споделен и от LibraryPage)
  lib/LibraryPage.svelte   Асет библиотека — клиент sidebar (общ с tasks.client), тип табове (вкл. "Постове"), upload modal
  lib/libraryTypes.js  ASSET_TYPES, assetTypeIsText/Color, sortAssetTypeLabels (азбучно, "Друго" последно)
  lib/postTypes.js, priorities.js, platforms.js   фиксирани списъци за съответните task полета
  lib/Icon.svelte      споделени Feather икони (SVG paths директно от feathericons.com)
  lib/api.js           всички backend извиквания + offline localStorage кеш (library извикванията НЕ се кешират офлайн)
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
- **Email изпращане**: per-user, не общ SMTP акаунт — всеки праща през своя Gmail App Password (криптиран). Hardcode-нато към `smtp.gmail.com:587`. Ако подателят няма настроен App Password, изпращането тихо не прави нищо (`sendTaskCompletionEmail` връща `false`, `email_sent` не се вдига) — TaskForm показва inline предупреждение, ако `GET /account/email-sender` върне `hasAppPassword: false`, докато полето "Изпрати имейл при завършване" е включено.
- **Task полета извън основните**: `priority` (1=спешен...4=нисък, показва се като тънка цветна лента по левия ръб на PostTile + "P1" бадж, done задачите нямат лента) и `platform` (Facebook/Instagram/TikTok/LinkedIn/X/Google/Други-със-свободен-текст) — и двете прост `TEXT`/`INTEGER` без server-side enum enforcement, същия модел като `post_type`/`client`. Филтрите (клиент/тип/приоритет + текстово търсене, `search.js`'s `taskMatchesFilters`/`hasActiveFilters`) важат еднакво за ден/седмица/месец/backlog колоната — денят исторически ги пропускаше (bug, фиксиран).
- **Две различни sharing механики съжителстват**: `tasks.shared` (булево, видимо за ВСИЧКИ потребители в инстанцията) vs. `calendar_shares` (targeted, по имейл, целия календар на притежателя).
- **`calendar_shares` дава различни права в различните фийчъри**: за задачи е строго read-only; за `library_assets` НЕ Е read-only — споделен потребител може да качва/преглежда/сваля, но да трие само собствените си качвания (`uploaded_by`), докато собственикът (`owner_id`) може да трие всичко в своята библиотека — умишлено различен модел от tasks sharing, не пропускай при бъдещи промени.
- **Библиотеката е свързана с Планера**: клиентският списък в LibraryPage е обединение от `tasks.client` ∪ `library_assets.client` (нов `GET /api/tasks/clients`, distinct + сортирано), не само library-специфични клиенти. Табът "Постове" в LibraryPage не е реален `library_assets` тип — при избирането му content pane-ът показва/създава/редактира реални `tasks` редове за избрания клиент (`GET /api/tasks?client=X`, reuse на `PostTile`+`TaskForm`), СТРИКТНО read-only при чужд споделен календар (следва task-sharing правилото по-горе, не library-то). Типовете материали (`Лого/Шрифт/Снимка/Текст/Цвят/Друго`) плюс псевдо-типовете `Постове`/`Пост` (табове/dropdown) се сортират азбучно чрез `sortAssetTypeLabels` — "Друго" винаги последно. `Цвят` асетите взимат HEX и/или RGB и/или снимка — нито едно поотделно задължително, но поне едно от трите се изисква, валидирано и на двата края.
- **При добавяне на нов материал в LibraryPage**: типът в dropdown-а по подразбиране е активния таб (ако е реален тип), а не винаги първия от списъка.
- **Read-only enforcement**: `<fieldset disabled={readOnly}>` в TaskForm (не per-field), `readOnly` prop прекаран през PostTile/WeekCalendar/MonthCalendar/BacklogColumn за checkbox/drag/click-to-create.
- **Design system**: CSS custom properties в `app.css` (light+dark блокове), Feather икони чрез `Icon.svelte`, цветовете по тип пост са координирано hue-rotation семейство, приоритетните цветове са отделен red→gray градиент (умишлено различен визуален език).
- **Build/push дисциплина**: НИКОГА `docker compose build`/`up --build` или `git push` без буквалната дума **"Билдни"** от потребителя — не питай, само чакай.
- **Layout**: MainView.svelte-ов `.app-shell` (header + page body) е `height:100dvh; overflow-y:auto` — самият shell скролва, не страницата; header-ът е `position:sticky; top:0`. За да "опъне" някой вътрешен блок до долу на екрана (напр. LibraryPage-ов `.client-sidebar`/`.library-content`, или седмичния изглед — `main → .content-row → .calendar-area → WeekCalendar.calendar → .scroll-x`), всяко ниво по веригата трябва изрично `flex:1; min-height:0;` — иначе flex подразбирането `min-height:auto` кара всяко ниво да наложи собствената си content височина нагоре, независимо от `flex:1` (виж и т.5 за конкретния production бъг от това). Ден/Месец изгледите НЕ го правят — `.day-grid` и `MonthCalendar` растат/смятат собствена височина по различен модел (виж т.5).
- **Landing page**: `LandingPage.svelte` (за неаутентикирани посетители) има собствен theme toggle бутон до "Вход", независим от MainView-овия (същата икона/логика, различен CSS контекст — не header, а обикновен светъл фон).

## 5. Капани / за какво да внимаваш

- `node:sqlite` е **синхронен** — няма `await` за `.get()/.all()/.run()`. Това реално се разчита на другаде (напр. изключва race condition между read+write в същия handler).
- Express 4 НЕ хваща автоматично rejected promises в async route handlers — mutating routes в `tasks.js` са умишлено синхронни, с fire-and-forget (`.then/.catch`, не `await`) за email изпращането, пуснато СЛЕД `res.json()`.
- Helmet-ови default-и чупят Google Identity Services: CSP блокира `accounts.google.com/gsi/*` скрипта, а `Cross-Origin-Opener-Policy: same-origin` null-ва `window.opener` в popup-а (фиксирано с `same-origin-allow-popups`) — внимавай при бъдещи подобни интеграции с трети страни.
- `PostTile`-ите показват `client - post_type` (или само едното), НЕ заглавието, освен ако и двете липсват — лесно подвежда тестови скриптове/очаквания.
- Docker Desktop понякога не е стартиран — трябва ръчно (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), после изчакай daemon-а.
- `ENCRYPTION_KEY` трябва да е точно 64 hex символа (32 байта) — смяната ѝ прави съществуващите Gmail App Password-и неразчитаеми.
- Google OAuth Client ID изисква ръчно добавени "Authorized JavaScript origins" в Google Cloud Console за всеки реално използван origin; OAuth consent screen да стои в "Testing" + explicit test users, докато не потрябва истинска публична регистрация.
- Едно-посочните Svelte binding-и (`checked={storeValue}`) не самокоригират native DOM състояние на checkbox, ако underlying стойността не се е променила реално — нужно е ръчно `e.target.checked = ...` в catch клона.
- **`max-width` + `margin: 0 auto` за центриране чупи се, щом елементът стане flex item** (напр. на `.app-shell`) — auto margin-ите по cross axis-а потискат `align-items: stretch`, елементът се свива до content-а си вместо да запълни до max-width (точно това счупи `main`/`.search-bar`/`.filter-selects` в production след `.app-shell` рефакторинга). Фикс: explicit `width` (не `max-width`) + `align-self: center` (не `margin: auto`).
- **Nested flexbox `min-height: auto`**: flex дете отказва да се свие под собствената си content височина, дори с `flex: 1` на родителя, освен ако ВСЯКО ниво по веригата няма изрично `min-height: 0` — засегна `.client-sidebar` (LibraryPage) и WeekCalendar-овата `.calendar` верига, виж т.4 Layout.
- `WeekCalendar.svelte` вече НЕ ползва JS-измерена `bodyHeight`/per-column `overflow-y: auto` (премахнато — всяка колона имаше собствен скрол, объркващо) — цялата `.calendar` кутия сега е един flex/scroll блок, виж т.4. `MonthCalendar.svelte` пази СВОЯ JS `rowHeight` подход (различна причина — равномерно разпределя 5-6 седмични реда по наличната височина, не overflow containment) — не ги приемай за взаимозаменяеми модели.
- Playwright тестове срещу реалния Docker контейнер (`localhost:3000`) са безопасни за диагностика, стига да сееш/чистиш собствени тестови потребители (`docker exec planer-app-1 node src/seed.js ... `+ ръчен `DELETE FROM users`) — така се хвана production-специфичен layout бъг, който не се възпроизвеждаше на тесен viewport в изолирания test backend.

## 6. Compact Instructions

При компресиране на контекста, задължително запази:
- **Build/push правилото**: build/push САМО на буквалната дума "Билдни", без изключения, без да питаш предварително.
- **handbook.md правилото** (виж т.8 по-долу) — не пропускай запис там при нова user-facing setup функционалност.
- **Update-преди-compact правилото** (виж т.7): освежи този файл (особено този статус ред) преди компактиране на контекста, проактивно, без потребителят да пита. Ако имаш съмнение кой файл се има предвид — това е `C:\Планер\CLAUDE.md`, питай само ако наистина не е ясно.
- **Текущ статус (обновено 2026-08-14)**: направен е ПЪЛЕН преглед/ъпдейт на целия този файл (не само статус реда) — т.1/2/4/5 вече отразяват Асет библиотеката (Постове таб, Цвят тип, клиенти обединени с tasks.client), task полетата priority/platform, layout/flexbox поуките от `.app-shell` работата. Последен пушнат код commit: `2d7ae3b` (седмичният бокс опъва до долу на екрана, следвайки `.app-shell` модела; преди това `ea047ef` премахна per-column скрола, `6ac166f` оправи production регресия с `max-width+margin:auto`). Няма чакаща некомитната код работа — само тази документационна редакция чака "Билдни".

## 7. Кога да се ъпдейтва този файл

- При голяма архитектурна промяна или нова конвенция в кода.
- След завършване на значима фийчър.
- Когато се установи повтарящо се недоразумение (напр. предложение на нещо вече отхвърлено).
- **Преди компактиране на контекста (/compact) — задължително, без да чакаш потребителят да пита.** Освежи т.6 (Compact Instructions) и статус реда там, за да не се загуби актуален контекст при компресирането. Ако не се усетя навреме (компактирането се случва и автоматично, без изрично предупреждение), поне при следващия удобен момент в сесията.

## 8. handbook.md

`handbook.md` в root-а е **потребителски** наръчник (не админ/dev) — стъпки, които крайният потребител трябва да направи в собствения си акаунт, за да проработи дадена функция (напр. Gmail App Password, споделяне на календар).

**Задължително правило**: при имплементиране на всяка нова функционалност, изискваща setup от потребителя (настройки, разрешения, конфигурация от негова страна), добави кратка записка в `handbook.md` — какво прави функцията и точно какво трябва да направи потребителят, за да я активира. Тези записки по-късно стават основа на пълен user manual.
