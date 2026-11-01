// Morning Update — fetches live DLR departures and today's weather.
// No API keys are needed for either service.

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
  loadWeather();
  timers.push(setInterval(loadTrains, TRAIN_REFRESH_MS));
  timers.push(setInterval(loadWeather, WEATHER_REFRESH_MS));
  timers.push(setInterval(renderTrains, 1000)); // tick the countdown every second
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
