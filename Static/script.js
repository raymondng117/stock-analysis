// Stock Analysis Frontend JavaScript

class StockAnalyzer {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3001/api';
        this.benchmarks = ['QQQ', 'SPY', 'IWM'];

        // Predefined stocks array - customize this array with your preferred stocks
        this.defaultStocks = [
            'VSAT', 'UUUU', 'UPST', 'TEM', 'ROG', 'PKE',
            'OSS', 'ONTO', 'MP', 'LUMN', 'LITE', 'LEU', 'GLW',
            'CRDO', 'COHR', 'CLS', 'BE', 'AVAV'
        ];

        // Store analysis results for download
        this.lastAnalysisData = null;

        // Sorting state
        this.currentSort = {
            column: null,
            direction: 'asc'
        };

        this.initializeEventListeners();
        this.prefillStockSymbols();
    }

    initializeEventListeners() {
        const form = document.getElementById('analysisForm');
        const errorAlert = document.getElementById('errorAlert');
        const downloadBtn = document.getElementById('downloadBtn');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.performAnalysis();
        });

        // Download button event listener
        downloadBtn.addEventListener('click', () => {
            this.downloadExcel();
        });

        // Close error alert
        errorAlert.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-close')) {
                this.hideError();
            }
        });

        // Set default date to today in Hong Kong timezone and set max date
        this.setupDateInput();
    }

    setupDateInput() {
        const dateInput = document.getElementById('analysisDate');

        // Get current date in Hong Kong timezone (UTC+8)
        const now = new Date();
        const hongKongTime = new Date(now.getTime() + (8 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
        const today = hongKongTime.toISOString().split('T')[0];

        // Set default value to today (HK time)
        dateInput.value = today;

        // Set maximum selectable date to today (HK time)
        dateInput.max = today;

        // Add event listener to prevent future date selection
        dateInput.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            if (selectedDate > today) {
                e.target.value = today;
                this.showError('Cannot select future dates. Date has been reset to today (Hong Kong time).');
            }
        });
    }

    prefillStockSymbols() {
        // Prefill the stock symbols input with default stocks
        const stockInput = document.getElementById('stockSymbols');
        stockInput.value = this.defaultStocks.join(', ');
    }

    async performAnalysis() {
        try {
            this.showLoading();
            this.hideError();
            this.hideResults();

            const symbols = this.getSymbolsFromInput();
            const date = document.getElementById('analysisDate').value;

            console.log('Analyzing symbols:', symbols, 'for date:', date);

            const response = await fetch(`${this.apiBaseUrl}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symbols: symbols,
                    date: date || null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Analysis results:', data);

            this.displayResults(data);

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(`Analysis failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    getSymbolsFromInput() {
        const input = document.getElementById('stockSymbols').value;
        return input
            .split(',')
            .map(symbol => symbol.trim().toUpperCase())
            .filter(symbol => symbol.length > 0);
    }

    displayResults(data) {
        const tableBody = document.getElementById('resultsTableBody');
        const lastUpdated = document.getElementById('lastUpdated');
        const downloadBtn = document.getElementById('downloadBtn');

        // Store data for download functionality
        this.lastAnalysisData = data;

        // Initialize table headers for sorting
        this.initializeTableSorting();

        // Clear existing results
        tableBody.innerHTML = '';

        // Sort results to show benchmarks first (initial sort)
        const sortedData = this.sortDataWithBenchmarksFirst(data.data);

        sortedData.forEach(stock => {
            const row = this.createTableRow(stock);
            tableBody.appendChild(row);
        });

        // Update timestamp
        lastUpdated.textContent = new Date(data.timestamp).toLocaleString();

        // Show download button
        downloadBtn.style.display = 'block';

        // Show results with animation
        this.showResults();
    }

    sortDataWithBenchmarksFirst(data) {
        return data.sort((a, b) => {
            const aIsBenchmark = this.benchmarks.includes(a.symbol);
            const bIsBenchmark = this.benchmarks.includes(b.symbol);

            if (aIsBenchmark && !bIsBenchmark) return -1;
            if (!aIsBenchmark && bIsBenchmark) return 1;

            // If both are benchmarks, sort by predefined order
            if (aIsBenchmark && bIsBenchmark) {
                return this.benchmarks.indexOf(a.symbol) - this.benchmarks.indexOf(b.symbol);
            }

            // If neither is benchmark, sort alphabetically
            return a.symbol.localeCompare(b.symbol);
        });
    }

    createTableRow(stock) {
        const row = document.createElement('tr');
        const isBenchmark = this.benchmarks.includes(stock.symbol);
        if (isBenchmark) {
            row.classList.add('benchmark-row');
        }

        // Determine TradingView symbol prefix (default to NASDAQ, fallback to NYSE for SPY/IWM)
        let tvPrefix = 'NASDAQ';
        if (stock.symbol === 'SPY' || stock.symbol === 'IWM') tvPrefix = 'NYSEARCA';
        if (stock.symbol === 'QQQ') tvPrefix = 'NASDAQ';
        // You can expand this logic for other exchanges if needed

        const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvPrefix + ':' + stock.symbol)}`;

        row.innerHTML = `
            <td>
                <a href="${tvUrl}" class="symbol-badge ${isBenchmark ? 'benchmark-symbol' : ''}" target="_blank" rel="noopener noreferrer" title="View ${stock.symbol} on TradingView">
                    ${stock.symbol}
                </a>
                ${isBenchmark ? '<br><small class="text-muted">Benchmark</small>' : ''}
            </td>
            <td>
                <span class="price-change ${stock.priceChange > 0 ? 'positive' : stock.priceChange < 0 ? 'negative' : 'neutral'}">${stock.priceChange !== undefined ? stock.priceChange.toFixed(2) + '%' : 'N/A'}</span>
            </td>
            <td>
                <span class="vl-ratio">${stock.vlRatio}</span>
                <br>
                <small class="text-muted">
                    ${this.formatNumber(stock.currentVolume)} / ${this.formatNumber(stock.avgVolume)}
                </small>
            </td>
            <td>${this.createComparisonBadge(stock.comparisons.vs_QQQ, stock.symbol, 'QQQ')}</td>
            <td>${this.createComparisonBadge(stock.comparisons.vs_SPY, stock.symbol, 'SPY')}</td>
            <td>${this.createComparisonBadge(stock.comparisons.vs_IWM, stock.symbol, 'IWM')}</td>
            <td>
                <span class="price-display">$${stock.price ? stock.price.toFixed(2) : 'N/A'}</span>
            </td>
            <td>
                <span class="volume-display">${this.formatNumber(stock.currentVolume)}</span>
            </td>
        `;

        row.classList.add('fade-in');
        return row;
    }

    createComparisonBadge(comparison, stockSymbol, benchmarkType) {
        const ratio = comparison.ratio;
        const status = comparison.status;

        // If the stock is the same as the benchmark, don't compare
        if (stockSymbol === benchmarkType) {
            return '<span class="badge-container"><span class="no-compare-line">-</span></span>';
        }

        // Adjust status: if ratio is 1, it's neutral
        let adjustedStatus = status;
        if (ratio === 1) {
            adjustedStatus = 'neutral';
        }

        let badgeClass = 'badge-neutral';
        let icon = 'fas fa-minus';
        let text = 'Neutral';

        if (adjustedStatus === 'stronger') {
            badgeClass = 'badge-stronger';
            icon = 'fas fa-arrow-up';
            text = 'Stronger';
        } else if (adjustedStatus === 'weaker') {
            badgeClass = 'badge-weaker';
            icon = 'fas fa-arrow-down';
            text = 'Weaker';
        }

        return `
            <span class="badge-container">
                <span class="badge ${badgeClass}">
                    <i class="${icon} me-1"></i>
                    ${text}
                </span>
                <br>
                <small class="comparison-ratio">${ratio}x</small>
            </span>
        `;
    }

    formatNumber(num) {
        if (num >= 1e9) {
            return (num / 1e9).toFixed(1) + 'B';
        } else if (num >= 1e6) {
            return (num / 1e6).toFixed(1) + 'M';
        } else if (num >= 1e3) {
            return (num / 1e3).toFixed(1) + 'K';
        } else {
            return num.toString();
        }
    }

    initializeTableSorting() {
        const tableHeaders = document.querySelectorAll('#resultsTable thead th');

        tableHeaders.forEach((header, index) => {
            // Make headers clickable
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';

            // Add sort indicator
            if (!header.querySelector('.sort-indicator')) {
                const sortIndicator = document.createElement('span');
                sortIndicator.className = 'sort-indicator ms-2';
                sortIndicator.innerHTML = '<i class="fas fa-sort text-muted"></i>';
                header.appendChild(sortIndicator);
            }

            // Add click event
            header.onclick = () => this.sortTable(index);
        });
    }

    sortTable(columnIndex) {
        if (!this.lastAnalysisData) return;

        const columns = ['symbol', 'priceChange', 'vlRatio', 'vsQQQ', 'vsSPY', 'vsIWM', 'price', 'volume'];
        const column = columns[columnIndex];

        // Toggle sort direction
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }

        // Update sort indicators
        this.updateSortIndicators(columnIndex);

        // Sort and re-render data
        const sortedData = this.sortData(this.lastAnalysisData.data, column, this.currentSort.direction);
        this.renderTableData(sortedData);
    }

    updateSortIndicators(activeColumnIndex) {
        const headers = document.querySelectorAll('#resultsTable thead th');

        headers.forEach((header, index) => {
            const indicator = header.querySelector('.sort-indicator i');
            if (indicator) {
                if (index === activeColumnIndex) {
                    indicator.className = this.currentSort.direction === 'asc'
                        ? 'fas fa-sort-up text-primary'
                        : 'fas fa-sort-down text-primary';
                } else {
                    indicator.className = 'fas fa-sort text-muted';
                }
            }
        });
    }

    sortData(data, column, direction) {
        // Separate benchmarks from regular stocks
        const benchmarks = data.filter(stock => this.benchmarks.includes(stock.symbol));
        const regularStocks = data.filter(stock => !this.benchmarks.includes(stock.symbol));

        // Sort benchmarks in predefined order (QQQ, SPY, IWM)
        const sortedBenchmarks = benchmarks.sort((a, b) => {
            return this.benchmarks.indexOf(a.symbol) - this.benchmarks.indexOf(b.symbol);
        });

        // Sort only the regular stocks
        const sortedRegularStocks = [...regularStocks].sort((a, b) => {
            let aValue, bValue;

            switch (column) {
                case 'symbol':
                    aValue = a.symbol;
                    bValue = b.symbol;
                    break;
                case 'priceChange':
                    aValue = a.priceChange || 0;
                    bValue = b.priceChange || 0;
                    break;
                case 'vlRatio':
                    aValue = a.vlRatio;
                    bValue = b.vlRatio;
                    break;
                case 'vsQQQ':
                    aValue = a.comparisons.vs_QQQ.ratio;
                    bValue = b.comparisons.vs_QQQ.ratio;
                    break;
                case 'vsSPY':
                    aValue = a.comparisons.vs_SPY.ratio;
                    bValue = b.comparisons.vs_SPY.ratio;
                    break;
                case 'vsIWM':
                    aValue = a.comparisons.vs_IWM.ratio;
                    bValue = b.comparisons.vs_IWM.ratio;
                    break;
                case 'price':
                    aValue = a.price || 0;
                    bValue = b.price || 0;
                    break;
                case 'volume':
                    aValue = a.currentVolume;
                    bValue = b.currentVolume;
                    break;
                default:
                    return 0;
            }

            if (typeof aValue === 'string') {
                return direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else {
                return direction === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }
        });

        // Return benchmarks first, then sorted regular stocks
        return [...sortedBenchmarks, ...sortedRegularStocks];
    }

    renderTableData(data) {
        const tableBody = document.getElementById('resultsTableBody');
        tableBody.innerHTML = '';

        data.forEach(stock => {
            const row = this.createTableRow(stock);
            tableBody.appendChild(row);
        });
    }

    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('analyzeBtn').innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Analyzing...
        `;
    }

    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('analyzeBtn').disabled = false;
        document.getElementById('analyzeBtn').innerHTML = `
            <i class="fas fa-play me-2"></i>
            Analyze
        `;
    }

    showError(message) {
        const errorAlert = document.getElementById('errorAlert');
        const errorMessage = document.getElementById('errorMessage');

        errorMessage.textContent = message;
        errorAlert.style.display = 'block';
        errorAlert.classList.add('fade-in');
    }

    hideError() {
        const errorAlert = document.getElementById('errorAlert');
        errorAlert.style.display = 'none';
    }

    showResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.style.display = 'block';
        resultsContainer.classList.add('slide-up');

        // Scroll to results
        resultsContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    hideResults() {
        document.getElementById('resultsContainer').style.display = 'none';
        document.getElementById('downloadBtn').style.display = 'none';
    }

    downloadExcel() {
        if (!this.lastAnalysisData) {
            this.showError('No data available to download. Please run an analysis first.');
            return;
        }

        try {
            // Create workbook data
            const workbook = this.createExcelWorkbook(this.lastAnalysisData);

            // Convert to CSV format (Excel compatible)
            const csvContent = this.convertToCSV(workbook);

            // Create download
            this.downloadCSVFile(csvContent, `stock_analysis_${new Date().toISOString().split('T')[0]}.csv`);

        } catch (error) {
            console.error('Download failed:', error);
            this.showError('Failed to download data. Please try again.');
        }
    }

    createExcelWorkbook(data) {
        // Sort data with benchmarks first
        const sortedData = this.sortDataWithBenchmarksFirst(data.data);

        // Create headers
        const headers = [
            'Symbol',
            'VL Ratio',
            'Current Volume',
            'Average Volume (10 days)',
            'Price Change (%)',
            'vs QQQ Ratio',
            'vs QQQ Status',
            'vs SPY Ratio',
            'vs SPY Status',
            'vs IWM Ratio',
            'vs IWM Status',
            'Price ($)',
            'Date',
            'Analysis Timestamp'
        ];

        // Create data rows
        const rows = sortedData.map(stock => [
            stock.symbol,
            stock.vlRatio,
            stock.currentVolume,
            stock.avgVolume,
            stock.priceChange,
            stock.comparisons.vs_QQQ.ratio,
            stock.comparisons.vs_QQQ.status,
            stock.comparisons.vs_SPY.ratio,
            stock.comparisons.vs_SPY.status,
            stock.comparisons.vs_IWM.ratio,
            stock.comparisons.vs_IWM.status,
            stock.price || 'N/A',
            stock.date || 'Latest',
            new Date(data.timestamp).toLocaleString()
        ]);

        return {
            headers,
            rows,
            metadata: {
                title: 'Stock Volume Analysis Report',
                generated: new Date().toLocaleString(),
                requestDate: data.requestDate || 'Latest'
            }
        };
    }

    convertToCSV(workbook) {
        const { headers, rows, metadata } = workbook;

        let csvContent = '';

        // Add metadata header
        csvContent += `"${metadata.title}"\n`;
        csvContent += `"Generated: ${metadata.generated}"\n`;
        csvContent += `"Request Date: ${metadata.requestDate}"\n`;
        csvContent += '\n'; // Empty line

        // Add column headers
        csvContent += headers.map(header => `"${header}"`).join(',') + '\n';

        // Add data rows
        rows.forEach(row => {
            const csvRow = row.map(cell => {
                // Handle different data types
                if (typeof cell === 'string') {
                    return `"${cell.replace(/"/g, '""')}"`;
                } else if (typeof cell === 'number') {
                    return cell.toString();
                } else {
                    return `"${String(cell)}"`;
                }
            }).join(',');
            csvContent += csvRow + '\n';
        });

        // Add formulas section
        csvContent += '\n'; // Empty line
        csvContent += '"Analysis Summary:"\n';
        csvContent += '"Average VL Ratio:","=AVERAGE(B6:B' + (rows.length + 5) + ')"\n';
        csvContent += '"Average Price Change (%):","=AVERAGE(E6:E' + (rows.length + 5) + ')"\n';
        csvContent += '"Stocks Outperforming QQQ:","=COUNTIF(G6:G' + (rows.length + 5) + ',"stronger")"\n';
        csvContent += '"Stocks Outperforming SPY:","=COUNTIF(I6:I' + (rows.length + 5) + ',"stronger")"\n';
        csvContent += '"Stocks Outperforming IWM:","=COUNTIF(K6:K' + (rows.length + 5) + ',"stronger")"\n';

        return csvContent;
    }

    downloadCSVFile(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    // API Health Check
    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            const data = await response.json();
            console.log('API Health:', data);
            return data.status === 'OK';
        } catch (error) {
            console.error('API Health Check failed:', error);
            return false;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const analyzer = new StockAnalyzer();

    // Check API health on load
    analyzer.checkAPIHealth().then(isHealthy => {
        if (!isHealthy) {
            analyzer.showError('Unable to connect to the API server. Please ensure the backend is running on port 3001.');
        }
    });

    // Add some example symbols as placeholder
    document.getElementById('stockSymbols').placeholder = 'e.g., AAPL, TSLA, NVDA, GOOGL, MSFT';
});
