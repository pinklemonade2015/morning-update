# Morning Update — project notes for Claude

## What this is
A simple, mobile-friendly web app that shows live train times and today's weather
at a glance. It can be installed to a phone's home screen.

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

## Data sources (both free, no key needed)
- **TfL Unified API** — `https://api.tfl.gov.uk/StopPoint/{STOP_ID}/Arrivals`
  - Sort and count down using `expectedArrival` (an exact time). Don't use
    `timeToStation` for the countdown: it's measured from when TfL generated the
    data, which can be ~30–60 s old.
  - Show `destinationName` without the " DLR Station" suffix.
  - Anonymous use is rate-limited; one call per 30 s is well within limits.
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
- From the Claude cloud sandbox, Open-Meteo often replies 429 (daily limit) because the
  sandbox shares an IP address with many users. Verify weather in a normal browser instead.
  TfL works from the sandbox.

## Hosting
- Public GitHub repo, served by GitHub Pages from the `main` branch root.
- Use relative paths (`./`, `app.js`) because the site lives under `/morning-update/`.
