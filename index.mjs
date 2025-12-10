import {restClient} from '@massive.com/client-js';
import fs from 'fs';

const token = fs.readFileSync('token.txt', 'utf-8').trim();
const rest = restClient(token, 'https://api.massive.com');

const startYear = 2024;
const tracked = ['TSLA'];
const Market = {};
let YEAR, MONTH, DAY;
YEAR = MONTH = DAY = Infinity;
const iterate = async (startYear, endYear, action) => {
  for (let i = startYear; i <= Math.min(endYear, YEAR); i++) {
    const unfinishedYear = i == YEAR, d = [0, 31, i%4 == 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let l = 1; l <= (unfinishedYear ? Math.min(MONTH, 12) : 12); l++) {
      const unfinishedMonth = unfinishedYear && l == MONTH;
      for (let k = 1; k <= (unfinishedMonth ? Math.min(DAY, d[l]) : d[l]); k++) {
        if (!(await action(i, l, k))) return; // year, month, day
      }
    }
  }
}

console.log('------------------');
console.log('Mapping timeframe');
let now = Date.now();
iterate(1970, Infinity, async(y, m, d) => {
  now -= 86400000;
  if (now <= 0) {
    YEAR = y;
    MONTH = m;
    DAY = d-1; // Today isn't fully mapped!
    console.log('Date.now() renders today as '+y+'-'+m+'-'+d);
    return false;
  } else return true;
});
console.log('Mapped!');

const load = _ => {
  for (const ticker of tracked) {
    console.log('Loading ticker: '+ticker);
    Market[ticker] = {};
    iterate(startYear, YEAR, async(y, m, d) => {
      const filename = `${y}-${m < 10 ? '0'+m : m}-${d < 10 ? '0'+d : d}.json`;
      if (!fs.existsSync(filename)) {
        Market[ticker][filename] = [];
        return true;
      }
      try {
        Market[ticker][filename] = JSON.parse(filename);
      } catch(e) {
        console.warn(filename+' is corrupted!');
        Market[ticker][filename] = [];
      }
      return true;
    });
  }
}
const save = _ => {
  for (const ticker of tracked) {
    console.log('Saving ticker: '+ticker);
    iterate(startYear, YEAR, (y, m, d) => {
      const filename = `${ticker}-${y}-${m < 10 ? '0'+m : m}-${d < 10 ? '0'+d : d}.json`;
      if (!fs.existsSync(filename)) {
        console.log('Creating '+filename+'...');
        let s;
        try {
          fs.writeFileSync(filename, s = JSON.stringify(Market[ticker][filename]), 'utf-8');
        } catch(e) {
          console.log('Error writing file '+filename+'!');
        }
        console.log('Done! @ '+s.length+' char');
      } else console.log(filename+' exists, skipping!');
      return true;
    });
  }
}
load();
save();



/*
Market
  Ticker
    Day @ 2023-01-24 : [], // minutely

*/

async function example_getStocksAggregates() {
  try {
    const response = await rest.getStocksAggregates(
      {
        stocksTicker: "TSLA",
        multiplier: "1",
        timespan: "hour",
        from: "2025-11-01",
        to: "2025-11-30",
        adjusted: "true",
        sort: "asc",
      }
    );
    console.log('Response:', response);
  } catch (e) {
    console.error('An error happened:', e);
  }
}

//example_getStocksAggregates();








/*



const axios = require('axios');

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY;
if (!MASSIVE_API_KEY) {
  console.error('Set MASSIVE_API_KEY environment variable.');
  process.exit(1);
}

// ---------- Config ---------- //
const TICKER = 'AAPL';
const INTERVAL = '1h'; // '1m', '5m', '1h', '1d' depending on what Massive supports
const START = '2024-01-01T00:00:00Z';
const END = '2025-12-01T00:00:00Z';

const FAST_WINDOW = 20; // 20 unit moving average
const SLOW_WINDOW = 50; // 50 unit moving average

const INITIAL_CAPITAL = 100_000; // 100k
const RISK_PER_TRADE = 0.01; // 1%
const MAX_POSITION_FRACTION = 0.2;
const COMMISSION = 1.0;
const SLIPPAGE_PCT = 0.0005;
const STOP_LOSS_PCT = 0.02;
const TAKE_PROFIT_PCT = 0.04;

// ---------- Helpers ----------
function sma(values, window) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) {
      sum -= values[i - window];
    }
    if (i >= window - 1) {
      out[i] = sum / window;
    }
  }
  return out;
}

function computeSignals(closes) {
  const fast = sma(closes, FAST_WINDOW);
  const slow = sma(closes, SLOW_WINDOW);
  const signals = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (fast[i] !== null && slow[i] !== null && fast[i - 1] !== null && slow[i - 1] !== null) {
      if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) signals[i] = 1;     // entry
      if (fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) signals[i] = -1;    // exit
    }
  }
  return { fast, slow, signals };
}

function positionSize(equity, entryPrice, stopPrice) {
  const riskAmount = equity * RISK_PER_TRADE;
  const perShareRisk = Math.max(1e-8, entryPrice - stopPrice);
  let shares = Math.floor(riskAmount / perShareRisk);
  const maxShares = Math.floor((equity * MAX_POSITION_FRACTION) / entryPrice);
  return Math.max(0, Math.min(shares, maxShares));
}

// ---------- Fetch historical candles from Massive ----------
async function fetchCandles(ticker, interval, start, end) {
  // Example REST path — consult Massive docs for exact path & params. :contentReference[oaicite:3]{index=3}
  // Here we assume a GET like: /v1/stocks/{ticker}/candles?interval=...&start=...&end=...
  const url = `https://api.massive.com/v1/stocks/${encodeURIComponent(ticker)}/candles`;
  const params = { interval, start, end, limit: 10000 };
  const headers = { Authorization: `Bearer ${MASSIVE_API_KEY}` };

  const resp = await axios.get(url, { params, headers });
  // Massive returns JSON with an array of candle objects; adapt to the exact shape in your account.
  return resp.data; 
}

// ---------- Backtest engine ----------
function backtestFromCandles(candles) {
  // Ensure ascending time order
  candles.sort((a, b) => new Date(a.t) - new Date(b.t)); // using 't' as timestamp field placeholder
  const closes = candles.map(c => Number(c.c)); // 'c' = close (adjust to API shape)
  const times = candles.map(c => c.t);

  const { signals } = computeSignals(closes);

  let cash = INITIAL_CAPITAL;
  let position = 0;
  let entryPrice = null;
  let equitySeries = [];
  let trades = [];

  for (let i = 0; i < closes.length; i++) {
    const price = closes[i];
    const timestamp = times[i];
    const marketValue = position * price;
    const totalEquity = cash + marketValue;
    equitySeries.push({ timestamp, equity: totalEquity });

    // Stop/T/P checks
    if (position > 0) {
      if (price <= entryPrice * (1 - STOP_LOSS_PCT)) {
        const execPrice = price * (1 - SLIPPAGE_PCT);
        const proceeds = position * execPrice - COMMISSION;
        const pnl = proceeds - (position * entryPrice);
        cash += proceeds;
        trades.push({ entryPrice, exitPrice: execPrice, shares: position, pnl, entryIdx: null, exitIdx: i });
        position = 0;
        entryPrice = null;
        continue;
      } else if (price >= entryPrice * (1 + TAKE_PROFIT_PCT)) {
        const execPrice = price * (1 - SLIPPAGE_PCT);
        const proceeds = position * execPrice - COMMISSION;
        const pnl = proceeds - (position * entryPrice);
        cash += proceeds;
        trades.push({ entryPrice, exitPrice: execPrice, shares: position, pnl, entryIdx: null, exitIdx: i });
        position = 0;
        entryPrice = null;
        continue;
      }
    }

    // Signals
    if (signals[i] === 1 && position === 0) {
      const execPrice = price * (1 + SLIPPAGE_PCT);
      const stopPrice = execPrice * (1 - STOP_LOSS_PCT);
      const shares = positionSize(cash + marketValue, execPrice, stopPrice);
      const cost = shares * execPrice + COMMISSION;
      if (shares > 0 && cash >= cost) {
        cash -= cost;
        position = shares;
        entryPrice = execPrice;
        // store entry index if desired
      }
    } else if (signals[i] === -1 && position > 0) {
      const execPrice = price * (1 - SLIPPAGE_PCT);
      const proceeds = position * execPrice - COMMISSION;
      const pnl = proceeds - (position * entryPrice);
      cash += proceeds;
      trades.push({ entryPrice, exitPrice: execPrice, shares: position, pnl, entryIdx: null, exitIdx: i });
      position = 0;
      entryPrice = null;
    }
  }

  // final equity
  const finalEquity = cash + position * closes[closes.length - 1];
  const totalReturn = (finalEquity / INITIAL_CAPITAL) - 1;
  const wins = trades.filter(t => t.pnl > 0);
  const winRate = trades.length ? (wins.length / trades.length) : NaN;

  return { equitySeries, trades, finalEquity, totalReturn, winRate };
}

// ---------- Main ----------
(async function main() {
  try {
    console.log('Fetching candles from Massive for', TICKER);
    const raw = await fetchCandles(TICKER, INTERVAL, START, END);
    // Inspect raw to find the correct field names (example assumes array of {t, o, h, l, c, v})
    if (!Array.isArray(raw)) {
      console.error('Unexpected Massive response shape — check docs. Sample response:', raw);
      process.exit(1);
    }
    const result = backtestFromCandles(raw);

    console.log('Total trades:', result.trades.length);
    console.log('Total return: ', (result.totalReturn * 100).toFixed(2), '%');
    console.log('Final equity: $', result.finalEquity.toFixed(2));
    console.log('Win rate:', (result.winRate * 100).toFixed(1), '%');
    console.log('Sample trades:', result.trades.slice(0, 10));
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
})();
*/
