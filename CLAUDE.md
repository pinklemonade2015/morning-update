# Morning Update — project notes for Claude

## What this is
A simple, mobile-friendly web app that shows live DLR times, Southeastern timetable
times and today's weather at a glance, all on one screen without scrolling. It can be installed to a phone's home screen.

## How to work on this project
- Explain changes in plain English, briefly, as you go.
- **Always ask before** deleting files, or doing anything that needs passwords,
  tokens or API keys (including git push / GitHub login).
- Prefer simple, readable code over clever code. Add short comments that explain *why*.

## Version 1 scope
1. **Live DLR departures from a single station** (set by `STOP_ID` in `app.js`)
   - Big countdown for the next train ("Next train: 4 min"), plus the next 3 trains listed.
   - Auto-refresh every 30 seconds. Countdown ticks down locally between refreshes.
2. **Today's weather for a single location** (set by `LAT` / `LON` in `app.js`)
   - Current temperature, today's high / low (°C).
   - Clear message: "Take an umbrella" if the highest hourly rain chance between
     **07:00 and 19:00** is **40% or more**, otherwise "No umbrella needed".
3. The page works and looks the same at any time of day.

## Version 2: Southeastern trains
A third box (between DLR and weather) shows the next 3 Southeastern trains.
Which trains depends on the UK day and time (`chooseSoutheasternPlan` in `app.js`):

| When | Route | Trains shown |
|---|---|---|
| Weekdays, before 09:30 | Stratford Intl → St Pancras | 07:30–09:30 today |
| Weekdays, 09:30–19:59 | St Pancras → Stratford Intl | 17:00–20:00 today |
| From 20:00, if tomorrow is a weekday | Stratford Intl → St Pancras | 07:30–09:30 tomorrow |
| Weekends (and Friday from 20:00) | Stratford Intl → St Pancras | next 3 from now |

- Shows departure time, arrival time, and "in X min" for trains within 2 hours.
- These are **timetable** times, labelled as such: no live delays or platforms.
- A "⚠" appears if TfL flags the journey as disrupted (mostly planned works, not live delays).

## Service status lines
The DLR and Southeastern boxes each show TfL's overall line status under the title:
"✓ Good service" (green) or "⚠ <reason>" (yellow, cut to 2 lines so the page still fits).
It says *that* there's a problem and why, not which train is affected.
If the status can't be loaded, the line is hidden rather than showing a wrong "Good service".

## Not in V1
Running data, notifications, lock-screen widgets.

## Constraints
- Free hosting on **GitHub Pages** (static files only — no server).
- **No API keys or secrets** in the code.
- **No personal information** in code, comments or notes (the repo is public).
- Large, clear text readable at a glance. Dark mode.
- All times shown in UK time (Europe/London, handles GMT/BST automatically).

## Settings (all in `app.js`)
| Setting | Value | Meaning |
|---|---|---|
| `STOP_ID` | `940GZZDLSIT` | Stratford International DLR station |
| `LAT`, `LON` | `51.4995`, `-0.1248` | Westminster, London |
| `UMBRELLA_THRESHOLD` | `40` | % rain chance that triggers the umbrella message |
| `RAIN_CHECK_START_HOUR`, `RAIN_CHECK_END_HOUR` | `7`, `19` | Hours checked for rain |
| `TRAIN_REFRESH_MS` | 30 s | How often trains are fetched |
| `WEATHER_REFRESH_MS` | 15 min | How often weather is fetched |
| `STRATFORD_INTL_RAIL`, `ST_PANCRAS_RAIL` | `910GSTFODOM`, `910GSTPX` | National Rail stations (TfL ids) |
| `MORNING_WINDOW`, `EVENING_WINDOW` | `0730–0930`, `1700–2000` | Southeastern time windows |
| `SE_REFRESH_MS` | 2 min | How often Southeastern times are fetched |
| `STATUS_URL` / `STATUS_REFRESH_MS` | DLR + Southeastern / 2 min | Line status feed |

## Data sources (all free, no key needed)
- **TfL Unified API** — `https://api.tfl.gov.uk/StopPoint/{STOP_ID}/Arrivals`
  - Sort and count down using `expectedArrival` (an exact time). Don't use
    `timeToStation` for the countdown: it's measured from when TfL generated the
    data, which can be ~30–60 s old.
  - Show `destinationName` without the " DLR Station" suffix.
  - Anonymous use is rate-limited; one call per 30 s is well within limits.
- **TfL Journey Planner** (Southeastern) —
  `https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?date=yyyymmdd&time=hhmm&timeIs=Departing&mode=national-rail`
  - TfL's live Arrivals endpoint returns nothing for National Rail stations, so use this.
  - Each call returns the next 3 journeys; keep only direct ones (`legs.length === 1`).
  - Times are UK local without an offset, e.g. `2026-11-16T08:30:00`.
  - Works for future dates/times, which the windows need (live boards only cover ~2 hours).
  - Live National Rail data (delays, platforms) needs an API key, which can't be hidden on
    GitHub Pages — it would need a small separate service to hold the key.
- **TfL Line Status** — `https://api.tfl.gov.uk/Line/dlr,southeastern/Status`
  - `statusSeverity` 10 = Good Service; anything else is shown as a warning.
- **Open-Meteo** — `https://api.open-meteo.com/v1/forecast`
  - `current=temperature_2m`, `daily=temperature_2m_max,temperature_2m_min`,
    `hourly=precipitation_probability`, `timezone=Europe/London`, `forecast_days=1`.

## Tech approach
- Plain HTML + CSS + JavaScript. No frameworks, no build step.
- Files: `index.html`, `style.css`, `app.js`, `manifest.json`,
  `service-worker.js`, `icons/` (for "Add to Home screen").
- Handle errors gracefully: show "Couldn't load trains — retrying" rather than a blank screen.
- Show a small "Updated hh:mm:ss" timestamp so stale data is obvious.
- Pause refreshing when the page is in the background; refresh immediately on return.

## Service worker rule (important)
`service-worker.js` must **only cache the page's own files** (same origin).
It must never cache train or weather data: requests to other sites are ignored
by the worker, and `app.js` fetches them with `cache: "no-store"`.
Bump the `CACHE` version name when page files change.

## Known risks / things to watch
- Stratford International is the end of the line, so TfL predictions there can
  occasionally be sparse or missing — the app must show a friendly "No trains listed" state.
- The weather "rain chance" is a forecast probability, not a guarantee.
- Journey Planner picks "best" journeys, so in theory it could skip a train that leaves
  earlier but arrives later than the next one. Unlikely on this route (all ~7 min).
- From the Claude cloud sandbox, Open-Meteo often replies 429 (daily limit) because the
  sandbox shares an IP address with many users. Verify weather in a normal browser instead.
  TfL works from the sandbox.

## Future ideas (not built yet)
- **Live Southeastern times per train** (expected time, "Cancelled", platform) using National
  Rail live data (Rail Data Marketplace / Darwin, or Realtime Trains). Needs a free API key,
  which must NOT go in this public repo: it would need a small separate service (e.g. a free
  Cloudflare Worker) to hold the key and pass data on. Live data only covers ~2 hours ahead,
  so keep timetable times for windows further out. The owner wants to come back to this.

## Hosting
- Public GitHub repo, served by GitHub Pages from the `main` branch root.
- Use relative paths (`./`, `app.js`) because the site lives under `/morning-update/`.
