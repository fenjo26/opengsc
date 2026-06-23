# OpenGSC — Personal GSC Dashboard

Личная панель управления Google Search Console. Все сайты со всех Google аккаунтов — в одном месте. Устанавливается на VPS одной командой.

---

## Что умеет

**Дашборд**
- **Единый дашборд** — все сайты со всех Google аккаунтов на одном экране
- **Блок аккаунтов** — все подключённые Google-аккаунты отображаются сверху с общим числом сайтов
- **Мини-графики трафика** — спарклайн для каждого сайта, сразу видно динамику
- **Быстрый выбор периода** — инлайн-кнопки 7д / 28д / 3м / 6м / 12м / 16м без открытия дропдауна
- **Сравнение периодов** — Previous / Year over Year / Custom
- **Метрики с подписями** — ✦ Клики / ◉ Показы / % CTR / ↑ Позиции как текстовые тоглы (понятно без иконок)
- **Итоговая статистика** — Всего кликов, показов, средний CTR и позиция по всем видимым сайтам; пересчитывается при фильтрации по тегу
- **Теги и сортировка по тегу** — клик на тег поднимает все сайты с этим тегом наверх; активный тег отображается как чип-фильтр
- **Запоминание сортировки** — выбранный метод сортировки сохраняется между сессиями
- **Открытие в новой вкладке** — правый клик на карточку → «Открыть в новой вкладке»
- **Privacy Blur** — размытие данных для скриншотов: аккаунты, email, числа в статистике, домены на карточках
- **Поиск** — быстро найти нужный домен или тег среди сотен сайтов
- **Избранное** — закрепить важные проекты наверху
- **Скрытие сайтов** — убрать неактивные из общего списка
- **Экспорт в CSV** — выгрузка с выбором измерений

**Детальная страница сайта**
- Графики кликов, показов, CTR, позиции по периодам
- Запросы, страницы, страны, устройства
- **Striking Distance Keywords** — запросы на позициях 4–20, готовые к продвижению
- **Keyword Cannibalization** — запросы, по которым конкурируют несколько страниц
- **Content Decay Map** — тепловая карта страниц, теряющих трафик
- **CTR Benchmark** — сравнение фактического CTR с отраслевыми стандартами
- **Indexing Status** — статус индексации топовых страниц через Google Search Console API

**Приватная ботоферма (Индексатор)**
- **Собственная сеть дорвеев** — подключение сеток доменов для быстрой и бесплатной индексации проектов.
- **Интеграция с GSC** — отправка карт сайтов (Sitemaps) ваших проектов напрямую в очередь перелинковки ботофермы.
- **Точная верификация (Double DNS Verification)** — защита от раскрытия сети конкурентами: автоматическая проверка подлинности ботов Google, Yandex, Bing и Mail.ru через обратные DNS-запросы. Люди и фейковые боты перенаправляются на целевой сайт.
- **Панель статистики сканирования** — детальный дашборд логов с разделением обычных заходов и ответов `304 Not Modified` для отслеживания краулингового лимита.
- **Интегрированный генератор скриптов** — готовый защищенный PHP-скрипт клоакинга, копируемый прямо из настроек.
- Подробное руководство по настройке: [docs/INDEXER-SETUP.md](docs/INDEXER-SETUP.md).

**AI-функции** (нужен API-ключ)
- Автоматическая генерация тематических кластеров запросов
- Автоматическая группировка контента по URL-структуре
- Определение брендовых ключевых слов
- Поддержка: Anthropic, OpenAI, Gemini, OpenRouter — используешь свой ключ

**Интерфейс**
- **Privacy Blur** — размыть домены для скриншотов и записи экрана
- **Dark / Light Mode** — переключение темы
- Широкий и стандартный layout

---

## Требования

| Параметр | Минимум | Рекомендуется |
|---|---|---|
| **ОС** | Ubuntu 22.04 LTS | Ubuntu 22.04 / 24.04 LTS |
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 1 GB | 2 GB |
| **Диск** | 10 GB SSD | 20 GB SSD |
| **Домен** | **Обязателен** | С SSL (Let's Encrypt) |

> Node.js, PM2, Nginx и все зависимости устанавливаются **автоматически** скриптом. Ничего ставить руками не нужно.

> ⚠️ **Домен обязателен.** Google OAuth не работает с IP-адресами — только с доменами. Привяжи домен к IP сервера до установки.

Протестировано на **Ubuntu 22.04 LTS**. Другие Debian-based дистрибутивы тоже работают. CentOS / RHEL — не поддерживаются.

---

## Установка

### 1. Подготовь Google OAuth приложение (~5 минут)

До установки нужны Google OAuth credentials.

**Шаг 1 — Создай проект**

Открой [Google Cloud Console](https://console.cloud.google.com/) и создай новый проект (или используй существующий).

**Шаг 2 — Включи Search Console API**

APIs & Services → Library → найди **Google Search Console API** → Enable.

**Шаг 3 — Создай OAuth Client ID**

APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**, тип: **Web application**.

Заполни поля:

| Поле | Значение |
|---|---|
| Authorized JavaScript origins | `http://твой-домен.com` (или `https://` если будет SSL) |
| Authorized redirect URIs | `http://твой-домен.com/api/auth/callback/google` (или `https://` если будет SSL) |

**Шаг 4 — Скопируй Client ID и Client Secret** — установщик их запросит.

### 2. Запусти установщик одной командой

```bash
curl -fsSL https://raw.githubusercontent.com/fenjo26/opengsc/main/install.sh | sudo bash
```

Скрипт сам склонирует репозиторий в `/root/opengsc`, затем задаст несколько вопросов:
- Домен (например: `seo.example.com`)
- Устанавливать ли Nginx (рекомендуется — да)
- Настраивать ли SSL через Let's Encrypt (рекомендуется — да)
- Email для SSL-сертификата
- Google Client ID и Client Secret

После этого автоматически:
- Клонирует репозиторий в `/root/opengsc`
- Установит Node.js 20 LTS
- Установит PM2 и запустит приложение как системный сервис
- Настроит Nginx как reverse proxy
- Выпустит SSL-сертификат через Certbot
- Настроит UFW firewall (порты 22, 80, 443)

### 3. Открой в браузере

```
https://твой-домен.com
```

Войди через Google. Первый аккаунт становится владельцем дашборда. В **Settings → My Google Accounts** добавь остальные аккаунты — их сайты появятся на дашборде автоматически.

---

## Ручная установка

Если хочешь настроить всё самостоятельно без скрипта:

```bash
# Клонируй репозиторий
git clone https://github.com/fenjo26/opengsc.git
cd opengsc

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# PM2
npm install -g pm2

# Зависимости проекта
npm install

# .env — скопируй шаблон и заполни
cp .env.template .env
nano .env

# База данных и сборка
npx prisma generate
npx prisma db push
npm run build

# Запуск
pm2 start npm --name opengsc -- start
pm2 save
pm2 startup
```

---

## Переменные окружения

| Переменная | Описание | Пример |
|---|---|---|
| `DATABASE_URL` | Путь к SQLite базе данных | `file:/root/opengsc/data/prod.db` |
| `NEXTAUTH_SECRET` | Случайный секрет для шифрования сессий | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Полный URL приложения с доменом | `https://твой-домен.com` |
| `GOOGLE_CLIENT_ID` | Из Google Cloud Console | `123...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Из Google Cloud Console | `GOCSPX-...` |

> `NEXTAUTH_URL` должен **точно совпадать** с Authorized redirect URI в Google Console — вплоть до `http://` vs `https://`. Несовпадение = ошибка `redirect_uri_mismatch`.

Сгенерировать секрет:
```bash
openssl rand -base64 32
```

---

## Управление приложением

```bash
pm2 logs opengsc       # просмотр логов
pm2 restart opengsc    # перезапуск
pm2 stop opengsc       # остановка
pm2 status             # статус всех процессов
```

### Обновление до новой версии

```bash
cd /root/opengsc
git pull
npm install
npx prisma db push
npm run build
pm2 restart opengsc
```

---

## Подключение Google Analytics 4 (GA4)

Вкладка **GA4** на карточке сайта показывает реальные данные из Google Analytics — Сеансы, Вовлечённость, Ключевые события и Доход с графиком и динамикой к прошлому периоду. Это **опциональная** функция: дашборд и GSC работают без неё. Настройка разовая.

> Если на вкладке GA4 пусто, приложение само покажет пошаговый гайд и кнопки для включения API. Эти же шаги — ниже. Подробный гайд с разбором ошибок: [docs/GA4-SETUP.md](docs/GA4-SETUP.md).

### 1. Включи два Google API

GA4 использует два API, которых нет у Search Console. Открой **Google Cloud Console** в **том же проекте**, где лежит твой OAuth Client ID, и включи оба:

| API | Ссылка (нажми Enable) |
|---|---|
| **Google Analytics Data API** | `https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com` |
| **Google Analytics Admin API** | `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com` |

> API включаются **на проект, а не на аккаунт**. Один раз — и это покрывает все подключённые Google-аккаунты. После включения подожди 1–2 минуты на propagation.

### 2. Переподключи Google-аккаунты

В приложении добавлен OAuth-доступ `analytics.readonly`. Чтобы существующие аккаунты его получили, их нужно переавторизовать: **Settings → My Google Accounts**, повторно войти под аккаунтом. На экране согласия Google должна стоять галочка про Google Analytics.

Проверить можно там же: напротив каждого аккаунта виден статус **GSC ✓** и **GA4 ✓**. Зелёная галочка GA4 = доступ выдан.

> Это касается только инстансов, которые обновляются со старой версии. На свежей установке скоуп запрашивается сразу при первом входе.

### 3. Дай аккаунту доступ к ресурсу GA4

Property появится в списке, только если подключённый Google-аккаунт имеет доступ к ресурсу GA4 этого сайта. Если доступа нет — добавь email аккаунта в **Google Analytics → Администратор → Управление доступом к ресурсу** хотя бы с ролью **Читатель (Viewer)**.

### 4. Привяжи ресурс

Открой карточку сайта → вкладка **GA4** → выбери ресурс в списке → **Link Property**. Привязка сохраняется отдельно для каждого сайта; отвязать можно в любой момент ссылкой **Unlink GA4**.

> **Режим OAuth-приложения.** Скоуп `analytics.readonly` относится к «sensitive». В режиме **Testing** он работает только для аккаунтов из списка Test users. В режиме **Production (Опубликовано)** — для любого аккаунта (без верификации Google будет экран «приложение не проверено» → «Перейти всё равно», это нормально для self-hosted).

---

## Частые проблемы

**На вкладке GA4 пусто и ошибка `... API has not been used in project ... or it is disabled`**

Не включён нужный Google API. Включи **Google Analytics Data API** и **Google Analytics Admin API** в том же проекте Google Cloud, что и OAuth Client ID (ссылки — в разделе «Подключение Google Analytics 4»), подожди 1–2 минуты и обнови страницу.

**На вкладке GA4 ошибка `insufficient authentication scopes`**

Аккаунту не выдан доступ к Analytics. Переподключи его в **Settings → My Google Accounts** — после повторного входа напротив аккаунта загорится **GA4 ✓**.

**Список GA4-ресурсов пустой, хотя API включены и доступ выдан**

У этого Google-аккаунта нет доступа к ресурсу GA4. Добавь его email в **Google Analytics → Администратор → Управление доступом к ресурсу** с ролью Viewer.

**Ошибка `redirect_uri_mismatch` при входе через Google**

`NEXTAUTH_URL` в `.env` не совпадает с Authorized redirect URI в Google Console. Должны быть идентичны — включая протокол (`http://` vs `https://`). Redirect URI должен быть `https://твой-домен.com/api/auth/callback/google`.

**Бесконечный редирект на `/login` после входа**

Проверь `NEXTAUTH_URL` в `.env` — должен совпадать с доменом и протоколом. Убедись что SSL-сертификат действителен.

**База данных пропала после перезапуска**

Используй абсолютный путь в `DATABASE_URL`, не относительный. Установщик делает это автоматически: `file:/root/opengsc/data/prod.db`. При ручной установке задай путь явно.

**`pm2 restart opengsc` не помогает после `git pull`**

После обновления нужно пересобрать проект:
```bash
npm run build && pm2 restart opengsc
```

**Логотип не отображается на странице входа**

Убедись что используешь актуальную версию `src/middleware.ts` из репозитория.

---

## Стек

- **Next.js 16** (App Router)
- **Prisma 5** + SQLite
- **NextAuth v4** — авторизация через Google OAuth
- **Recharts** — графики
- **Google Search Console API** — источник данных
- **PM2** — процесс-менеджер
- **Nginx** — reverse proxy

---

## Структура проекта

```
src/
  app/
    page.tsx                    # Главный дашборд — все сайты
    site/[id]/page.tsx          # Детальная страница сайта
    login/page.tsx              # Страница входа
    settings/page.tsx           # Настройки, AI-ключи, аккаунты
    indexer/                    # Модуль приватной ботофермы (Индексатор)
      stats/page.tsx            # Детальная статистика обходов
      domains/page.tsx          # Управление доменами дорвеев (CRUD)
      queue/page.tsx            # Очередь URL для перелинковки
      dictionary/page.tsx       # Словари ключевых слов
      settings/page.tsx         # Копирование PHP-скрипта клоакинга
    api/
      auth/                     # NextAuth
      gsc/sites/                # Получение сайтов из GSC
      gsc/accounts/             # Управление Google аккаунтами
      gsc/setup/                # AI-генерация кластеров и групп
      gsc/clusters/             # CRUD тематических кластеров
      gsc/groups/               # CRUD групп контента
      gsc/striking/             # Striking Distance Keywords
      gsc/cannibalization/      # Keyword Cannibalization
      gsc/decay/                # Content Decay Map
      gsc/ctr/                  # CTR Benchmark
      gsc/inspect/              # URL Indexing Status
      gsc/branded/              # AI-определение брендовых ключей
  components/
    StrikingDistanceKeywords.tsx
    KeywordCannibalization.tsx
    ContentDecayMap.tsx
    CtrBenchmark.tsx
    SiteSettingsTab.tsx
  lib/
    auth.ts                     # Конфигурация NextAuth
    prisma.ts                   # Prisma клиент
    PrivacyContext.tsx           # Глобальный Privacy Blur
    ThemeContext.tsx             # Тема (dark / light)
    LayoutContext.tsx            # Layout (wide / default)
prisma/
  schema.prisma                 # Схема БД
install.sh                      # Установщик для VPS (Ubuntu/Debian)
```
