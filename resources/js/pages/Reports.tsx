// resources/js/pages/Reports.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import {
    Card,
    Row,
    Col,
    Button,
    DatePicker,
    Select,
    message,
    Space,
    Spin,
    Pagination,
} from 'antd';
import {
    FileExcelOutlined,
    PrinterOutlined,
    CarOutlined,
    FireOutlined,
    ReloadOutlined,
    DownloadOutlined,
    FileTextOutlined,
    CheckCircleOutlined,
    CalendarOutlined,
    CreditCardOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

const PAGE_SIZE = 10;

const COLORS = {
    primary: '#186049',
    secondary: '#0DCAF0',
    warning: '#FFC107',
    danger: '#AB2E3C',
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

const fmtPHP = (n?: number | null): string => {
    if (n === undefined || n === null) return '₱0.00';
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    }).format(n);
};

const fmtNum = (n?: number | null): string => {
    if (n === undefined || n === null) return '0';
    return new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(n);
};

const fmtPct = (n?: number | null): string => {
    if (n === undefined || n === null) return '0.0%';
    return `${n.toFixed(1)}%`;
};

// ─── Paginated wrapper (10 rows per page for every report table) ─────────────
//
// Renders the table via a render-prop with only the current page's rows.
// When `printing` is true, all rows are shown and the pager is hidden so the
// printed / PDF report is complete.

function Paginated<T>({
    rows,
    printing,
    children,
}: {
    rows: T[];
    printing: boolean;
    children: (visibleRows: T[]) => React.ReactNode;
}) {
    const [page, setPage] = useState(1);
    const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, maxPage);

    const visible = printing
        ? rows
        : rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

    return (
        <>
            {children(visible)}
            {!printing && rows.length > PAGE_SIZE && (
                <div className="report-pager">
                    <Pagination
                        size="small"
                        current={current}
                        pageSize={PAGE_SIZE}
                        total={rows.length}
                        showSizeChanger={false}
                        onChange={(p) => setPage(p)}
                        showTotal={(total, range) =>
                            `${range[0]}–${range[1]} of ${total}`
                        }
                    />
                </div>
            )}
        </>
    );
}

// ─── Report Data Shape ───────────────────────────────────────────────────────

interface ReportData {
    transactions: any[];
    summary: {
        total_revenue: number;
        total_transactions: number;
        average_transaction: number;
        total_cost?: number;
        total_profit?: number;
        parking_revenue?: number;
        parking_cost?: number;
        parking_profit?: number;
        fuel_revenue?: number;
        fuel_cost?: number;
        fuel_profit?: number;
        total_liters_sold?: number;
        total_parking_nights?: number;
        parking_transactions?: number;
        fuel_transactions?: number;
    };
    date_range: {
        start: string;
        end: string;
    };
}

// ─── Main Component ─────────────────────────────────────────────────────────

const Reports: React.FC = () => {
    const [reportType, setReportType] = useState<string>('combined');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [reportKey, setReportKey] = useState<number>(0); // resets every table's page on new report
    const [printing, setPrinting] = useState<boolean>(false);

    const [fuelProducts, setFuelProducts] = useState<{ id: number; type: string }[]>([]);
    const [fuelProductId, setFuelProductId] = useState<number | undefined>(undefined);

    useEffect(() => {
        api.get('/fuel-products')
            .then((r) => setFuelProducts(Array.isArray(r.data) ? r.data : []))
            .catch(() => setFuelProducts([]));
    }, []);

    // While printing (button OR Ctrl+P), show ALL rows instead of just page 1
    useEffect(() => {
        const before = () => flushSync(() => setPrinting(true));
        const after = () => setPrinting(false);
        window.addEventListener('beforeprint', before);
        window.addEventListener('afterprint', after);
        return () => {
            window.removeEventListener('beforeprint', before);
            window.removeEventListener('afterprint', after);
        };
    }, []);

    const generateReport = async () => {
        if (!dateRange) {
            message.warning('Please select a date range');
            return;
        }
        setLoading(true);
        try {
            const [start, end] = dateRange;
            const response = await api.get('/reports/generate', {
                params: {
                    type: reportType,
                    start_date: start.format('YYYY-MM-DD'),
                    end_date: end.format('YYYY-MM-DD'),
                    ...(fuelProductId && reportType === 'fuel'
                        ? { fuel_product_id: fuelProductId }
                        : {}),
                },
            });
            if (response.data) {
                setReportData(response.data);
                setReportKey((k) => k + 1);
                message.success('Report generated successfully');
            } else {
                message.warning('No data found');
            }
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Failed to generate report');
        } finally {
            setLoading(false);
        }
    };

    // ─── Derived analytics ────────────────────────────────────────────────

    const analysis = useMemo(() => {
        if (!reportData) return null;
        const txs = reportData.transactions || [];
        const s = reportData.summary;

        const parkingTxs = txs.filter((t) => t.type === 'parking');
        const fuelTxs = txs.filter((t) => t.type === 'fuel');

        const startDay = dayjs(reportData.date_range.start);
        const endDay = dayjs(reportData.date_range.end);
        const dayCount = Math.max(1, endDay.diff(startDay, 'day') + 1);

        const paymentBreakdown = (list: any[]) => {
            const map: Record<string, { count: number; amount: number }> = {};
            list.forEach((t) => {
                const method = (t.payment_method || 'cash').toLowerCase();
                if (!map[method]) map[method] = { count: 0, amount: 0 };
                map[method].count += 1;
                map[method].amount += Number(t.total_amount || 0);
            });
            return map;
        };

        const slotMap: Record<
            string,
            { slot: string; txns: number; nights: number; revenue: number }
        > = {};
        parkingTxs.forEach((t) => {
            const slot = t.slot_number || 'N/A';
            if (!slotMap[slot])
                slotMap[slot] = { slot, txns: 0, nights: 0, revenue: 0 };
            slotMap[slot].txns += 1;
            slotMap[slot].nights += Number(t.nights_stayed || 1);
            slotMap[slot].revenue += Number(t.total_amount || 0);
        });
        const slotBreakdown = Object.values(slotMap).sort(
            (a, b) => b.revenue - a.revenue,
        );

        const productMap: Record<
            string,
            {
                product: string;
                txns: number;
                liters: number;
                revenue: number;
                cost: number;
                profit: number;
            }
        > = {};
        fuelTxs.forEach((t) => {
            const product = t.fuel_product?.type || 'Unknown';
            if (!productMap[product])
                productMap[product] = {
                    product,
                    txns: 0,
                    liters: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                };
            const liters = Number(t.liters || 0);
            const cost = Number(t.total_cost || 0);
            const profit = Number(t.profit ?? Number(t.total_amount || 0) - cost);
            productMap[product].txns += 1;
            productMap[product].liters += liters;
            productMap[product].revenue += Number(t.total_amount || 0);
            productMap[product].cost += cost;
            productMap[product].profit += profit;
        });
        const productBreakdown = Object.values(productMap).sort(
            (a, b) => b.revenue - a.revenue,
        );

        const dailyMap: Record<
            string,
            { date: string; txns: number; revenue: number; cost: number; profit: number }
        > = {};
        txs.forEach((t) => {
            const date = t.date || dayjs(t.check_in_date).format('YYYY-MM-DD');
            if (!date) return;
            if (!dailyMap[date])
                dailyMap[date] = {
                    date,
                    txns: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                };
            const cost = Number(t.total_cost || 0);
            const profit =
                t.type === 'parking'
                    ? Number(t.profit ?? t.total_amount ?? 0)
                    : Number(t.profit ?? Number(t.total_amount || 0) - cost);
            dailyMap[date].txns += 1;
            dailyMap[date].revenue += Number(t.total_amount || 0);
            dailyMap[date].cost += cost;
            dailyMap[date].profit += profit;
        });
        const dailyBreakdown = Object.values(dailyMap).sort((a, b) =>
            a.date.localeCompare(b.date),
        );

        const hourMap: Record<string, number> = {};
        fuelTxs.forEach((t) => {
            if (!t.time) return;
            const hour = t.time.split(':')[0];
            hourMap[hour] = (hourMap[hour] || 0) + 1;
        });
        let peakHour: string | null = null;
        let peakCount = 0;
        Object.entries(hourMap).forEach(([h, c]) => {
            if (c > peakCount) {
                peakHour = h;
                peakCount = c;
            }
        });

        const avgNights =
            parkingTxs.length > 0
                ? parkingTxs.reduce((s, t) => s + Number(t.nights_stayed || 1), 0) /
                  parkingTxs.length
                : 0;

        const avgLiters =
            fuelTxs.length > 0
                ? fuelTxs.reduce((s, t) => s + Number(t.liters || 0), 0) /
                  fuelTxs.length
                : 0;

        const dailyAvgRev = (s.total_revenue || 0) / dayCount;

        const totalChange = txs.reduce(
            (sum, t) => sum + Number(t.change_amount || 0),
            0,
        );

        return {
            dayCount,
            parkingTxs,
            fuelTxs,
            paymentBreakdown,
            slotBreakdown,
            productBreakdown,
            dailyBreakdown,
            peakHour,
            peakCount,
            avgNights,
            avgLiters,
            dailyAvgRev,
            totalChange,
        };
    }, [reportData]);

    // ─── CSV Export ────────────────────────────────────────────────────────

    const exportExcel = () => {
        if (!reportData || !analysis) {
            message.warning('Please generate a report first');
            return;
        }

        const { summary, transactions, date_range } = reportData;
        const [start, end] = date_range ? [date_range.start, date_range.end] : ['', ''];
        const showCost = reportType !== 'parking';

        let csv = '';
        csv += '"PARK & FUEL MANAGEMENT SYSTEM"\n';
        csv += '"OFFICIAL BUSINESS REPORT"\n\n';
        csv += `"Report Type:","${reportType === 'parking' ? 'Parking' : reportType === 'fuel' ? 'Fuel' : 'Combined'}"\n`;
        csv += `"Period:","${start} to ${end}"\n`;
        csv += `"Days Covered:",${analysis.dayCount}\n`;
        csv += `"Generated:","${dayjs().format('MMMM D, YYYY h:mm A')}"\n`;
        const fuelLabel = fuelProductId
            ? fuelProducts.find((p) => p.id === fuelProductId)?.type
            : 'All';
        if (reportType === 'fuel') csv += `"Fuel Type:","${fuelLabel}"\n`;
        csv += '\n';

        csv += '"EXECUTIVE SUMMARY"\n';
        csv += `"Total Revenue",${(summary.total_revenue || 0).toFixed(2)}\n`;
        if (showCost) {
            csv += `"Total Cost",${(summary.total_cost || 0).toFixed(2)}\n`;
            csv += `"Total Profit",${(summary.total_profit || 0).toFixed(2)}\n`;
        }
        csv += `"Total Transactions",${summary.total_transactions || 0}\n`;
        csv += `"Avg. per Transaction",${(summary.average_transaction || 0).toFixed(2)}\n`;
        csv += `"Daily Average Revenue",${analysis.dailyAvgRev.toFixed(2)}\n`;
        csv += `"Total Change Given",${analysis.totalChange.toFixed(2)}\n\n`;

        if (analysis.parkingTxs.length > 0) {
            csv += '"PARKING OPERATIONS"\n';
            csv += `"Parking Revenue",${(summary.parking_revenue || 0).toFixed(2)}\n`;
            csv += `"Parking Transactions",${summary.parking_transactions || 0}\n`;
            csv += `"Total Nights",${summary.total_parking_nights || 0}\n`;
            csv += `"Avg. Nights per Booking",${analysis.avgNights.toFixed(2)}\n\n`;

            csv += '"Slot Breakdown"\n';
            csv += 'Slot,Transactions,Nights,Revenue,% of Total\n';
            analysis.slotBreakdown.forEach((row) => {
                const pct =
                    (summary.parking_revenue || 0) > 0
                        ? (row.revenue / summary.parking_revenue!) * 100
                        : 0;
                csv += `"${row.slot}",${row.txns},${row.nights},${row.revenue.toFixed(2)},${pct.toFixed(1)}%\n`;
            });
            csv += '\n';
        }

        if (analysis.fuelTxs.length > 0) {
            csv += '"FUEL OPERATIONS"\n';
            csv += `"Fuel Revenue",${(summary.fuel_revenue || 0).toFixed(2)}\n`;
            csv += `"Fuel Cost",${(summary.fuel_cost || 0).toFixed(2)}\n`;
            csv += `"Fuel Profit",${(summary.fuel_profit || 0).toFixed(2)}\n`;
            csv += `"Fuel Transactions",${summary.fuel_transactions || 0}\n`;
            csv += `"Total Liters Sold",${(summary.total_liters_sold || 0).toFixed(2)}\n`;
            csv += `"Avg. Liters per Sale",${analysis.avgLiters.toFixed(2)}\n`;
            if (analysis.peakHour !== null) {
                csv += `"Peak Hour","${analysis.peakHour}:00 (${analysis.peakCount} sales)"\n`;
            }
            csv += '\n';

            csv += '"Product Breakdown"\n';
            csv += 'Product,Transactions,Liters,Revenue,Cost,Profit,Margin\n';
            analysis.productBreakdown.forEach((p) => {
                const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                csv += `"${p.product}",${p.txns},${p.liters.toFixed(2)},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${margin.toFixed(1)}%\n`;
            });
            csv += '\n';
        }

        if (analysis.dailyBreakdown.length > 0) {
            csv += '"DAILY REVENUE TREND"\n';
            csv += showCost
                ? 'Date,Transactions,Revenue,Cost,Profit\n'
                : 'Date,Transactions,Revenue\n';
            analysis.dailyBreakdown.forEach((d) => {
                csv += showCost
                    ? `"${d.date}",${d.txns},${d.revenue.toFixed(2)},${d.cost.toFixed(2)},${d.profit.toFixed(2)}\n`
                    : `"${d.date}",${d.txns},${d.revenue.toFixed(2)}\n`;
            });
            csv += '\n';
        }

        csv += '"TRANSACTION DETAILS"\n';
        if (reportType === 'fuel') {
            csv +=
                'Transaction #,Type,Customer/Product,Quantity,Date,Time,Payment,Paid,Change,Cost,Profit,Amount\n';
        } else {
            csv +=
                'Transaction #,Type,Customer/Product,Quantity,Date,Time,Payment,Paid,Change,Amount\n';
        }
        transactions.forEach((t: any) => {
            const txnNum = (t.transaction_number || 'N/A').replace(/,/g, '');
            const type = t.type === 'parking' ? 'Parking' : 'Fuel';
            let details = '';
            let quantity = '';
            let date = '';
            let time = '';
            let paid = '';
            let change = '';
            let payment = '';
            let cost = '';
            let profit = '';

            if (t.type === 'parking') {
                const customerName = t.customer
                    ? `${t.customer.first_name} ${t.customer.last_name}`
                    : 'N/A';
                details = `Slot ${t.slot_number || 'N/A'} - ${customerName}`;
                quantity = `${t.nights_stayed || 0} nights`;
                date = t.date || t.check_in_date || '-';
                time = t.time || '-';
                paid = (t.amount_paid || 0).toFixed(2);
                change = (t.change_amount || 0).toFixed(2);
                payment = (t.payment_method || 'cash').toUpperCase();
                cost = '0.00';
                profit = (t.profit ?? t.total_amount ?? 0).toFixed(2);
            } else {
                const productType = t.fuel_product?.type || 'N/A';
                const customer = t.customer_name ? ` - ${t.customer_name}` : '';
                details = `${productType}${customer}`;
                quantity = `${(t.liters || 0).toFixed(2)} L`;
                date = t.date || '-';
                time = t.time || '-';
                paid = (t.amount_paid || 0).toFixed(2);
                change = (t.change_amount || 0).toFixed(2);
                payment = (t.payment_method || 'cash').toUpperCase();
                cost = (t.total_cost || 0).toFixed(2);
                profit = (
                    t.profit ?? Number(t.total_amount || 0) - Number(t.total_cost || 0)
                ).toFixed(2);
            }
            const amount = (t.total_amount || 0).toFixed(2);
            if (reportType === 'fuel') {
                csv += `"${txnNum}","${type}","${details}","${quantity}","${date}","${time}","${payment}",${paid},${change},${cost},${profit},${amount}\n`;
            } else {
                csv += `"${txnNum}","${type}","${details}","${quantity}","${date}","${time}","${payment}",${paid},${change},${amount}\n`;
            }
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `report_${reportType}_${start}_to_${end}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        message.success('CSV downloaded successfully (open with Excel)');
    };

    // beforeprint listener switches to "show all rows" mode automatically
    const printReport = () => window.print();

    const getTransactionsForTable = () => {
        if (!reportData) return [];
        if (reportType === 'parking')
            return reportData.transactions.filter((t: any) => t.type === 'parking');
        if (reportType === 'fuel')
            return reportData.transactions.filter((t: any) => t.type === 'fuel');
        return reportData.transactions;
    };

    const reportTypeLabel =
        reportType === 'parking'
            ? 'Parking Revenue Report'
            : reportType === 'fuel'
              ? 'Fuel Sales Report'
              : 'Combined Operations Report';

    const s = reportData?.summary;
    const hasFuel = s?.fuel_revenue !== undefined;
    const hasParking = s?.parking_revenue !== undefined;

    // Cost / profit are only shown when fuel is part of the report
    const showCost = reportType !== 'parking';

    // Margin = profit / revenue
    const profitMargin =
        s?.total_revenue && s.total_revenue > 0 && s.total_profit !== undefined
            ? (s.total_profit / s.total_revenue) * 100
            : null;

    const tableRows = getTransactionsForTable();

    return (
        <div>
            {/* ═══ REPORT STYLES ══════════════════════════════════════════ */}
            <style>{`
                .report-document {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 32px;
                    max-width: 1100px;
                    margin: 0 auto 24px;
                }

                .report-letterhead {
                    text-align: center;
                    padding-bottom: 20px;
                    border-bottom: 3px double var(--primary);
                    margin-bottom: 28px;
                }
                .report-company {
                    font-size: 22px;
                    font-weight: 800;
                    letter-spacing: 1.5px;
                    color: var(--primary);
                    margin-bottom: 4px;
                    font-family: 'Cormorant Garamond', Georgia, serif;
                }
                .report-company-sub {
                    font-size: 11px;
                    color: var(--text-secondary);
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    margin-bottom: 16px;
                }
                .report-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 6px;
                }
                .report-meta-line {
                    font-size: 11.5px;
                    color: var(--text-secondary);
                    line-height: 1.6;
                }
                .report-meta-line strong {
                    color: var(--text-primary);
                    font-weight: 600;
                }

                .report-section { margin-bottom: 28px; }
                .report-section-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding-bottom: 8px;
                    border-bottom: 2px solid var(--border-color);
                    margin-bottom: 16px;
                }
                .report-section-title {
                    font-size: 13px;
                    font-weight: 800;
                    color: var(--text-primary);
                    text-transform: uppercase;
                    letter-spacing: 1.2px;
                }
                .report-section-icon {
                    font-size: 16px;
                    color: var(--primary);
                }

                .report-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 12px;
                    margin-bottom: 8px;
                }
                .report-kpi {
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 12px 14px;
                    background: var(--bg-surface-hover);
                }
                .report-kpi-label {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.8px;
                    color: var(--text-tertiary);
                    margin-bottom: 4px;
                }
                .report-kpi-value {
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--text-primary);
                    line-height: 1.1;
                }
                .report-kpi-value.success { color: var(--success); }
                .report-kpi-value.danger  { color: var(--danger); }
                .report-kpi-value.warning { color: var(--warning); }
                .report-kpi-value.primary { color: var(--primary); }
                .report-kpi-sub {
                    font-size: 10.5px;
                    color: var(--text-secondary);
                    margin-top: 4px;
                }

                /* ─── Pager (screen only) ─── */
                .report-pager {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 12px;
                }

                /* ─── Data tables ─── */
                .report-table-wrap { overflow-x: auto; }

                .report-table,
                .report-mini-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11.5px;
                    border: 1px solid var(--border-color);
                    table-layout: auto;
                }

                .report-table thead th,
                .report-mini-table thead th {
                    background: var(--bg-surface-hover);
                    color: var(--text-primary);
                    text-align: left;
                    font-weight: 700;
                    padding: 9px 10px;
                    font-size: 10.5px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid var(--border-color);
                    border-right: 1px solid var(--border-color);
                    vertical-align: bottom;
                    white-space: nowrap;
                }

                .report-table thead th:last-child,
                .report-mini-table thead th:last-child {
                    border-right: none;
                }

                .report-table tbody td,
                .report-mini-table tbody td {
                    padding: 8px 10px;
                    color: var(--text-primary);
                    border-bottom: 1px solid var(--border-color);
                    border-right: 1px solid var(--border-color);
                    vertical-align: top;
                    text-align: left;
                }

                .report-table tbody td:last-child,
                .report-mini-table tbody td:last-child {
                    border-right: none;
                }

                .report-table tbody tr:nth-child(even) td,
                .report-mini-table tbody tr:nth-child(even) td {
                    background: rgba(255, 255, 255, 0.02);
                }

                .report-table tbody tr:last-child td {
                    border-bottom: 2px solid var(--border-color);
                }

                .report-table th.num,
                .report-table td.num,
                .report-mini-table th.num,
                .report-mini-table td.num {
                    text-align: right !important;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }

                .report-table th.center,
                .report-table td.center,
                .report-mini-table th.center,
                .report-mini-table td.center {
                    text-align: center !important;
                    white-space: nowrap;
                }

                .report-table tfoot td,
                .report-mini-table tfoot td {
                    padding: 10px;
                    font-weight: 800;
                    font-size: 12px;
                    background: var(--bg-surface-hover);
                    color: var(--text-primary);
                    border-top: 2px solid var(--primary);
                    text-align: left;
                }

                .report-table tfoot td.num,
                .report-mini-table tfoot td.num {
                    text-align: right !important;
                    color: var(--success);
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }

                .mono {
                    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
                    font-size: 11px;
                }
                .text-success { color: var(--success); font-weight: 700; }
                .text-danger  { color: var(--danger); font-weight: 700; }
                .text-tertiary { color: var(--text-tertiary); font-size: 10.5px; }
                .amount-strong { color: var(--success); font-weight: 700; }
                .type-parking {
                    display: inline-block;
                    padding: 2px 8px;
                    background: rgba(13, 202, 240, 0.15);
                    color: #0DCAF0;
                    border-radius: 4px;
                    font-size: 9.5px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }
                .type-fuel {
                    display: inline-block;
                    padding: 2px 8px;
                    background: rgba(255, 193, 7, 0.15);
                    color: #D9A441;
                    border-radius: 4px;
                    font-size: 9.5px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }

                @media print {
                    @page { size: A4; margin: 15mm 12mm; }
                    body * { visibility: hidden; }
                    #printable-report, #printable-report * { visibility: visible; }
                    #printable-report {
                        display: block !important;
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        background: #FFFFFF;
                        color: #000000;
                    }
                    .report-pager { display: none !important; }
                    .report-document {
                        border: none;
                        padding: 0;
                        background: #FFFFFF;
                        color: #000000;
                    }
                    .report-company, .report-title, .report-section-title,
                    .report-kpi-value, .report-table thead th, .report-table tbody td,
                    .report-table tfoot td, .report-mini-table thead th,
                    .report-mini-table tbody td, .report-mini-table tfoot td {
                        color: #000000 !important;
                    }
                    .report-company-sub, .report-meta-line, .report-kpi-label,
                    .report-kpi-sub, .text-tertiary {
                        color: #555555 !important;
                    }
                    .report-letterhead { border-bottom: 3px double #000000 !important; }
                    .report-section-header { border-bottom: 2px solid #333333 !important; }
                    .report-kpi { border: 1px solid #CCCCCC !important; background: #F9F9F9 !important; }
                    .report-table, .report-mini-table {
                        border: 1px solid #CCCCCC !important;
                    }
                    .report-table thead th, .report-mini-table thead th {
                        background: #F0F0F0 !important;
                        border-bottom: 2px solid #000000 !important;
                        border-right: 1px solid #CCCCCC !important;
                        color: #000000 !important;
                    }
                    .report-table tbody td, .report-mini-table tbody td {
                        border-bottom: 1px solid #E0E0E0 !important;
                        border-right: 1px solid #E0E0E0 !important;
                        color: #000000 !important;
                    }
                    .report-table tbody tr:nth-child(even) td,
                    .report-mini-table tbody tr:nth-child(even) td {
                        background: #FAFAFA !important;
                    }
                    .report-table tfoot td, .report-mini-table tfoot td {
                        background: #F0F0F0 !important;
                        border-top: 2px solid #000000 !important;
                    }
                    .text-success { color: #047857 !important; }
                    .text-danger  { color: #B91C1C !important; }
                    .amount-strong { color: #047857 !important; }
                    .type-parking { background: #E0F7FA !important; color: #0277BD !important; }
                    .type-fuel { background: #FFF8E1 !important; color: #B87333 !important; }
                    tr, td, th { page-break-inside: avoid; }
                    thead { display: table-header-group; }
                }
            `}</style>

            {/* ═══ SCREEN-ONLY: Header + Filter Card ═══ */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <FileTextOutlined
                            style={{ color: COLORS.primary, marginRight: 12 }}
                        />
                        Reports
                    </h1>
                    <p className="page-description">
                        Generate and export detailed business reports for parking
                        and fuel operations
                    </p>
                </div>
            </div>

            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                }}
            >
                <Row gutter={[16, 16]} align="bottom">
                    <Col xs={24} sm={6}>
                        <label
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                display: 'block',
                                marginBottom: 6,
                            }}
                        >
                            Report Type
                        </label>
                        <Select
                            value={reportType}
                            onChange={(v) => {
                                setReportType(v);
                                if (v !== 'fuel') setFuelProductId(undefined);
                            }}
                            style={{ width: '100%' }}
                            size="large"
                        >
                            <Option value="combined">Combined Report</Option>
                            <Option value="parking">Parking Report</Option>
                            <Option value="fuel">Gasoline Report</Option>
                        </Select>
                    </Col>

                    {reportType === 'fuel' && (
                        <Col xs={24} sm={5}>
                            <label
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    display: 'block',
                                    marginBottom: 6,
                                }}
                            >
                                Fuel Type
                            </label>
                            <Select
                                value={fuelProductId ?? 'all'}
                                onChange={(v) =>
                                    setFuelProductId(v === 'all' ? undefined : Number(v))
                                }
                                style={{ width: '100%' }}
                                size="large"
                            >
                                <Option value="all">All Fuel Types</Option>
                                {fuelProducts.map((p) => (
                                    <Option key={p.id} value={p.id}>
                                        {p.type}
                                    </Option>
                                ))}
                            </Select>
                        </Col>
                    )}

                    <Col xs={24} sm={reportType === 'fuel' ? 9 : 14}>
                        <label
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                display: 'block',
                                marginBottom: 6,
                            }}
                        >
                            Date Range
                        </label>
                        <RangePicker
                            style={{ width: '100%' }}
                            size="large"
                            onChange={(d) => setDateRange(d as any)}
                        />
                    </Col>
                    <Col xs={24} sm={4}>
                        <Button
                            type="primary"
                            size="large"
                            onClick={generateReport}
                            loading={loading}
                            icon={<DownloadOutlined />}
                            style={{ width: '100%' }}
                        >
                            Generate
                        </Button>
                    </Col>
                </Row>
            </Card>

            {/* ═══ SCREEN-ONLY: Action Buttons ══════════════════════════ */}
            {reportData && (
                <Card
                    style={{
                        marginBottom: 24,
                        borderRadius: 12,
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border-color)',
                    }}
                >
                    <Space size="middle" wrap>
                        <Button
                            icon={<PrinterOutlined />}
                            onClick={printReport}
                            size="large"
                            type="primary"
                            ghost
                        >
                            Print / Save as PDF
                        </Button>
                        <Button
                            icon={<FileExcelOutlined />}
                            onClick={exportExcel}
                            size="large"
                        >
                            Export CSV (Excel)
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={generateReport}
                            size="large"
                        >
                            Refresh
                        </Button>
                    </Space>
                </Card>
            )}

            {loading && (
                <Card style={{ textAlign: 'center', padding: 40, marginBottom: 24 }}>
                    <Spin size="large" tip="Generating report…" />
                </Card>
            )}

            {!reportData && !loading && (
                <Card style={{ textAlign: 'center', padding: 60 }}>
                    <FileTextOutlined
                        style={{
                            fontSize: 64,
                            color: 'var(--text-secondary)',
                            marginBottom: 16,
                        }}
                    />
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
                        No Report Generated
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Select a report type and date range, then click{' '}
                        <strong>Generate</strong> to produce a detailed business
                        report.
                    </p>
                </Card>
            )}

            {/* ═══ PRINTABLE REPORT ═══════════════════════════════════════ */}
            {reportData && analysis && s && (
                <div
                    id="printable-report"
                    className="report-document"
                    key={`report-${reportKey}`}
                >
                    {/* Letterhead */}
                    <div className="report-letterhead">
                        <div className="report-company">PARK &amp; FUEL MANAGEMENT SYSTEM</div>
                        <div className="report-company-sub">
                            Parking &amp; Fuel Operations Report
                        </div>
                        <div className="report-title">
                            {reportTypeLabel}
                            {reportType === 'fuel' && fuelProductId
                                ? ` — ${fuelProducts.find((p) => p.id === fuelProductId)?.type}`
                                : ''}
                        </div>
                        <div className="report-meta-line">
                            <div>
                                <strong>Reporting Period:</strong>{' '}
                                {reportData.date_range.start} to {reportData.date_range.end}{' '}
                                ({analysis.dayCount} day{analysis.dayCount === 1 ? '' : 's'})
                            </div>
                            <div>
                                <strong>Generated:</strong>{' '}
                                {dayjs().format('MMMM D, YYYY [at] h:mm A')}
                            </div>
                            <div>
                                <strong>Report ID:</strong>{' '}
                                <span className="mono">
                                    RPT-{dayjs().format('YYYYMMDD-HHmmss')}-
                                    {reportType.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ═══ EXECUTIVE SUMMARY ═══ */}
                    <div className="report-section">
                        <div className="report-section-header">
                            <CheckCircleOutlined className="report-section-icon" />
                            <span className="report-section-title">Executive Summary</span>
                        </div>

                        <div className="report-kpi-grid">
                            <div className="report-kpi">
                                <div className="report-kpi-label">Total Revenue</div>
                                <div className="report-kpi-value success">
                                    {fmtPHP(s.total_revenue)}
                                </div>
                                <div className="report-kpi-sub">
                                    {s.total_transactions} transactions
                                </div>
                            </div>
                            {showCost && (
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Total Cost</div>
                                    <div className="report-kpi-value danger">
                                        {fmtPHP(s.total_cost ?? 0)}
                                    </div>
                                    <div className="report-kpi-sub">Cost of goods sold</div>
                                </div>
                            )}
                            {showCost && (
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Net Profit</div>
                                    <div className="report-kpi-value primary">
                                        {fmtPHP(s.total_profit ?? 0)}
                                    </div>
                                    <div className="report-kpi-sub">
                                        {profitMargin !== null
                                            ? `${fmtPct(profitMargin)} margin`
                                            : 'Margin n/a'}
                                    </div>
                                </div>
                            )}
                            <div className="report-kpi">
                                <div className="report-kpi-label">Avg. Transaction</div>
                                <div className="report-kpi-value">
                                    {fmtPHP(s.average_transaction)}
                                </div>
                                <div className="report-kpi-sub">Per sale</div>
                            </div>
                            <div className="report-kpi">
                                <div className="report-kpi-label">Daily Average</div>
                                <div className="report-kpi-value">
                                    {fmtPHP(analysis.dailyAvgRev)}
                                </div>
                                <div className="report-kpi-sub">
                                    Over {analysis.dayCount} day
                                    {analysis.dayCount === 1 ? '' : 's'}
                                </div>
                            </div>
                            <div className="report-kpi">
                                <div className="report-kpi-label">Change Given</div>
                                <div className="report-kpi-value warning">
                                    {fmtPHP(analysis.totalChange)}
                                </div>
                                <div className="report-kpi-sub">Total cash returned</div>
                            </div>
                        </div>
                    </div>

                    {/* ═══ PARKING SECTION ═══ */}
                    {hasParking && analysis.parkingTxs.length > 0 && (
                        <div className="report-section">
                            <div className="report-section-header">
                                <CarOutlined className="report-section-icon" />
                                <span className="report-section-title">Parking Operations</span>
                            </div>

                            <div className="report-kpi-grid">
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Parking Revenue</div>
                                    <div className="report-kpi-value success">
                                        {fmtPHP(s.parking_revenue)}
                                    </div>
                                    <div className="report-kpi-sub">
                                        {s.parking_transactions || 0} transactions
                                    </div>
                                </div>
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Total Nights</div>
                                    <div className="report-kpi-value">
                                        {fmtNum(s.total_parking_nights || 0)}
                                    </div>
                                    <div className="report-kpi-sub">Accommodated</div>
                                </div>
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Avg. Nights / Booking</div>
                                    <div className="report-kpi-value">
                                        {analysis.avgNights.toFixed(2)}
                                    </div>
                                    <div className="report-kpi-sub">Stay duration</div>
                                </div>
                            </div>

                            {analysis.slotBreakdown.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.8,
                                            color: 'var(--text-secondary)',
                                            marginBottom: 8,
                                        }}
                                    >
                                        Slot Performance
                                    </div>
                                    <Paginated rows={analysis.slotBreakdown} printing={printing}>
                                        {(rows) => (
                                            <table className="report-mini-table">
                                                <thead>
                                                    <tr>
                                                        <th>Slot</th>
                                                        <th className="num">Transactions</th>
                                                        <th className="num">Nights</th>
                                                        <th className="num">Revenue</th>
                                                        <th className="num">% Share</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((row) => {
                                                        const pct =
                                                            (s.parking_revenue || 0) > 0
                                                                ? (row.revenue / s.parking_revenue!) * 100
                                                                : 0;
                                                        return (
                                                            <tr key={row.slot}>
                                                                <td>
                                                                    <strong>{row.slot}</strong>
                                                                </td>
                                                                <td className="num">{row.txns}</td>
                                                                <td className="num">{row.nights}</td>
                                                                <td className="num">
                                                                    <span className="text-success">
                                                                        {fmtPHP(row.revenue)}
                                                                    </span>
                                                                </td>
                                                                <td className="num">{fmtPct(pct)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </Paginated>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ FUEL SECTION ═══ */}
                    {hasFuel && analysis.fuelTxs.length > 0 && (
                        <div className="report-section">
                            <div className="report-section-header">
                                <FireOutlined className="report-section-icon" />
                                <span className="report-section-title">Fuel Operations</span>
                            </div>

                            <div className="report-kpi-grid">
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Fuel Revenue</div>
                                    <div className="report-kpi-value success">
                                        {fmtPHP(s.fuel_revenue)}
                                    </div>
                                    <div className="report-kpi-sub">
                                        {s.fuel_transactions || 0} transactions
                                    </div>
                                </div>
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Liters Sold</div>
                                    <div className="report-kpi-value">
                                        {fmtNum(s.total_liters_sold || 0)} L
                                    </div>
                                    <div className="report-kpi-sub">
                                        Avg {analysis.avgLiters.toFixed(2)} L/sale
                                    </div>
                                </div>
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Fuel Cost</div>
                                    <div className="report-kpi-value danger">
                                        {fmtPHP(s.fuel_cost ?? 0)}
                                    </div>
                                    <div className="report-kpi-sub">Purchased</div>
                                </div>
                                <div className="report-kpi">
                                    <div className="report-kpi-label">Fuel Profit</div>
                                    <div className="report-kpi-value primary">
                                        {fmtPHP(s.fuel_profit ?? 0)}
                                    </div>
                                    <div className="report-kpi-sub">
                                        {s.fuel_revenue && s.fuel_revenue > 0
                                            ? `${fmtPct(((s.fuel_profit ?? 0) / s.fuel_revenue) * 100)} margin`
                                            : 'Margin n/a'}
                                    </div>
                                </div>
                                {analysis.peakHour !== null && (
                                    <div className="report-kpi">
                                        <div className="report-kpi-label">Peak Hour</div>
                                        <div className="report-kpi-value">
                                            {analysis.peakHour}:00
                                        </div>
                                        <div className="report-kpi-sub">
                                            {analysis.peakCount} sales
                                        </div>
                                    </div>
                                )}
                            </div>

                            {analysis.productBreakdown.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.8,
                                            color: 'var(--text-secondary)',
                                            marginBottom: 8,
                                        }}
                                    >
                                        Product Performance
                                    </div>
                                    <Paginated rows={analysis.productBreakdown} printing={printing}>
                                        {(rows) => (
                                            <table className="report-mini-table">
                                                <thead>
                                                    <tr>
                                                        <th>Product</th>
                                                        <th className="num">Txn</th>
                                                        <th className="num">Liters</th>
                                                        <th className="num">Revenue</th>
                                                        <th className="num">Cost</th>
                                                        <th className="num">Profit</th>
                                                        <th className="num">Margin</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((row) => {
                                                        const margin =
                                                            row.revenue > 0
                                                                ? (row.profit / row.revenue) * 100
                                                                : 0;
                                                        return (
                                                            <tr key={row.product}>
                                                                <td>
                                                                    <strong>{row.product}</strong>
                                                                </td>
                                                                <td className="num">{row.txns}</td>
                                                                <td className="num">
                                                                    {fmtNum(row.liters)}
                                                                </td>
                                                                <td className="num">
                                                                    <span className="text-success">
                                                                        {fmtPHP(row.revenue)}
                                                                    </span>
                                                                </td>
                                                                <td className="num">
                                                                    <span className="text-danger">
                                                                        {fmtPHP(row.cost)}
                                                                    </span>
                                                                </td>
                                                                <td className="num">
                                                                    <span
                                                                        className={
                                                                            row.profit >= 0
                                                                                ? 'text-success'
                                                                                : 'text-danger'
                                                                        }
                                                                    >
                                                                        {fmtPHP(row.profit)}
                                                                    </span>
                                                                </td>
                                                                <td className="num">{fmtPct(margin)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td>TOTAL</td>
                                                        <td className="num">
                                                            {analysis.productBreakdown.reduce(
                                                                (sum, p) => sum + p.txns,
                                                                0,
                                                            )}
                                                        </td>
                                                        <td className="num">
                                                            {fmtNum(
                                                                analysis.productBreakdown.reduce(
                                                                    (sum, p) => sum + p.liters,
                                                                    0,
                                                                ),
                                                            )}
                                                        </td>
                                                        <td className="num">
                                                            {fmtPHP(
                                                                analysis.productBreakdown.reduce(
                                                                    (sum, p) => sum + p.revenue,
                                                                    0,
                                                                ),
                                                            )}
                                                        </td>
                                                        <td className="num">
                                                            {fmtPHP(
                                                                analysis.productBreakdown.reduce(
                                                                    (sum, p) => sum + p.cost,
                                                                    0,
                                                                ),
                                                            )}
                                                        </td>
                                                        <td className="num">
                                                            {fmtPHP(
                                                                analysis.productBreakdown.reduce(
                                                                    (sum, p) => sum + p.profit,
                                                                    0,
                                                                ),
                                                            )}
                                                        </td>
                                                        <td className="num">—</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        )}
                                    </Paginated>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ PAYMENT METHOD BREAKDOWN ═══ */}
                    <div className="report-section">
                        <div className="report-section-header">
                            <CreditCardOutlined className="report-section-icon" />
                            <span className="report-section-title">
                                Payment Method Breakdown
                            </span>
                        </div>

                        <Paginated
                            rows={Object.entries(
                                analysis.paymentBreakdown(reportData.transactions),
                            )}
                            printing={printing}
                        >
                            {(rows) => (
                                <table className="report-mini-table">
                                    <thead>
                                        <tr>
                                            <th>Payment Method</th>
                                            <th className="num">Transactions</th>
                                            <th className="num">Revenue</th>
                                            <th className="num">% Share</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(([method, stats]) => {
                                            const pct =
                                                (s.total_revenue || 0) > 0
                                                    ? (stats.amount / s.total_revenue) * 100
                                                    : 0;
                                            return (
                                                <tr key={method}>
                                                    <td>
                                                        <strong>{method.toUpperCase()}</strong>
                                                    </td>
                                                    <td className="num">{stats.count}</td>
                                                    <td className="num">
                                                        <span className="text-success">
                                                            {fmtPHP(stats.amount)}
                                                        </span>
                                                    </td>
                                                    <td className="num">{fmtPct(pct)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </Paginated>
                    </div>

                    {/* ═══ DAILY REVENUE TREND ═══ */}
                    {analysis.dailyBreakdown.length > 0 && (
                        <div className="report-section">
                            <div className="report-section-header">
                                <CalendarOutlined className="report-section-icon" />
                                <span className="report-section-title">
                                    Daily Revenue Trend
                                </span>
                            </div>

                            <Paginated rows={analysis.dailyBreakdown} printing={printing}>
                                {(rows) => (
                                    <table className="report-mini-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th className="num">Transactions</th>
                                                <th className="num">Revenue</th>
                                                {showCost && <th className="num">Cost</th>}
                                                {showCost && <th className="num">Profit</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((d) => (
                                                <tr key={d.date}>
                                                    <td>
                                                        {dayjs(d.date).format(
                                                            'ddd, MMM DD, YYYY',
                                                        )}
                                                    </td>
                                                    <td className="num">{d.txns}</td>
                                                    <td className="num">
                                                        <span className="text-success">
                                                            {fmtPHP(d.revenue)}
                                                        </span>
                                                    </td>
                                                    {showCost && (
                                                        <td className="num">
                                                            {d.cost > 0 ? (
                                                                <span className="text-danger">
                                                                    {fmtPHP(d.cost)}
                                                                </span>
                                                            ) : (
                                                                '—'
                                                            )}
                                                        </td>
                                                    )}
                                                    {showCost && (
                                                        <td className="num">
                                                            <span
                                                                className={
                                                                    d.profit >= 0
                                                                        ? 'text-success'
                                                                        : 'text-danger'
                                                                }
                                                            >
                                                                {fmtPHP(d.profit)}
                                                            </span>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td>TOTAL</td>
                                                <td className="num">
                                                    {analysis.dailyBreakdown.reduce(
                                                        (sum, d) => sum + d.txns,
                                                        0,
                                                    )}
                                                </td>
                                                <td className="num">
                                                    {fmtPHP(
                                                        analysis.dailyBreakdown.reduce(
                                                            (sum, d) => sum + d.revenue,
                                                            0,
                                                        ),
                                                    )}
                                                </td>
                                                {showCost && (
                                                    <td className="num">
                                                        {fmtPHP(
                                                            analysis.dailyBreakdown.reduce(
                                                                (sum, d) => sum + d.cost,
                                                                0,
                                                            ),
                                                        )}
                                                    </td>
                                                )}
                                                {showCost && (
                                                    <td className="num">
                                                        {fmtPHP(
                                                            analysis.dailyBreakdown.reduce(
                                                                (sum, d) => sum + d.profit,
                                                                0,
                                                            ),
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </Paginated>
                        </div>
                    )}

                    {/* ═══ TRANSACTION DETAILS ═══ */}
                    <div className="report-section">
                        <div className="report-section-header">
                            <FileTextOutlined className="report-section-icon" />
                            <span className="report-section-title">
                                Transaction Details
                            </span>
                        </div>

                        <Paginated rows={tableRows} printing={printing}>
                            {(rows) => (
                                <div className="report-table-wrap">
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                {reportType === 'parking' && (
                                                    <>
                                                        <th>Txn #</th>
                                                        <th>Customer</th>
                                                        <th className="center">Slot</th>
                                                        <th>Check-In</th>
                                                        <th>Check-Out</th>
                                                        <th className="center">Nights</th>
                                                        <th className="center">Payment</th>
                                                        <th className="num">Paid</th>
                                                        <th className="num">Change</th>
                                                        <th className="num">Amount</th>
                                                    </>
                                                )}
                                                {reportType === 'fuel' && (
                                                    <>
                                                        <th>Txn #</th>
                                                        <th>Date</th>
                                                        <th>Time</th>
                                                        <th>Product</th>
                                                        <th className="num">Liters</th>
                                                        <th className="num">Price/L</th>
                                                        <th className="num">Cost/L</th>
                                                        <th className="num">Cost</th>
                                                        <th className="num">Profit</th>
                                                        <th className="center">Payment</th>
                                                        <th className="num">Amount</th>
                                                    </>
                                                )}
                                                {reportType === 'combined' && (
                                                    <>
                                                        <th>Txn #</th>
                                                        <th className="center">Type</th>
                                                        <th>Customer / Product</th>
                                                        <th className="num">Qty</th>
                                                        <th>Date &amp; Time</th>
                                                        <th className="center">Payment</th>
                                                        <th className="num">Paid</th>
                                                        <th className="num">Change</th>
                                                        <th className="num">Amount</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((t: any, idx: number) => {
                                                if (reportType === 'parking') {
                                                    return (
                                                        <tr key={`p-${t.id ?? idx}`}>
                                                            <td>
                                                                <span className="mono">
                                                                    {t.transaction_number || 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {t.customer
                                                                    ? `${t.customer.first_name} ${t.customer.last_name}`
                                                                    : 'N/A'}
                                                            </td>
                                                            <td className="center">
                                                                {t.slot_number || '-'}
                                                            </td>
                                                            <td>
                                                                {t.check_in_date
                                                                    ? dayjs(t.check_in_date).format(
                                                                          'MMM DD, YYYY',
                                                                      )
                                                                    : '-'}
                                                            </td>
                                                            <td>
                                                                {t.check_out_date
                                                                    ? dayjs(t.check_out_date).format(
                                                                          'MMM DD, YYYY',
                                                                      )
                                                                    : '-'}
                                                            </td>
                                                            <td className="center">
                                                                {t.nights_stayed || 1}
                                                            </td>
                                                            <td className="center">
                                                                {(t.payment_method || 'cash').toUpperCase()}
                                                            </td>
                                                            <td className="num">
                                                                {fmtPHP(t.amount_paid)}
                                                            </td>
                                                            <td className="num">
                                                                {fmtPHP(t.change_amount)}
                                                            </td>
                                                            <td className="num">
                                                                <span className="amount-strong">
                                                                    {fmtPHP(t.total_amount)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                if (reportType === 'fuel') {
                                                    const cost = Number(t.total_cost ?? 0);
                                                    const profit = Number(
                                                        t.profit ??
                                                            Number(t.total_amount ?? 0) - cost,
                                                    );
                                                    return (
                                                        <tr key={`f-${t.id ?? idx}`}>
                                                            <td>
                                                                <span className="mono">
                                                                    {t.transaction_number || 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {t.date
                                                                    ? dayjs(t.date).format('MMM DD, YYYY')
                                                                    : '-'}
                                                            </td>
                                                            <td>
                                                                {t.time
                                                                    ? dayjs(
                                                                          `2000-01-01 ${t.time}`,
                                                                      ).format('h:mm A')
                                                                    : '-'}
                                                            </td>
                                                            <td>{t.fuel_product?.type || 'N/A'}</td>
                                                            <td className="num">
                                                                {fmtNum(t.liters)}
                                                            </td>
                                                            <td className="num">
                                                                {fmtPHP(t.price_per_liter)}
                                                            </td>
                                                            <td className="num">
                                                                {t.cost_price_per_liter
                                                                    ? fmtPHP(t.cost_price_per_liter)
                                                                    : '—'}
                                                            </td>
                                                            <td className="num">
                                                                {cost > 0 ? (
                                                                    <span className="text-danger">
                                                                        {fmtPHP(cost)}
                                                                    </span>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </td>
                                                            <td className="num">
                                                                {cost > 0 ? (
                                                                    <span
                                                                        className={
                                                                            profit >= 0
                                                                                ? 'text-success'
                                                                                : 'text-danger'
                                                                        }
                                                                    >
                                                                        {fmtPHP(profit)}
                                                                    </span>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </td>
                                                            <td className="center">
                                                                {(t.payment_method || 'cash').toUpperCase()}
                                                            </td>
                                                            <td className="num">
                                                                <span className="amount-strong">
                                                                    {fmtPHP(t.total_amount)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                // combined
                                                const qty =
                                                    t.type === 'parking'
                                                        ? `${t.nights_stayed || 1} night${
                                                              (t.nights_stayed || 1) > 1 ? 's' : ''
                                                          }`
                                                        : `${fmtNum(t.liters)} L`;
                                                const details =
                                                    t.type === 'parking'
                                                        ? t.customer
                                                            ? `${t.customer.first_name} ${t.customer.last_name}`
                                                            : 'N/A'
                                                        : t.fuel_product?.type || 'N/A';
                                                const dt =
                                                    t.type === 'parking'
                                                        ? t.date ?? t.check_in_date
                                                        : t.date;
                                                return (
                                                    <tr key={`c-${t.id ?? idx}-${t.type}`}>
                                                        <td>
                                                            <span className="mono">
                                                                {t.transaction_number || 'N/A'}
                                                            </span>
                                                        </td>
                                                        <td className="center">
                                                            <span
                                                                className={
                                                                    t.type === 'parking'
                                                                        ? 'type-parking'
                                                                        : 'type-fuel'
                                                                }
                                                            >
                                                                {t.type === 'parking'
                                                                    ? 'PARKING'
                                                                    : 'FUEL'}
                                                            </span>
                                                        </td>
                                                        <td>{details}</td>
                                                        <td className="num">{qty}</td>
                                                        <td>
                                                            {dt ? (
                                                                <>
                                                                    <div>
                                                                        {dayjs(dt).format(
                                                                            'MMM DD, YYYY',
                                                                        )}
                                                                    </div>
                                                                    {t.time && (
                                                                        <div className="text-tertiary">
                                                                            {dayjs(
                                                                                `2000-01-01 ${t.time}`,
                                                                            ).format('h:mm A')}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                '-'
                                                            )}
                                                        </td>
                                                        <td className="center">
                                                            {(t.payment_method || 'cash').toUpperCase()}
                                                        </td>
                                                        <td className="num">
                                                            {fmtPHP(t.amount_paid)}
                                                        </td>
                                                        <td className="num">
                                                            {fmtPHP(t.change_amount)}
                                                        </td>
                                                        <td className="num">
                                                            <span className="amount-strong">
                                                                {fmtPHP(t.total_amount)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td
                                                    colSpan={
                                                        reportType === 'parking'
                                                            ? 9
                                                            : reportType === 'fuel'
                                                              ? 10
                                                              : 8
                                                    }
                                                >
                                                    TOTAL ({tableRows.length} records)
                                                </td>
                                                <td className="num">
                                                    <span className="amount-strong">
                                                        {fmtPHP(
                                                            tableRows.reduce(
                                                                (sum: number, t: any) =>
                                                                    sum + Number(t.total_amount || 0),
                                                                0,
                                                            ),
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </Paginated>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;