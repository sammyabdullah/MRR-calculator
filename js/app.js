/**
 * MRR Calculator - Application Logic
 * Handles file upload, data parsing, metric display, and charting.
 */

(function () {
    'use strict';

    // State
    let parsedCustomerData = null;
    let parsedDates = null;
    let computedMetrics = null;
    let chartInstances = [];

    // DOM refs
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const uploadError = document.getElementById('upload-error');
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    const netLossSection = document.getElementById('net-loss-section');
    const netLossInputs = document.getElementById('net-loss-inputs');
    const exportBtn = document.getElementById('export-btn');
    const efficiencySection = document.getElementById('efficiency-section');

    // ===== FILE UPLOAD =====

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    calculateBtn.addEventListener('click', runCalculations);
    exportBtn.addEventListener('click', exportResults);

    function handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
            showError('Please upload an .xlsx, .xls, or .csv file.');
            return;
        }

        hideError();
        fileInfo.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        fileInfo.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                parseFileData(e.target.result, ext);
            } catch (err) {
                showError('Error parsing file: ' + err.message);
            }
        };
        if (ext === 'csv') {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    }

    function parseFileData(data, ext) {
        let workbook;
        if (ext === 'csv') {
            workbook = XLSX.read(data, { type: 'string', cellDates: true });
        } else {
            workbook = XLSX.read(data, { type: 'array', cellDates: true });
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

        if (json.length < 2) {
            showError('File must have at least a header row and one data row.');
            return;
        }

        // Find the header row containing dates (may not be row 0 if sheet has leading empty rows)
        let headerRowIdx = -1;
        const dates = [];
        let dataStartCol = -1;

        for (let r = 0; r < json.length; r++) {
            const row = json[r];
            const rowDates = [];
            let rowStartCol = -1;

            for (let i = 0; i < row.length; i++) {
                const parsed = parseDate(row[i]);
                if (parsed) {
                    if (rowStartCol === -1) rowStartCol = i;
                    rowDates.push(parsed);
                }
            }

            // A valid header row should have at least 2 dates
            if (rowDates.length >= 2) {
                headerRowIdx = r;
                dates.push(...rowDates);
                dataStartCol = rowStartCol;
                break;
            }
        }

        if (headerRowIdx === -1 || dates.length === 0) {
            showError('Could not find date headers. Ensure the spreadsheet has a row with dates (e.g., 1/31/2024).');
            return;
        }

        // Parse customer data (rows after the header row)
        const customers = [];
        for (let r = headerRowIdx + 1; r < json.length; r++) {
            const row = json[r];
            // Get customer name (columns before the date columns)
            let name = '';
            for (let c = 0; c < dataStartCol; c++) {
                if (row[c] && typeof row[c] === 'string' && row[c].trim()) {
                    name = row[c].trim();
                }
            }
            if (!name) continue; // Skip rows without a customer name (empty rows or summary rows)

            const revenue = [];
            for (let c = dataStartCol; c < dataStartCol + dates.length; c++) {
                const val = parseFloat(row[c]) || 0;
                revenue.push(Math.max(0, val)); // Ensure non-negative
            }

            // Only include customers that have at least some revenue
            if (revenue.some(v => v > 0)) {
                customers.push({ name, revenue });
            }
        }

        if (customers.length === 0) {
            showError('No customer data with revenue found in the file.');
            return;
        }

        parsedCustomerData = customers;
        parsedDates = dates;

        fileInfo.textContent = `Loaded: ${customers.length} customers across ${dates.length} months (${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])})`;

        // Show net loss inputs
        buildNetLossInputs(dates);
        netLossSection.classList.remove('hidden');

        // Show calculate button
        calculateBtn.classList.remove('hidden');
        calculateBtn.disabled = false;
    }

    function parseDate(val) {
        // Return plain {year, month} objects to avoid timezone issues.
        // SheetJS cellDates creates UTC dates; using getMonth() in a non-UTC
        // timezone could shift the date to the wrong day/month.
        if (val instanceof Date && !isNaN(val.getTime())) {
            const y = val.getUTCFullYear();
            if (y > 1900) return { year: y, month: val.getUTCMonth() + 1 };
        }
        if (typeof val === 'number' && val > 365) {
            // Excel serial date number (365 = ~Jan 1901, reject small values like 0)
            const d = XLSX.SSF.parse_date_code(val);
            if (d && d.y > 1900) return { year: d.y, month: d.m };
        }
        if (typeof val === 'string') {
            const d = new Date(val);
            if (!isNaN(d.getTime()) && d.getUTCFullYear() > 1900) {
                return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
            }
        }
        return null;
    }

    function buildNetLossInputs(dates) {
        netLossInputs.innerHTML = '';
        dates.forEach((d, i) => {
            const group = document.createElement('div');
            group.className = 'net-loss-input-group';
            const label = document.createElement('label');
            label.textContent = formatDate(d);
            label.setAttribute('for', `net-loss-${i}`);
            const input = document.createElement('input');
            input.type = 'number';
            input.id = `net-loss-${i}`;
            input.placeholder = '0';
            input.step = 'any';
            group.appendChild(label);
            group.appendChild(input);
            netLossInputs.appendChild(group);
        });
    }

    // ===== CALCULATIONS =====

    function runCalculations() {
        if (!parsedCustomerData || !parsedDates) return;

        // Gather net loss data
        const netLossData = [];
        let hasAnyNetLoss = false;
        for (let i = 0; i < parsedDates.length; i++) {
            const input = document.getElementById(`net-loss-${i}`);
            const val = input && input.value !== '' ? parseFloat(input.value) : null;
            netLossData.push(val);
            if (val !== null) hasAnyNetLoss = true;
        }

        computedMetrics = calculateMetrics(
            parsedCustomerData,
            parsedDates,
            hasAnyNetLoss ? netLossData : null
        );

        renderResults(computedMetrics);
        resultsSection.classList.remove('hidden');

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    // ===== RENDERING =====

    function renderResults(m) {
        // Destroy old charts
        chartInstances.forEach(c => c.destroy());
        chartInstances = [];

        const labels = m.dates.map(d => formatDate(d));
        // Find first month with activity for display
        const firstActive = m.endMRR.findIndex(v => v > 0);
        const start = Math.max(0, firstActive);

        renderMRRBridgeTable(m, labels, start);
        renderGrowthTable(m, labels, start);
        renderRetentionTable(m, labels, start);
        renderUDCTable(m, labels, start);
        renderCustomerTable(m, labels, start);

        if (m.netLoss) {
            efficiencySection.classList.remove('hidden');
            renderEfficiencyTable(m, labels, start);
        } else {
            efficiencySection.classList.add('hidden');
        }

        // Charts
        renderMRRBridgeChart(m, labels, start);
        renderARRChart(m, labels, start);
        renderRetentionChart(m, labels, start);
        renderCustomerChart(m, labels, start);
    }

    // ===== TABLE RENDERERS =====

    function renderMRRBridgeTable(m, labels, start) {
        const rows = [
            { label: 'Begin', data: m.beginMRR, fmt: 'currency' },
            { label: 'New', data: m.newMRR, fmt: 'currency', cls: 'positive' },
            { label: 'Upgrade', data: m.upgradeMRR, fmt: 'currency', cls: 'positive' },
            { label: 'Downgrade', data: m.downgradeMRR, fmt: 'currency', cls: 'negative' },
            { label: 'Churn', data: m.churnMRR, fmt: 'currency', cls: 'negative' },
            { label: 'End', data: m.endMRR, fmt: 'currency', total: true },
        ];
        buildTable('mrr-bridge-table', rows, labels, start);
    }

    function renderGrowthTable(m, labels, start) {
        const rows = [
            { label: 'ARR', data: m.arr, fmt: 'currency' },
            { label: 'MRR', data: m.mrr, fmt: 'currency' },
            { label: 'New ARR (TTM)', data: m.newARR, fmt: 'currency' },
            { label: 'YOY Growth', data: m.yoyGrowth, fmt: 'percent' },
            { label: 'Max Customer Win', data: m.maxCustomerWin, fmt: 'currency' },
            { label: 'Avg Customer Win', data: m.avgCustomerWin, fmt: 'currency' },
        ];
        buildTable('growth-table', rows, labels, start);
    }

    function renderRetentionTable(m, labels, start) {
        const rows = [
            { label: 'Net New MRR', data: m.netNewMRR, fmt: 'currency' },
            { label: 'TTM NDR', data: m.ttmNDR, fmt: 'percent' },
            { label: 'TTM GDR', data: m.ttmGDR, fmt: 'percent' },
            { label: 'Cohort NDR', data: m.cohortNDR, fmt: 'percent' },
            { label: 'Cohort GDR', data: m.cohortGDR, fmt: 'percent' },
        ];
        buildTable('retention-table', rows, labels, start);
    }

    function renderUDCTable(m, labels, start) {
        const rows = [
            { label: 'Upgrades (#)', data: m.upgradeCount, fmt: 'number' },
            { label: 'Downgrades (#)', data: m.downgradeCount, fmt: 'number' },
            { label: 'Max Upgrade', data: m.maxUpgrade, fmt: 'currency' },
            { label: 'Avg Upgrade', data: m.avgUpgrade, fmt: 'currency' },
            { label: 'Max Downgrade', data: m.maxDowngrade, fmt: 'currency' },
            { label: 'Avg Downgrade', data: m.avgDowngrade, fmt: 'currency' },
            { label: 'Max Churn', data: m.maxChurn, fmt: 'currency' },
            { label: 'Avg Churn', data: m.avgChurn, fmt: 'currency' },
        ];
        buildTable('udc-table', rows, labels, start);
    }

    function renderCustomerTable(m, labels, start) {
        const rows = [
            { label: 'Begin', data: m.beginCustomers, fmt: 'number' },
            { label: 'New', data: m.newCustomers, fmt: 'number' },
            { label: 'Churn', data: m.churnedCustomers, fmt: 'number' },
            { label: 'End', data: m.endCustomers, fmt: 'number', total: true },
            { label: 'ACV', data: m.acv, fmt: 'currency' },
            { label: 'Largest Customer', data: m.largestCustomer, fmt: 'currency' },
            { label: 'Max Concentration', data: m.maxConcentration, fmt: 'percent' },
            { label: 'Gross Cust. Retention (TTM)', data: m.grossCustomerRetention, fmt: 'percent' },
            { label: 'Customer Growth (YOY)', data: m.customerGrowth, fmt: 'percent' },
        ];
        buildTable('customer-table', rows, labels, start);
    }

    function renderEfficiencyTable(m, labels, start) {
        const rows = [
            { label: 'Net Loss', data: m.netLoss, fmt: 'currency' },
            { label: 'TTM New ARR / TTM Net Loss', data: m.ttmNewARRoverLoss, fmt: 'ratio' },
            { label: 'Payback Period (TTM)', data: m.ttmPayback, fmt: 'ratio' },
            { label: '6mo New ARR / 6mo Net Loss', data: m.sixMoNewARRoverLoss, fmt: 'ratio' },
            { label: 'Payback Period (6mo)', data: m.sixMoPayback, fmt: 'ratio' },
        ];
        buildTable('efficiency-table', rows, labels, start);
    }

    function buildTable(tableId, rows, labels, start) {
        const table = document.getElementById(tableId);
        table.innerHTML = '';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Metric</th>';
        for (let i = start; i < labels.length; i++) {
            headerRow.innerHTML += `<th>${labels[i]}</th>`;
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            if (row.total) tr.classList.add('total-row');
            let html = `<td>${row.label}</td>`;
            for (let i = start; i < labels.length; i++) {
                const val = row.data[i];
                const formatted = formatValue(val, row.fmt);
                let cls = '';
                if (row.cls) {
                    cls = row.cls;
                } else if (row.fmt === 'currency' && typeof val === 'number') {
                    cls = val > 0 ? '' : val < 0 ? 'negative' : '';
                }
                html += `<td class="${cls}">${formatted}</td>`;
            }
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
    }

    // ===== CHART RENDERERS =====

    function renderMRRBridgeChart(m, labels, start) {
        const ctx = document.getElementById('mrr-bridge-chart').getContext('2d');
        const slicedLabels = labels.slice(start);
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: slicedLabels,
                datasets: [
                    { label: 'New', data: m.newMRR.slice(start), backgroundColor: '#40916c', stack: 'gains' },
                    { label: 'Upgrade', data: m.upgradeMRR.slice(start), backgroundColor: '#95d5b2', stack: 'gains' },
                    { label: 'Downgrade', data: m.downgradeMRR.slice(start), backgroundColor: '#e09f3e', stack: 'losses' },
                    { label: 'Churn', data: m.churnMRR.slice(start), backgroundColor: '#c1121f', stack: 'losses' },
                    {
                        label: 'End MRR',
                        data: m.endMRR.slice(start),
                        type: 'line',
                        borderColor: '#1b4332',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 1,
                        yAxisID: 'y',
                        order: -1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { ticks: { maxTicksLimit: 20, font: { size: 10 } } },
                    y: {
                        ticks: {
                            callback: v => '$' + abbreviateNumber(v),
                            font: { size: 10 },
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
                        },
                    },
                    legend: { position: 'top', labels: { font: { size: 11 } } },
                },
            },
        });
        chartInstances.push(chart);
    }

    function renderARRChart(m, labels, start) {
        const ctx = document.getElementById('arr-chart').getContext('2d');
        const slicedLabels = labels.slice(start);
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: slicedLabels,
                datasets: [
                    {
                        label: 'ARR',
                        data: m.arr.slice(start),
                        borderColor: '#2d6a4f',
                        backgroundColor: 'rgba(45, 106, 79, 0.08)',
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { maxTicksLimit: 20, font: { size: 10 } } },
                    y: {
                        ticks: {
                            callback: v => '$' + abbreviateNumber(v),
                            font: { size: 10 },
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => `ARR: ${formatCurrency(ctx.parsed.y)}`,
                        },
                    },
                    legend: { position: 'top', labels: { font: { size: 11 } } },
                },
            },
        });
        chartInstances.push(chart);
    }

    function renderRetentionChart(m, labels, start) {
        const ctx = document.getElementById('retention-chart').getContext('2d');
        // Only show from first non-null NDR
        const retStart = Math.max(start, m.ttmNDR.findIndex(v => v !== null));
        const slicedLabels = labels.slice(retStart);
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: slicedLabels,
                datasets: [
                    {
                        label: 'TTM NDR',
                        data: m.ttmNDR.slice(retStart),
                        borderColor: '#1b4332',
                        borderWidth: 2,
                        pointRadius: 1,
                    },
                    {
                        label: 'TTM GDR',
                        data: m.ttmGDR.slice(retStart),
                        borderColor: '#e09f3e',
                        borderWidth: 2,
                        pointRadius: 1,
                    },
                    {
                        label: 'Cohort NDR',
                        data: m.cohortNDR.slice(retStart),
                        borderColor: '#52b788',
                        borderWidth: 2,
                        pointRadius: 1,
                        borderDash: [5, 5],
                    },
                    {
                        label: 'Cohort GDR',
                        data: m.cohortGDR.slice(retStart),
                        borderColor: '#c1121f',
                        borderWidth: 2,
                        pointRadius: 1,
                        borderDash: [5, 5],
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { maxTicksLimit: 20, font: { size: 10 } } },
                    y: {
                        ticks: {
                            callback: v => (v * 100).toFixed(0) + '%',
                            font: { size: 10 },
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.y * 100).toFixed(1)}%`,
                        },
                    },
                    legend: { position: 'top', labels: { font: { size: 11 } } },
                },
            },
        });
        chartInstances.push(chart);
    }

    function renderCustomerChart(m, labels, start) {
        const ctx = document.getElementById('customer-chart').getContext('2d');
        const slicedLabels = labels.slice(start);
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: slicedLabels,
                datasets: [
                    { label: 'New', data: m.newCustomers.slice(start), backgroundColor: '#40916c' },
                    { label: 'Churn', data: m.churnedCustomers.slice(start), backgroundColor: '#c1121f' },
                    {
                        label: 'End Customers',
                        data: m.endCustomers.slice(start),
                        type: 'line',
                        borderColor: '#1b4332',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 1,
                        yAxisID: 'y',
                        order: -1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { ticks: { maxTicksLimit: 20, font: { size: 10 } } },
                    y: { ticks: { font: { size: 10 } } },
                },
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 11 } } },
                },
            },
        });
        chartInstances.push(chart);
    }

    // ===== EXPORT =====

    function exportResults() {
        if (!computedMetrics) return;

        const m = computedMetrics;
        const labels = m.dates.map(d => formatDate(d));

        const wb = XLSX.utils.book_new();

        // MRR Bridge sheet
        const bridgeData = [
            ['Metric', ...labels],
            ['Begin', ...m.beginMRR],
            ['New', ...m.newMRR],
            ['Upgrade', ...m.upgradeMRR],
            ['Downgrade', ...m.downgradeMRR],
            ['Churn', ...m.churnMRR],
            ['End', ...m.endMRR],
        ];
        const bridgeSheet = XLSX.utils.aoa_to_sheet(bridgeData);
        XLSX.utils.book_append_sheet(wb, bridgeSheet, 'MRR Bridge');

        // Growth sheet
        const growthData = [
            ['Metric', ...labels],
            ['ARR', ...m.arr],
            ['MRR', ...m.mrr],
            ['New ARR (TTM)', ...m.newARR.map(v => v ?? '')],
            ['YOY Growth', ...m.yoyGrowth.map(v => v ?? '')],
            ['Max Customer Win', ...m.maxCustomerWin.map(v => v ?? '')],
            ['Avg Customer Win', ...m.avgCustomerWin.map(v => v ?? '')],
        ];
        const growthSheet = XLSX.utils.aoa_to_sheet(growthData);
        XLSX.utils.book_append_sheet(wb, growthSheet, 'Growth');

        // Retention sheet
        const retData = [
            ['Metric', ...labels],
            ['Net New MRR', ...m.netNewMRR],
            ['TTM NDR', ...m.ttmNDR.map(v => v ?? '')],
            ['TTM GDR', ...m.ttmGDR.map(v => v ?? '')],
            ['Cohort NDR', ...m.cohortNDR.map(v => v ?? '')],
            ['Cohort GDR', ...m.cohortGDR.map(v => v ?? '')],
            ['Upgrades (#)', ...m.upgradeCount],
            ['Downgrades (#)', ...m.downgradeCount],
            ['Max Upgrade', ...m.maxUpgrade.map(v => v ?? '')],
            ['Avg Upgrade', ...m.avgUpgrade.map(v => v ?? '')],
            ['Max Downgrade', ...m.maxDowngrade.map(v => v ?? '')],
            ['Avg Downgrade', ...m.avgDowngrade.map(v => v ?? '')],
            ['Max Churn', ...m.maxChurn.map(v => v ?? '')],
            ['Avg Churn', ...m.avgChurn.map(v => v ?? '')],
        ];
        const retSheet = XLSX.utils.aoa_to_sheet(retData);
        XLSX.utils.book_append_sheet(wb, retSheet, 'Retention');

        // Customers sheet
        const custData = [
            ['Metric', ...labels],
            ['Begin', ...m.beginCustomers],
            ['New', ...m.newCustomers],
            ['Churn', ...m.churnedCustomers],
            ['End', ...m.endCustomers],
            ['ACV', ...m.acv.map(v => v ?? '')],
            ['Largest Customer', ...m.largestCustomer.map(v => v ?? '')],
            ['Max Concentration', ...m.maxConcentration.map(v => v ?? '')],
            ['Gross Cust. Retention (TTM)', ...m.grossCustomerRetention.map(v => v ?? '')],
            ['Customer Growth (YOY)', ...m.customerGrowth.map(v => v ?? '')],
        ];
        const custSheet = XLSX.utils.aoa_to_sheet(custData);
        XLSX.utils.book_append_sheet(wb, custSheet, 'Customers');

        XLSX.writeFile(wb, 'MRR_Metrics.xlsx');
    }

    // ===== FORMATTING HELPERS =====

    function formatDate(d) {
        if (!d) return '';
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${monthNames[d.month - 1]}-${String(d.year).slice(-2)}`;
    }

    function formatCurrency(val) {
        if (val === null || val === undefined) return '---';
        return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatValue(val, fmt) {
        if (val === null || val === undefined) return '---';
        switch (fmt) {
            case 'currency':
                return formatCurrency(val);
            case 'percent':
                return (val * 100).toFixed(1) + '%';
            case 'number':
                return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
            case 'ratio':
                return val.toFixed(2) + 'x';
            default:
                return String(val);
        }
    }

    function abbreviateNumber(val) {
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + 'M';
        if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(0) + 'K';
        return val.toFixed(0);
    }

    function showError(msg) {
        uploadError.textContent = msg;
        uploadError.classList.remove('hidden');
    }

    function hideError() {
        uploadError.classList.add('hidden');
    }
})();
