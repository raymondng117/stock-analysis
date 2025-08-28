const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Static')));

// TradingView scraper class
class TradingViewScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async getStockData(symbol, date) {
    try {
      const page = await this.browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Navigate to TradingView chart
      const url = `https://www.tradingview.com/chart/?symbol=${symbol}`;
      await page.goto(url, { waitUntil: 'networkidle2' });

      // Wait for chart to load
      await page.waitForTimeout(3000);

      // Extract volume data using JavaScript evaluation
      const stockData = await page.evaluate(() => {
        // This is a simplified approach - in practice, you'd need to interact with TradingView's API
        // or parse the chart data more sophisticated way
        const volumeElement = document.querySelector('[data-name="volume"]');
        const priceElement = document.querySelector('[data-name="last-price"]');

        return {
          volume: volumeElement ? volumeElement.textContent : null,
          price: priceElement ? priceElement.textContent : null,
          timestamp: Date.now()
        };
      });

      await page.close();
      return stockData;
    } catch (error) {
      console.error(`Error scraping data for ${symbol}:`, error);
      return null;
    }
  }

  // Alternative method using TradingView's public API (when available)
  async getStockDataAPI(symbol, date) {
    try {
      // This uses a more reliable approach with actual financial data
      // Note: In production, you'd want to use a proper financial data API
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          range: '1mo',
          interval: '1d'
        }
      });

      const data = response.data.chart.result[0];
      const meta = data.meta;
      const timestamps = data.timestamp;
      const volumes = data.indicators.quote[0].volume;
      const closes = data.indicators.quote[0].close;

      // Find the specific date or use the latest
      let targetIndex = timestamps.length - 1;
      if (date) {
        const targetDate = new Date(date);
        targetIndex = timestamps.findIndex(ts => {
          const tsDate = new Date(ts * 1000);
          return tsDate.toDateString() === targetDate.toDateString();
        });
        if (targetIndex === -1) targetIndex = timestamps.length - 1;
      }

      // Calculate 10-day average volume
      const start = Math.max(0, targetIndex - 9);
      const volumeSlice = volumes.slice(start, targetIndex + 1).filter(v => v !== null);
      const avgVolume = volumeSlice.length > 0 ?
        volumeSlice.reduce((sum, vol) => sum + vol, 0) / volumeSlice.length : 0;

      const currentVolume = volumes[targetIndex] || 0;
      const vlRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

      // Calculate price change percentage
      const currentPrice = closes[targetIndex];
      const previousPrice = closes[targetIndex - 1] || currentPrice;
      const priceChange = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;

      return {
        symbol,
        currentVolume,
        avgVolume,
        vlRatio,
        price: currentPrice,
        priceChange: parseFloat(priceChange.toFixed(2)),
        timestamp: timestamps[targetIndex] * 1000,
        date: new Date(timestamps[targetIndex] * 1000).toDateString()
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  }
}

// Initialize scraper
const scraper = new TradingViewScraper();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../Static/index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Stock Analysis API is running' });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { symbols, date } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    // Always include benchmarks
    const benchmarks = ['QQQ', 'SPY', 'IWM'];
    const allSymbols = [...new Set([...benchmarks, ...symbols])];

    console.log(`Analyzing symbols: ${allSymbols.join(', ')} for date: ${date || 'latest'}`);

    // Initialize browser if not already done
    if (!scraper.browser) {
      await scraper.initialize();
    }

    // Fetch data for all symbols
    const promises = allSymbols.map(symbol => scraper.getStockDataAPI(symbol, date));
    const results = await Promise.all(promises);

    // Filter out null results and process data
    const validResults = results.filter(result => result !== null);

    if (validResults.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch data for any symbols' });
    }

    // Find benchmark VL ratios for comparison
    const qqq = validResults.find(r => r.symbol === 'QQQ');
    const spy = validResults.find(r => r.symbol === 'SPY');
    const iwm = validResults.find(r => r.symbol === 'IWM');

    // Calculate comparisons based on price change ratio
    const analysisResults = validResults.map(stock => {
      const compareToQQQ = qqq && qqq.priceChange !== 0 ? stock.priceChange / qqq.priceChange : 1;
      const compareToSPY = spy && spy.priceChange !== 0 ? stock.priceChange / spy.priceChange : 1;
      const compareToIWM = iwm && iwm.priceChange !== 0 ? stock.priceChange / iwm.priceChange : 1;

      return {
        symbol: stock.symbol,
        vlRatio: parseFloat(stock.vlRatio.toFixed(3)),
        currentVolume: stock.currentVolume,
        avgVolume: Math.round(stock.avgVolume),
        price: stock.price,
        priceChange: stock.priceChange,
        date: stock.date,
        comparisons: {
          vs_QQQ: {
            ratio: parseFloat(compareToQQQ.toFixed(3)),
            status: compareToQQQ > 1 ? 'stronger' : 'weaker'
          },
          vs_SPY: {
            ratio: parseFloat(compareToSPY.toFixed(3)),
            status: compareToSPY > 1 ? 'stronger' : 'weaker'
          },
          vs_IWM: {
            ratio: parseFloat(compareToIWM.toFixed(3)),
            status: compareToIWM > 1 ? 'stronger' : 'weaker'
          }
        }
      };
    });

    res.json({
      success: true,
      data: analysisResults,
      timestamp: new Date().toISOString(),
      requestDate: date || 'latest'
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await scraper.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await scraper.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Stock Analysis API server running on port ${PORT}`);
});
