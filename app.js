// Morning Update — live DLR departures, Southeastern timetable times and today's weather.
// No API keys are needed for any of the services.

// ---------- Settings (easy to change) ----------
const STOP_ID = "940GZZDLSIT"; // Stratford International DLR
const TRAINS_URL = `https://api.tfl.gov.uk/StopPoint/${STOP_ID}/Arrivals`;
const TRAIN_REFRESH_MS = 30 * 1000;      // every 30 seconds
const WEATHER_REFRESH_MS = 15 * 60 * 1000; // every 15 minutes (forecasts change slowly)

// Weather location: Westminster, London
const LAT = 51.4995;
const LON = -0.1248;
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${LAT}&longitude=${LON}` +
  "&current=temperature_2m" +
  "&daily=temperature_2m_max,temperature_2m_min" +
  "&hourly=precipitation_probability" +
  "&timezone=Europe%2FLondon&forecast_days=1";

// Umbrella rule: if any hour between these times has at least this rain chance
const UMBRELLA_THRESHOLD = 40;   // % rain chance
const RAIN_CHECK_START_HOUR = 7; // from 07:00
const RAIN_CHECK_END_HOUR = 19;  // up to 19:00

// Southeastern trains. TfL's live data doesn't cover National Rail, so these
// are timetable times from TfL's Journey Planner (no delays or platforms).
const STRATFORD_INTL_RAIL = "910GSTFODOM";
const ST_PANCRAS_RAIL = "910GSTPX";
const SE_REFRESH_MS = 2 * 60 * 1000; // every 2 minutes (timetables rarely change)
const SE_TRAINS_SHOWN = 3;

// Times are "hhmm" strings in UK time. Windows apply on weekdays.
const MORNING_WINDOW = { start: "0730", end: "0930" }; // Stratford Intl → St Pancras
const EVENING_WINDOW = { start: "1700", end: "2000" }; // St Pancras → Stratford Intl
// After the evening window ends, the app looks ahead to the next morning.

const WESTBOUND = { from: STRATFORD_INTL_RAIL, to: ST_PANCRAS_RAIL, route: "Stratford Intl → St Pancras" };
const EASTBOUND = { from: ST_PANCRAS_RAIL, to: STRATFORD_INTL_RAIL, route: "St Pancras → Stratford Intl" };

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

// Format a time in UK time, e.g. "07:42:05"
function ukTime(date) {
  return date.toLocaleTimeString("en-GB", { timeZone: "Europe/London" });
}

// "Woolwich Arsenal DLR Station" -> "Woolwich Arsenal"
function shortName(name) {
  return (name || "Unknown").replace(/ DLR Station$/, "");
}

// Whole minutes until a train arrives; 0 means "Due"
function minutesUntil(arrival) {
  return Math.max(0, Math.floor((arrival - Date.now()) / 60000));
}

function minsText(mins) {
  return mins === 0 ? "Due" : `${mins} min`;
}

// ---------- Trains ----------
let trains = []; // [{ arrival: Date, destination: string }]

async function loadTrains() {
  try {
    // cache: "no-store" tells the browser never to reuse an old copy
    const res = await fetch(TRAINS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`TfL replied ${res.status}`);
    const data = await res.json();

    // TfL gives each prediction an exact expected arrival time.
    // Storing that (not "x seconds") lets the countdown tick down on its own.
    trains = data
      .map((p) => ({ arrival: new Date(p.expectedArrival), destination: shortName(p.destinationName) }))
      .sort((a, b) => a.arrival - b.arrival);

    $("train-status").textContent = `Updated ${ukTime(new Date())}`;
  } catch (err) {
    console.error(err);
    $("train-status").textContent = "Couldn't load trains — retrying in 30s";
  }
  renderTrains();
}

function renderTrains() {
  // Drop trains that have already left
  const upcoming = trains.filter((t) => t.arrival - Date.now() > -30000);

  if (upcoming.length === 0) {
    $("next-train").textContent = "No trains listed";
    $("train-list").innerHTML = "";
    return;
  }

  $("next-train").textContent = `Next train: ${minsText(minutesUntil(upcoming[0].arrival))}`;

  // Build the list of the next 3 trains
  const list = $("train-list");
  list.innerHTML = "";
  for (const t of upcoming.slice(0, 3)) {
    const li = document.createElement("li");
    const dest = document.createElement("span");
    dest.className = "dest";
    dest.textContent = t.destination;
    const mins = document.createElement("span");
    mins.className = "mins";
    mins.textContent = minsText(minutesUntil(t.arrival));
    li.append(dest, mins);
    list.append(li);
  }
}

// ---------- UK date/time helpers ----------
// The phone could be set to any time zone, so always work out the UK date and time.
function ukParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    ymd: `${p.year}${p.month}${p.day}`,  // e.g. "20261116"
    hhmm: `${p.hour}${p.minute}`,         // e.g. "0745"
    weekday: p.weekday,                   // e.g. "Mon"
    // UK wall-clock time as a number, for working out "in X min"
    clock: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second),
  };
}

// The day after "yyyymmdd"
function nextDay(ymd) {
  const d = new Date(Date.UTC(ymd.slice(0, 4), ymd.slice(4, 6) - 1, Number(ymd.slice(6, 8)) + 1));
  return {
    ymd: d.toISOString().slice(0, 10).replaceAll("-", ""),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()],
  };
}

const isWeekend = (weekday) => weekday === "Sat" || weekday === "Sun";
const fmt = (hhmm) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`; // "0730" -> "07:30"

// ---------- Southeastern ----------
// Decide which trains to show right now. Returns the route, the date, and the
// time range to search ("end" is null when we just want the next few trains).
//   Weekdays, until 09:30:  Stratford Intl → St Pancras, 07:30–09:30 today
//   Weekdays, 09:30–20:00:  St Pancras → Stratford Intl, 17:00–20:00 today
//   After 20:00:            tomorrow's 07:30–09:30, if tomorrow is a weekday
//   Weekends:               next 3 trains, Stratford Intl → St Pancras
function chooseSoutheasternPlan(now) {
  const today = ukParts(now);
  const tomorrow = nextDay(today.ymd);
  const nextTrains = { ...WESTBOUND, date: today.ymd, start: today.hhmm, end: null, label: "Next trains" };

  if (today.hhmm >= EVENING_WINDOW.end) {
    if (isWeekend(tomorrow.weekday)) return nextTrains;
    return { ...WESTBOUND, date: tomorrow.ymd, ...MORNING_WINDOW,
      label: `Tomorrow ${fmt(MORNING_WINDOW.start)}–${fmt(MORNING_WINDOW.end)}` };
  }
  if (isWeekend(today.weekday)) return nextTrains;
  if (today.hhmm < MORNING_WINDOW.end) {
    return { ...WESTBOUND, date: today.ymd, ...MORNING_WINDOW,
      label: `Today ${fmt(MORNING_WINDOW.start)}–${fmt(MORNING_WINDOW.end)}` };
  }
  return { ...EASTBOUND, date: today.ymd, ...EVENING_WINDOW,
    label: `Today ${fmt(EVENING_WINDOW.start)}–${fmt(EVENING_WINDOW.end)}` };
}

const planKey = (plan) => `${plan.from}-${plan.date}-${plan.end}`;

let sePlan = null;
let seTrains = []; // [{ date: "yyyymmdd", depart: "hhmm", arrive: "hhmm", clock: number, disrupted: bool }]

async function loadSoutheastern() {
  const plan = chooseSoutheasternPlan(new Date());
  sePlan = plan;
  $("se-title").textContent = `Southeastern · ${plan.route}`;
  $("se-window").textContent = plan.label;

  // Search from the start of the window, or from now if the window has already begun
  const today = ukParts();
  const searchFrom = plan.date === today.ymd && today.hhmm > plan.start ? today.hhmm : plan.start;
  const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${plan.from}/to/${plan.to}` +
    `?date=${plan.date}&time=${searchFrom}&timeIs=Departing&mode=national-rail`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`TfL Journey Planner replied ${res.status}`);
    const data = await res.json();

    // Keep direct trains only. Times look like "2026-11-16T08:30:00" (UK time).
    seTrains = (data.journeys || [])
      .filter((j) => j.legs.length === 1)
      .map((j) => {
        const leg = j.legs[0];
        const t = leg.departureTime;
        return {
          date: t.slice(0, 10).replaceAll("-", ""),
          depart: t.slice(11, 13) + t.slice(14, 16),
          arrive: leg.arrivalTime.slice(11, 13) + leg.arrivalTime.slice(14, 16),
          clock: Date.UTC(t.slice(0, 4), t.slice(5, 7) - 1, t.slice(8, 10), t.slice(11, 13), t.slice(14, 16)),
          disrupted: Boolean(leg.isDisrupted),
        };
      })
      // In a time window, drop trains after it ends. "Next trains" may run past midnight.
      .filter((t) => plan.end === null || (t.date === plan.date && t.depart <= plan.end));

    $("se-status").textContent = `Timetable times · Updated ${ukTime(new Date())}`;
  } catch (err) {
    console.error(err);
    seTrains = [];
    $("se-status").textContent = "Couldn't load Southeastern times — retrying in 2 min";
  }
  renderSoutheastern();
}

function renderSoutheastern() {
  if (!sePlan) return;

  // If the time window has changed (e.g. it's just gone 09:30), fetch the new one
  if (planKey(chooseSoutheasternPlan(new Date())) !== planKey(sePlan)) {
    loadSoutheastern();
    return;
  }

  const nowClock = ukParts().clock;
  const upcoming = seTrains.filter((t) => t.clock > nowClock).slice(0, SE_TRAINS_SHOWN);

  const list = $("se-list");
  list.innerHTML = "";
  if (upcoming.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = sePlan.end ? "No more trains in this window" : "No trains found";
    list.append(li);
    return;
  }

  for (const t of upcoming) {
    const li = document.createElement("li");

    const left = document.createElement("span");
    const time = document.createElement("span");
    time.className = "time" + (t.disrupted ? " warn" : "");
    time.textContent = fmt(t.depart) + (t.disrupted ? " ⚠" : "");
    const arr = document.createElement("span");
    arr.className = "arr";
    arr.textContent = `arr ${fmt(t.arrive)}`;
    left.append(time, arr);

    // Show "in X min" only for trains in the next 2 hours
    const mins = Math.floor((t.clock - nowClock) / 60000);
    const right = document.createElement("span");
    right.className = "mins";
    right.textContent = mins < 120 ? `in ${minsText(mins)}` : "";

    li.append(left, right);
    list.append(li);
  }
}

// ---------- Weather ----------
async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Weather service replied ${res.status}`);
    const data = await res.json();

    $("temp-now").textContent = `${Math.round(data.current.temperature_2m)}°`;
    $("temp-high").textContent = `${Math.round(data.daily.temperature_2m_max[0])}°`;
    $("temp-low").textContent = `${Math.round(data.daily.temperature_2m_min[0])}°`;

    // Highest rain chance in the rain-check hours. Times look like "2026-11-02T08:00".
    const checkedHourChances = data.hourly.time
      .map((time, i) => ({ hour: Number(time.slice(11, 13)), chance: data.hourly.precipitation_probability[i] }))
      .filter((h) => h.hour >= RAIN_CHECK_START_HOUR && h.hour < RAIN_CHECK_END_HOUR)
      .map((h) => h.chance ?? 0);
    const maxChance = Math.max(0, ...checkedHourChances);

    const umbrella = $("umbrella");
    if (maxChance >= UMBRELLA_THRESHOLD) {
      umbrella.textContent = "☂️ Take an umbrella";
      umbrella.className = "umbrella yes";
    } else {
      umbrella.textContent = "No umbrella needed";
      umbrella.className = "umbrella no";
    }

    $("weather-status").textContent =
      `Rain chance ${RAIN_CHECK_START_HOUR}:00–${RAIN_CHECK_END_HOUR}:00: up to ${maxChance}% · Updated ${ukTime(new Date())}`;
  } catch (err) {
    console.error(err);
    // Only replace the message if we never loaded weather; otherwise keep the last good forecast
    if ($("umbrella").textContent === "Loading…") {
      $("umbrella").textContent = "Weather unavailable";
    }
    $("weather-status").textContent = "Couldn't load weather — retrying in 15 min";
  }
}

// ---------- Timers ----------
// Pause fetching while the app is in the background (saves battery and data),
// and refresh straight away when you come back to it.
let timers = [];

function start() {
  stop();
  loadTrains();
  loadSoutheastern();
  loadWeather();
  timers.push(setInterval(loadTrains, TRAIN_REFRESH_MS));
  timers.push(setInterval(loadSoutheastern, SE_REFRESH_MS));
  timers.push(setInterval(loadWeather, WEATHER_REFRESH_MS));
  // Tick the countdowns every second
  timers.push(setInterval(() => { renderTrains(); renderSoutheastern(); }, 1000));
}

function stop() {
  timers.forEach(clearInterval);
  timers = [];
}

document.addEventListener("visibilitychange", () => {
  document.hidden ? stop() : start();
});

start();

// ---------- Install support ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
