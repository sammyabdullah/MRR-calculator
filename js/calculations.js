/**
 * MRR Calculator - Metric Calculations
 *
 * Replicates all formulas from the MRR spreadsheet.
 *
 * Input: customerData - array of objects:
 *   { name: string, revenue: number[] }
 *   where revenue[i] is the MRR for month i
 *
 * Input: dates - array of Date objects for each month column
 *
 * Output: object with all computed metric arrays
 */

function calculateMetrics(customerData, dates, netLossData) {
    const numMonths = dates.length;
    const numCustomers = customerData.length;

    // Helper: get revenue for customer c, month m (0-indexed). Before month 0, treat as 0.
    function rev(c, m) {
        if (m < 0 || m >= numMonths) return 0;
        return customerData[c].revenue[m] || 0;
    }

    // ===== MRR BRIDGE (Rows 263-267) =====

    const newMRR = [];       // Row 263
    const upgradeMRR = [];   // Row 264
    const downgradeMRR = []; // Row 265
    const churnMRR = [];     // Row 266
    const beginMRR = [];     // Row 262
    const endMRR = [];       // Row 267

    for (let m = 0; m < numMonths; m++) {
        let newVal = 0, upVal = 0, downVal = 0, churnVal = 0;

        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m);
            const prev = rev(c, m - 1);

            // New: current > 0 AND previous = 0
            if (curr > 0 && prev === 0) {
                newVal += curr;
            }

            // Upgrade: current > previous AND previous > 0 (existing customer increased)
            if (curr > prev && prev > 0) {
                upVal += (curr - prev);
            }

            // Downgrade: current < previous AND current > 0 (existing customer decreased but still active)
            if (curr < prev && curr > 0) {
                downVal += (curr - prev); // This will be negative
            }

            // Churn: current = 0 AND previous > 0
            if (curr === 0 && prev > 0) {
                churnVal += -prev; // Negative value
            }
        }

        newMRR[m] = newVal;
        upgradeMRR[m] = upVal;
        downgradeMRR[m] = downVal;
        churnMRR[m] = churnVal;
    }

    // Begin and End MRR
    for (let m = 0; m < numMonths; m++) {
        beginMRR[m] = m === 0 ? 0 : endMRR[m - 1];
        endMRR[m] = beginMRR[m] + newMRR[m] + upgradeMRR[m] + downgradeMRR[m] + churnMRR[m];
    }

    // ===== GROWTH DATA (Rows 270-275) =====

    const arr = endMRR.map(v => v * 12);    // Row 270
    const mrr = endMRR.slice();              // Row 271

    // New ARR: current ARR - ARR 12 months ago (Row 272)
    const newARR = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12) {
            newARR[m] = arr[m] - arr[m - 12];
        } else {
            newARR[m] = null;
        }
    }

    // YOY Growth: MRR / MRR 12 months ago - 1 (Row 273)
    const yoyGrowth = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12 && mrr[m - 12] !== 0) {
            yoyGrowth[m] = mrr[m] / mrr[m - 12] - 1;
        } else {
            yoyGrowth[m] = null;
        }
    }

    // Max Customer Win: largest MRR from a new customer (Row 274)
    const maxCustomerWin = [];
    for (let m = 0; m < numMonths; m++) {
        let maxVal = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m);
            const prev = rev(c, m - 1);
            if (curr > 0 && prev === 0) {
                maxVal = Math.max(maxVal, curr);
            }
        }
        maxCustomerWin[m] = maxVal || null;
    }

    // Average Customer Win (Row 275)
    const avgCustomerWin = [];
    for (let m = 0; m < numMonths; m++) {
        let total = 0, count = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m);
            const prev = rev(c, m - 1);
            if (curr > 0 && prev === 0) {
                total += curr;
                count++;
            }
        }
        avgCustomerWin[m] = count > 0 ? total / count : null;
    }

    // ===== RETENTION DATA (Rows 278-282) =====

    // Net New MRR = Upgrade + Downgrade + Churn (Row 278)
    const netNewMRR = [];
    for (let m = 0; m < numMonths; m++) {
        netNewMRR[m] = upgradeMRR[m] + downgradeMRR[m] + churnMRR[m];
    }

    // TTM NDR: (sum of 12 months of upgrades+downgrades+churn + beginMRR from 12 months ago) / beginMRR from 12 months ago (Row 279)
    const ttmNDR = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12) {
            const startBegin = beginMRR[m - 11]; // The begin value 12 months ago
            if (startBegin === 0) {
                ttmNDR[m] = null;
            } else {
                let sumUpgrades = 0, sumDowngrades = 0, sumChurn = 0;
                for (let i = m - 11; i <= m; i++) {
                    sumUpgrades += upgradeMRR[i];
                    sumDowngrades += downgradeMRR[i];
                    sumChurn += churnMRR[i];
                }
                ttmNDR[m] = (sumUpgrades + sumDowngrades + sumChurn + startBegin) / startBegin;
            }
        } else {
            ttmNDR[m] = null;
        }
    }

    // TTM GDR: (sum of 12 months of downgrades+churn + beginMRR from 12 months ago) / beginMRR from 12 months ago (Row 280)
    const ttmGDR = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12) {
            const startBegin = beginMRR[m - 11];
            if (startBegin === 0) {
                ttmGDR[m] = null;
            } else {
                let sumDowngrades = 0, sumChurn = 0;
                for (let i = m - 11; i <= m; i++) {
                    sumDowngrades += downgradeMRR[i];
                    sumChurn += churnMRR[i];
                }
                ttmGDR[m] = (sumDowngrades + sumChurn + startBegin) / startBegin;
            }
        } else {
            ttmGDR[m] = null;
        }
    }

    // Cohort NDR: sum of current revenue for customers active 12 months ago / end MRR 12 months ago (Row 281)
    const cohortNDR = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12 && endMRR[m - 12] !== 0) {
            let sumCurrent = 0;
            for (let c = 0; c < numCustomers; c++) {
                if (rev(c, m - 12) > 0) {
                    sumCurrent += rev(c, m);
                }
            }
            cohortNDR[m] = sumCurrent / endMRR[m - 12];
        } else {
            cohortNDR[m] = null;
        }
    }

    // Cohort GDR: for customers active 12mo ago, sum min(current, 12mo-ago) / end MRR 12 months ago (Row 282)
    const cohortGDR = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12 && endMRR[m - 12] !== 0) {
            let sumCapped = 0;
            for (let c = 0; c < numCustomers; c++) {
                const old = rev(c, m - 12);
                if (old > 0) {
                    const curr = rev(c, m);
                    sumCapped += Math.min(curr, old);
                }
            }
            cohortGDR[m] = sumCapped / endMRR[m - 12];
        } else {
            cohortGDR[m] = null;
        }
    }

    // ===== UPGRADE/DOWNGRADE/CHURN DETAILS (Rows 284-291) =====

    // Upgrade count (Row 284)
    const upgradeCount = [];
    for (let m = 0; m < numMonths; m++) {
        let count = 0;
        for (let c = 0; c < numCustomers; c++) {
            if (rev(c, m) > rev(c, m - 1) && rev(c, m - 1) > 0) count++;
        }
        upgradeCount[m] = count;
    }

    // Downgrade count (Row 285)
    const downgradeCount = [];
    for (let m = 0; m < numMonths; m++) {
        let count = 0;
        for (let c = 0; c < numCustomers; c++) {
            if (rev(c, m) < rev(c, m - 1) && rev(c, m) > 0) count++;
        }
        downgradeCount[m] = count;
    }

    // Max Upgrade (Row 286)
    const maxUpgrade = [];
    for (let m = 0; m < numMonths; m++) {
        let maxVal = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr > prev && prev > 0) {
                maxVal = Math.max(maxVal, curr - prev);
            }
        }
        maxUpgrade[m] = maxVal || null;
    }

    // Average Upgrade (Row 287)
    const avgUpgrade = [];
    for (let m = 0; m < numMonths; m++) {
        let total = 0, count = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr > prev && prev > 0) {
                total += (curr - prev);
                count++;
            }
        }
        avgUpgrade[m] = count > 0 ? total / count : null;
    }

    // Max Downgrade (Row 288) - will be negative
    const maxDowngrade = [];
    for (let m = 0; m < numMonths; m++) {
        let minVal = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr < prev && curr > 0) {
                minVal = Math.min(minVal, curr - prev);
            }
        }
        maxDowngrade[m] = minVal !== 0 ? minVal : null;
    }

    // Average Downgrade (Row 289) - will be negative
    const avgDowngrade = [];
    for (let m = 0; m < numMonths; m++) {
        let total = 0, count = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr < prev && curr > 0) {
                total += (curr - prev);
                count++;
            }
        }
        avgDowngrade[m] = count > 0 ? total / count : null;
    }

    // Max Churn (Row 290) - will be negative
    const maxChurn = [];
    for (let m = 0; m < numMonths; m++) {
        let minVal = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr === 0 && prev > 0) {
                minVal = Math.min(minVal, -prev);
            }
        }
        maxChurn[m] = minVal !== 0 ? minVal : null;
    }

    // Average Churn (Row 291) - will be negative
    const avgChurn = [];
    for (let m = 0; m < numMonths; m++) {
        let total = 0, count = 0;
        for (let c = 0; c < numCustomers; c++) {
            const curr = rev(c, m), prev = rev(c, m - 1);
            if (curr === 0 && prev > 0) {
                total += -prev;
                count++;
            }
        }
        avgChurn[m] = count > 0 ? total / count : null;
    }

    // ===== CUSTOMER COUNTS (Rows 294-302) =====

    // New customers (Row 295)
    const newCustomers = [];
    for (let m = 0; m < numMonths; m++) {
        let count = 0;
        for (let c = 0; c < numCustomers; c++) {
            if (rev(c, m) > 0 && rev(c, m - 1) === 0) count++;
        }
        newCustomers[m] = count;
    }

    // Churned customers (Row 296) - negative
    const churnedCustomers = [];
    for (let m = 0; m < numMonths; m++) {
        let count = 0;
        for (let c = 0; c < numCustomers; c++) {
            if (rev(c, m) === 0 && rev(c, m - 1) > 0) count++;
        }
        churnedCustomers[m] = -count;
    }

    // Begin & End customer counts (Rows 294, 297)
    const beginCustomers = [];
    const endCustomers = [];
    for (let m = 0; m < numMonths; m++) {
        beginCustomers[m] = m === 0 ? 0 : endCustomers[m - 1];
        endCustomers[m] = beginCustomers[m] + newCustomers[m] + churnedCustomers[m];
    }

    // ACV = End MRR / End Customers * 12 (Row 298)
    const acv = [];
    for (let m = 0; m < numMonths; m++) {
        acv[m] = endCustomers[m] > 0 ? (endMRR[m] / endCustomers[m]) * 12 : null;
    }

    // Largest Customer = MAX(revenue) * 12 (Row 299)
    const largestCustomer = [];
    for (let m = 0; m < numMonths; m++) {
        let maxVal = 0;
        for (let c = 0; c < numCustomers; c++) {
            maxVal = Math.max(maxVal, rev(c, m));
        }
        largestCustomer[m] = maxVal > 0 ? maxVal * 12 : null;
    }

    // Max Customer Concentration (Row 300)
    const maxConcentration = [];
    for (let m = 0; m < numMonths; m++) {
        maxConcentration[m] = (largestCustomer[m] && arr[m] > 0) ? largestCustomer[m] / arr[m] : null;
    }

    // Gross Customer Retention TTM (Row 301)
    const grossCustomerRetention = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12) {
            const startBegin = beginCustomers[m - 11];
            if (startBegin === 0) {
                grossCustomerRetention[m] = null;
            } else {
                let sumChurned = 0;
                for (let i = m - 11; i <= m; i++) {
                    sumChurned += churnedCustomers[i];
                }
                grossCustomerRetention[m] = (sumChurned + startBegin) / startBegin;
            }
        } else {
            grossCustomerRetention[m] = null;
        }
    }

    // Customer Growth YOY (Row 302)
    const customerGrowth = [];
    for (let m = 0; m < numMonths; m++) {
        if (m >= 12 && endCustomers[m - 12] > 0) {
            customerGrowth[m] = endCustomers[m] / endCustomers[m - 12] - 1;
        } else {
            customerGrowth[m] = null;
        }
    }

    // ===== TTM EFFICIENCY (Rows 307-312) =====

    let netLoss = null;
    let ttmNewARRoverLoss = null;
    let ttmPayback = null;
    let sixMoNewARRoverLoss = null;
    let sixMoPayback = null;

    if (netLossData && netLossData.length > 0) {
        netLoss = netLossData;

        // TTM New ARR / TTM Net Loss (Row 308)
        ttmNewARRoverLoss = [];
        ttmPayback = [];
        for (let m = 0; m < numMonths; m++) {
            if (m >= 11 && newARR[m] !== null) {
                let sumLoss = 0;
                let hasLoss = false;
                for (let i = m - 11; i <= m; i++) {
                    if (netLoss[i] !== null && netLoss[i] !== undefined) {
                        sumLoss += netLoss[i];
                        hasLoss = true;
                    }
                }
                if (hasLoss && sumLoss !== 0) {
                    const ratio = newARR[m] / (sumLoss * -1);
                    ttmNewARRoverLoss[m] = ratio;
                    ttmPayback[m] = ratio !== 0 ? 1 / ratio : null;
                } else {
                    ttmNewARRoverLoss[m] = null;
                    ttmPayback[m] = null;
                }
            } else {
                ttmNewARRoverLoss[m] = null;
                ttmPayback[m] = null;
            }
        }

        // 6mo New ARR / 6mo Net Loss (Row 311)
        sixMoNewARRoverLoss = [];
        sixMoPayback = [];
        for (let m = 0; m < numMonths; m++) {
            if (m >= 5) {
                let sumNew = 0;
                for (let i = m - 5; i <= m; i++) {
                    sumNew += newMRR[i] + upgradeMRR[i] + downgradeMRR[i] + churnMRR[i];
                }
                sumNew *= 12; // annualize

                let sumLoss = 0;
                let hasLoss = false;
                for (let i = m - 5; i <= m; i++) {
                    if (netLoss[i] !== null && netLoss[i] !== undefined) {
                        sumLoss += netLoss[i];
                        hasLoss = true;
                    }
                }
                if (hasLoss && sumLoss !== 0) {
                    const ratio = sumNew / (sumLoss * -1);
                    sixMoNewARRoverLoss[m] = ratio;
                    sixMoPayback[m] = ratio !== 0 ? 1 / ratio : null;
                } else {
                    sixMoNewARRoverLoss[m] = null;
                    sixMoPayback[m] = null;
                }
            } else {
                sixMoNewARRoverLoss[m] = null;
                sixMoPayback[m] = null;
            }
        }
    }

    return {
        dates,
        // MRR Bridge
        beginMRR,
        newMRR,
        upgradeMRR,
        downgradeMRR,
        churnMRR,
        endMRR,
        // Growth
        arr,
        mrr,
        newARR,
        yoyGrowth,
        maxCustomerWin,
        avgCustomerWin,
        // Retention
        netNewMRR,
        ttmNDR,
        ttmGDR,
        cohortNDR,
        cohortGDR,
        // Upgrade/Downgrade/Churn details
        upgradeCount,
        downgradeCount,
        maxUpgrade,
        avgUpgrade,
        maxDowngrade,
        avgDowngrade,
        maxChurn,
        avgChurn,
        // Customer counts
        beginCustomers,
        newCustomers,
        churnedCustomers,
        endCustomers,
        acv,
        largestCustomer,
        maxConcentration,
        grossCustomerRetention,
        customerGrowth,
        // Efficiency
        netLoss,
        ttmNewARRoverLoss,
        ttmPayback,
        sixMoNewARRoverLoss,
        sixMoPayback,
    };
}
