// resources/js/pages/FuelProducts.tsx
import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    message,
    Tag,
    Space,
    Card,
    Row,
    Col,
    Tabs,
    Tooltip,
    InputNumber,
    Alert,
    Badge,
    Spin,
    DatePicker,
    Select,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    FireOutlined,
    DollarOutlined,
    DownloadOutlined,
    ShopOutlined,
    WarningOutlined,
    InboxOutlined,
    BellOutlined,
    SettingOutlined,
    CalendarOutlined,
    CheckOutlined,
    EyeOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs, { Dayjs } from 'dayjs';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface FuelProduct {
    id: number;
    type: string;
    current_selling_price?: number;
}

interface FuelInventory {
    id: number;
    fuel_product_id: number;
    liters_delivered: number;
    remaining_liters: number;
    cost_price_per_liter: number;
    selling_price_per_liter: number;
    delivery_date: string;
    reference_no?: string;
    created_at?: string;
    supplier?: { id: number; supplier_name: string };
    fuel_product?: FuelProduct;
}

interface FuelSale {
    id: number;
    transaction_number: string;
    fuel_product_id: number;
    liters: number;
    price_per_liter: number;
    total_amount: number;
    amount_paid: number;
    change_amount: number;
    payment_method: string;
    created_at: string;
    fuel_product?: FuelProduct;
    recorded_by?: { first_name: string; last_name: string };
}

interface Remittance {
    id: number;
    staff_id: number;
    staff: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
    };
    remittance_date: string;
    remitted_amount: number;
    actual_sales_amount: number;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_at: string | null;
    created_at: string;
}

interface DailyProductProfit {
    fuel_product_id: number;
    liters: number;
    revenue: number;
    cost: number;
    profit: number;
    profit_margin: number;
    transactions: number;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

const formatNumber = (num: number): string => {
    if (isNaN(num) || num === null || num === undefined) return '0';
    if (num % 1 === 0) return num.toLocaleString();
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

const formatCurrency = (amount: number): string => {
    if (isNaN(amount) || amount === null || amount === undefined)
        return '₱0.00';
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    }).format(amount);
};

const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const labelStyle: React.CSSProperties = {
    color: 'var(--text-tertiary)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
};

// ─── Summary stat card ──────────────────────────────────────────────────────

const SummaryCard: React.FC<{
    className: string;
    label: string;
    value: React.ReactNode;
    valueSize?: number;
    valueColor?: string;
    sub?: React.ReactNode;
    icon: React.ReactNode;
}> = ({
    className,
    label,
    value,
    valueSize = 28,
    valueColor = 'var(--text-primary)',
    sub,
    icon,
}) => (
    <Card
        className={className}
        styles={{
            body: {
                height: 120,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
            },
        }}
    >
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                height: '100%',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                }}
            >
                <div style={labelStyle}>{label}</div>
                <div
                    style={{
                        fontSize: valueSize,
                        fontWeight: 700,
                        color: valueColor,
                        lineHeight: 1.1,
                    }}
                >
                    {value}
                </div>
                {sub && (
                    <div
                        style={{
                            color: 'var(--text-tertiary)',
                            fontSize: 11,
                            marginTop: 4,
                        }}
                    >
                        {sub}
                    </div>
                )}
            </div>
            <span style={{ fontSize: 24, opacity: 0.8, marginTop: 4 }}>
                {icon}
            </span>
        </div>
    </Card>
);

// ─── Component ────────────────────────────────────────────────────────────────

const FuelProducts: React.FC = () => {
    const [products, setProducts] = useState<FuelProduct[]>([]);
    const [inventory, setInventory] = useState<FuelInventory[]>([]);
    const [sales, setSales] = useState<FuelSale[]>([]);
    const [todaySales, setTodaySales] = useState<FuelSale[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<FuelProduct | null>(
        null,
    );
    const [form] = Form.useForm();
    const [lowStockThreshold, setLowStockThreshold] = useState<number>(500);
    const [thresholdModalVisible, setThresholdModalVisible] = useState(false);
    const [thresholdForm] = Form.useForm();

    // ─── Daily profit / revenue (per product) ─────────────────────────────
    const [profitDate, setProfitDate] = useState<Dayjs>(dayjs());
    const [dailyProfit, setDailyProfit] = useState<
        Record<number, DailyProductProfit>
    >({});
    const [dailyTotals, setDailyTotals] = useState({
        revenue: 0,
        cost: 0,
        profit: 0,
    });
    const [dailyLoading, setDailyLoading] = useState(false);
    const isProfitToday = profitDate.isSame(dayjs(), 'day');

    const [remittances, setRemittances] = useState<Remittance[]>([]);
    const [remLoading, setRemLoading] = useState(false);
    const [remFilters, setRemFilters] = useState({
        date_from: '',
        date_to: '',
    });
    const [remModalVisible, setRemModalVisible] = useState(false);
    const [selectedRemittance, setSelectedRemittance] =
        useState<Remittance | null>(null);
        const [salesPage, setSalesPage] = useState(1);
    const [salesPageSize, setSalesPageSize] = useState(10);

    useEffect(() => {
        fetchAllData();
        const saved = localStorage.getItem('lowStockThreshold');
        if (saved) setLowStockThreshold(Number(saved));
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchProducts(),
                fetchInventory(),
                fetchSales(),
                fetchTodaySales(),
                fetchRemittances(),
            ]);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const r = await api.get('/fuel-products');
            setProducts(Array.isArray(r.data) ? r.data : []);
        } catch {
            setProducts([]);
        }
    };

    const fetchInventory = async () => {
        try {
            const r = await api.get('/fuel/inventory');
            setInventory(Array.isArray(r.data) ? r.data : []);
        } catch {
            setInventory([]);
        }
    };

    const fetchSales = async () => {
        try {
            const r = await api.get('/fuel/sales');
            setSales(Array.isArray(r.data) ? r.data : []);
        } catch {
            setSales([]);
        }
    };

    const fetchTodaySales = async () => {
        try {
            const r = await api.get('/fuel/sales/today');
            const data = Array.isArray(r.data)
                ? r.data
                : Array.isArray(r.data?.sales)
                  ? r.data.sales
                  : [];
            setTodaySales(data);
        } catch {
            setTodaySales([]);
        }
    };

    const fetchDailyProfit = async (date: Dayjs = profitDate) => {
        setDailyLoading(true);
        try {
            const r = await api.get('/fuel/daily-profit', {
                params: { date: date.format('YYYY-MM-DD') },
            });
            const map: Record<number, DailyProductProfit> = {};
            (r.data?.products ?? []).forEach((p: DailyProductProfit) => {
                map[p.fuel_product_id] = p;
            });
            setDailyProfit(map);
            setDailyTotals({
                revenue: Number(r.data?.totals?.revenue ?? 0),
                cost: Number(r.data?.totals?.cost ?? 0),
                profit: Number(r.data?.totals?.profit ?? 0),
            });
        } catch {
            setDailyProfit({});
            setDailyTotals({ revenue: 0, cost: 0, profit: 0 });
        } finally {
            setDailyLoading(false);
        }
    };

    useEffect(() => {
        fetchDailyProfit(profitDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profitDate, sales.length, todaySales.length]);

    // Auto-refresh: pick up sales made by staff on mobile
    useEffect(() => {
        const refresh = () => {
            if (document.hidden) return;
            fetchTodaySales();
            fetchSales();
            fetchInventory();
        };
        const id = setInterval(refresh, 10000);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', refresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchRemittances = async () => {
        setRemLoading(true);
        try {
            const params = new URLSearchParams();
            if (remFilters.date_from)
                params.append('date_from', remFilters.date_from);
            if (remFilters.date_to)
                params.append('date_to', remFilters.date_to);
            const res = await api.get(
                `/admin/remittances?${params.toString()}`,
            );
            setRemittances(Array.isArray(res.data) ? res.data : []);
        } catch {
            setRemittances([]);
        } finally {
            setRemLoading(false);
        }
    };

    useEffect(() => {
        fetchRemittances();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remFilters]);

    const handleAdd = () => {
        setEditingProduct(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: FuelProduct) => {
        setEditingProduct(record);
        const currentPrice = getActivePrice(record.id);
        form.setFieldsValue({
            type: record.type,
            selling_price: currentPrice,
        });
        setModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingProduct) {
                const data: any = {
                    type: values.type,
                    current_selling_price: values.selling_price,
                };
                const response = await api.put(
                    `/fuel-products/${editingProduct.id}`,
                    data,
                );
                setProducts((prev) =>
                    prev.map((p) =>
                        p.id === editingProduct.id
                            ? { ...p, ...response.data }
                            : p,
                    ),
                );
                message.success('Product updated!');
                await fetchInventory();
            } else {
                const response = await api.post('/fuel-products', {
                    type: values.type,
                    current_selling_price: values.selling_price ?? 0,
                });
                setProducts((prev) => [...prev, response.data]);
                message.success('Product added!');
            }
            setModalVisible(false);
            form.resetFields();
            fetchAllData();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Error');
        }
    };

    const handleSaveThreshold = (values: any) => {
        const val = Number(values.threshold);
        setLowStockThreshold(val);
        localStorage.setItem('lowStockThreshold', String(val));
        setThresholdModalVisible(false);
        message.success(`Threshold set to ${val} L`);
    };

    const handleViewRemittance = (record: Remittance) => {
        setSelectedRemittance(record);
        setRemModalVisible(true);
    };

    // ─── Stock helpers ────────────────────────────────────────────────────────

    const getCurrentStock = (pid: number) =>
        inventory
            .filter((i) => i.fuel_product_id === pid)
            .reduce((s, i) => s + Number(i.remaining_liters || 0), 0);

    const getTotalSold = (pid: number) =>
        sales
            .filter((s) => s.fuel_product_id === pid)
            .reduce((s, sa) => s + Number(sa.liters || 0), 0);

    const getTotalRevenue = (pid: number) =>
        sales
            .filter((s) => s.fuel_product_id === pid)
            .reduce((s, sa) => s + Number(sa.total_amount || 0), 0);

    const getActivePrice = (pid: number) => {
        const inv = inventory.filter(
            (i) => i.fuel_product_id === pid && Number(i.remaining_liters) > 0,
        );
        if (inv.length > 0) {
            const sorted = [...inv].sort((a, b) => {
                const dateDiff =
                    new Date(b.delivery_date || '').getTime() -
                    new Date(a.delivery_date || '').getTime();
                return dateDiff !== 0 ? dateDiff : b.id - a.id;
            });
            const price = Number(sorted[0].selling_price_per_liter || 0);
            if (price > 0) return price;
        }
        const product = products.find((p) => p.id === pid);
        return Number(product?.current_selling_price || 0);
    };

    const getTotalCostValue = (pid: number) =>
        inventory
            .filter((i) => i.fuel_product_id === pid)
            .reduce(
                (s, i) =>
                    s +
                    Number(i.liters_delivered || 0) *
                        Number(i.cost_price_per_liter || 0),
                0,
            );

    const getTotalSellingValue = (pid: number) =>
        inventory
            .filter((i) => i.fuel_product_id === pid)
            .reduce(
                (s, i) =>
                    s +
                    Number(i.liters_delivered || 0) *
                        Number(i.selling_price_per_liter || 0),
                0,
            );

    // ─── Stats ─────────────────────────────────────────────────────────────────

    const todayTotalLiters = todaySales.reduce(
        (s, sa) => s + Number(sa.liters || 0),
        0,
    );
    const todayTotalRevenue = todaySales.reduce(
        (s, sa) => s + Number(sa.total_amount || 0),
        0,
    );
    const todayTotalTransactions = todaySales.length;
    const totalProducts = products.length;
    const totalSalesCount = sales.length;
    const totalRevenue = sales.reduce(
        (s, sa) => s + Number(sa.total_amount || 0),
        0,
    );
    const totalLitersSold = sales.reduce(
        (s, sa) => s + Number(sa.liters || 0),
        0,
    );
    const totalStockValue = products.reduce(
        (s, p) => s + getCurrentStock(p.id) * getActivePrice(p.id),
        0,
    );
    const lowStockProducts = products.filter((p) => {
        const st = getCurrentStock(p.id);
        return st > 0 && st <= lowStockThreshold;
    });
    const outOfStockProducts = products.filter(
        (p) => getCurrentStock(p.id) <= 0,
    );

    const grandTotalCostValue = products.reduce(
        (s, p) => s + getTotalCostValue(p.id),
        0,
    );
    const grandTotalSellingValue = products.reduce(
        (s, p) => s + getTotalSellingValue(p.id),
        0,
    );

    // ─── Export functions ──────────────────────────────────────────────────────

    const csvRow = (s: FuelSale, dateFmt: string, productName: string) => {
        const recordedBy = s.recorded_by
            ? `${s.recorded_by.first_name} ${s.recorded_by.last_name}`
            : 'N/A';
        let row = `${s.created_at ? dayjs(s.created_at).format(dateFmt) : '-'},`;
        row += `"${(s.transaction_number || 'N/A').replace(/"/g, '""')}","${productName}",`;
        row += `${Number(s.liters || 0).toFixed(2)},${Number(s.price_per_liter || 0).toFixed(2)},${Number(s.total_amount || 0).toFixed(2)},`;
        row += `${Number(s.amount_paid || 0).toFixed(2)},${Number(s.change_amount || 0).toFixed(2)},${s.payment_method || 'cash'},"${recordedBy}"\n`;
        return row;
    };

    const exportTodayReport = () => {
        if (!todaySales.length) {
            message.warning('No sales data for today');
            return;
        }
        let csv = "Today's Fuel Sales Report\n";
        csv += `Date: ${dayjs().format('MMMM DD, YYYY')}\n`;
        csv += `Transactions: ${todayTotalTransactions}\nLiters: ${formatNumber(todayTotalLiters)} L\nRevenue: ${formatCurrency(todayTotalRevenue)}\n`;
        csv += `Profit: ${formatCurrency(dailyTotals.profit)}\n\n`;
        csv +=
            'Time,Transaction #,Product,Liters,Price/L,Total,Paid,Change,Payment,Recorded By\n';
        todaySales.forEach((s) => {
            csv += csvRow(s, 'h:mm A', s.fuel_product?.type || 'N/A');
        });
        downloadCsv(csv, `today_fuel_sales_${dayjs().format('YYYY-MM-DD')}.csv`);
        message.success("Today's report downloaded!");
    };

    const exportSalesReport = () => {
        if (!sales.length) {
            message.warning('No sales data');
            return;
        }
        let csv = 'Fuel Sales Report\n';
        csv += `Generated: ${dayjs().format('MMMM DD, YYYY')}\n`;
        csv += `Records: ${sales.length}\nLiters: ${formatNumber(totalLitersSold)} L\nRevenue: ${formatCurrency(totalRevenue)}\n\n`;
        csv +=
            'Date,Transaction #,Product,Liters,Price/L,Total,Paid,Change,Payment,Recorded By\n';
        sales.forEach((s) => {
            csv += csvRow(
                s,
                'YYYY-MM-DD HH:mm',
                products.find((p) => p.id === s.fuel_product_id)?.type || 'N/A',
            );
        });
        downloadCsv(csv, `fuel_sales_report_${dayjs().format('YYYY-MM-DD')}.csv`);
        message.success('Sales report downloaded!');
    };

    const exportDailyRevenueReport = () => {
        if (!sales.length) {
            message.warning('No sales data to summarize');
            return;
        }

        type DayKey = string;
        const byDayProduct: Record<
            string,
            {
                date: DayKey;
                product: string;
                liters: number;
                revenue: number;
                transactions: number;
            }
        > = {};

        sales.forEach((s) => {
            const date = s.created_at
                ? dayjs(s.created_at).format('YYYY-MM-DD')
                : 'Unknown';
            const productName =
                products.find((p) => p.id === s.fuel_product_id)?.type ||
                s.fuel_product?.type ||
                'N/A';
            const key = `${date}__${productName}`;

            if (!byDayProduct[key]) {
                byDayProduct[key] = {
                    date,
                    product: productName,
                    liters: 0,
                    revenue: 0,
                    transactions: 0,
                };
            }

            byDayProduct[key].liters += Number(s.liters || 0);
            byDayProduct[key].revenue += Number(s.total_amount || 0);
            byDayProduct[key].transactions += 1;
        });

        const rows = Object.values(byDayProduct).sort((a, b) =>
            a.date === b.date
                ? a.product.localeCompare(b.product)
                : a.date.localeCompare(b.date),
        );

        let csv = 'Daily Fuel Revenue Report (per product)\n';
        csv += `Generated: ${dayjs().format('MMMM DD, YYYY')}\n\n`;
        csv += 'Date,Product,Liters Sold,Transactions,Total Revenue\n';
        rows.forEach((r) => {
            csv += `${r.date},"${r.product}",${r.liters.toFixed(2)},${r.transactions},${r.revenue.toFixed(2)}\n`;
        });

        downloadCsv(
            csv,
            `daily_fuel_revenue_${dayjs().format('YYYY-MM-DD')}.csv`,
        );
        message.success('Daily revenue report downloaded!');
    };

    // ─── TABLE COLUMNS ────────────────────────────────────────────────────────

    const buildSalesColumns = (
        dateTitle: string,
        dateFmt: string,
        dateWidth: number,
        txnColor: string,
    ) => [
        {
            title: dateTitle,
            dataIndex: 'created_at',
            key: 'date',
            width: dateWidth,
            render: (d: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {d ? dayjs(d).format(dateFmt) : '-'}
                </span>
            ),
        },
        {
            title: 'Txn #',
            dataIndex: 'transaction_number',
            key: 'txn',
            width: 120,
            render: (t: string) => (
                <Tag color={txnColor} style={{ fontSize: 10, margin: 0 }}>
                    {t || 'N/A'}
                </Tag>
            ),
        },
        {
            title: 'Product',
            key: 'prod',
            width: 140,
            render: (_: any, r: FuelSale) => (
                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                    {r.fuel_product?.type || 'N/A'}
                </Tag>
            ),
        },
        {
            title: 'Liters',
            dataIndex: 'liters',
            key: 'liters',
            width: 90,
            align: 'right' as const,
            render: (l: any) => (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatNumber(Number(l || 0))} L
                </span>
            ),
        },
        {
            title: 'Price/L',
            dataIndex: 'price_per_liter',
            key: 'ppl',
            width: 90,
            align: 'right' as const,
            render: (p: any) => (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatCurrency(Number(p || 0))}
                </span>
            ),
        },
        {
            title: 'Total',
            dataIndex: 'total_amount',
            key: 'total',
            width: 100,
            align: 'right' as const,
            render: (a: any) => (
                <span
                    style={{
                        fontWeight: 600,
                        color: 'var(--success)',
                        fontSize: 12,
                    }}
                >
                    {formatCurrency(Number(a || 0))}
                </span>
            ),
        },
        {
            title: 'Payment',
            dataIndex: 'amount_paid',
            key: 'paid',
            width: 100,
            align: 'right' as const,
            render: (a: any) => (
                <span
                    style={{
                        fontWeight: 600,
                        color: 'var(--primary)',
                        fontSize: 12,
                    }}
                >
                    {formatCurrency(Number(a || 0))}
                </span>
            ),
        },
        {
            title: 'Change',
            dataIndex: 'change_amount',
            key: 'change',
            width: 90,
            align: 'right' as const,
            render: (c: any) => (
                <span
                    style={{
                        fontSize: 12,
                        color:
                            Number(c || 0) > 0
                                ? 'var(--success)'
                                : 'var(--text-tertiary)',
                    }}
                >
                    {formatCurrency(Number(c || 0))}
                </span>
            ),
        },
        {
            title: 'Mode of Payment',
            dataIndex: 'payment_method',
            key: 'pm',
            width: 70,
            align: 'center' as const,
            render: (pm: string) => (
                <Tag
                    color={
                        pm === 'cash'
                            ? 'green'
                            : pm === 'card'
                              ? 'blue'
                              : 'purple'
                    }
                    style={{ fontSize: 9, margin: 0 }}
                >
                    {(pm || 'cash').toUpperCase()}
                </Tag>
            ),
        },
        {
            title: 'By',
            key: 'recorded_by',
            width: 100,
            render: (_: any, r: FuelSale) => (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {r.recorded_by
                        ? `${r.recorded_by.first_name} ${r.recorded_by.last_name}`
                        : '-'}
                </span>
            ),
        },
    ];

    const todaySalesColumns = buildSalesColumns('Time', 'h:mm A', 100, 'green');
    const salesColumns = buildSalesColumns('Date', 'MM/DD HH:mm', 120, 'blue');

    const productColumns = [
        {
            title: 'Product',
            dataIndex: 'type',
            key: 'type',
            width: 180,
            render: (t: string) => (
                <Space>
                    <ShopOutlined style={{ color: 'var(--success)' }} />
                    <span
                        style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                        }}
                    >
                        {t}
                    </span>
                </Space>
            ),
        },
        {
            title: 'Price/L',
            key: 'price',
            width: 120,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    ₱{formatNumber(getActivePrice(r.id))}
                </span>
            ),
        },
        {
            title: 'Stock (L)',
            key: 'stock',
            width: 110,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => {
                const st = getCurrentStock(r.id);
                const isLow = st > 0 && st <= lowStockThreshold;
                const isOut = st <= 0;
                const stockColor = isOut
                    ? 'var(--danger)'
                    : isLow
                      ? 'var(--warning)'
                      : 'var(--success)';
                return (
                    <Space size={4}>
                        <span
                            style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: stockColor,
                            }}
                        >
                            {formatNumber(st)} L
                        </span>
                        {(isLow || isOut) && (
                            <WarningOutlined
                                style={{ color: stockColor, fontSize: 12 }}
                            />
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Cost Value',
            key: 'costVal',
            width: 120,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {formatCurrency(getTotalCostValue(r.id))}
                </span>
            ),
        },
        {
            title: 'Selling Value',
            key: 'sellVal',
            width: 120,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span
                    style={{
                        fontWeight: 600,
                        color: 'var(--success)',
                        fontSize: 12,
                    }}
                >
                    {formatCurrency(getTotalSellingValue(r.id))}
                </span>
            ),
        },
        {
            title: 'Sold (L)',
            key: 'sold',
            width: 90,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ color: 'var(--info)' }}>
                    {formatNumber(getTotalSold(r.id))} L
                </span>
            ),
        },
        {
            title: 'Revenue (All-time)',
            key: 'rev',
            width: 130,
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(getTotalRevenue(r.id))}
                </span>
            ),
        },
        {
            title: '',
            key: 'act',
            width: 40,
            align: 'center' as const,
            render: (_: any, r: FuelProduct) => (
                <Tooltip title="Edit">
                    <Button
                        type="text"
                        size="small"
                        icon={
                            <EditOutlined style={{ color: 'var(--success)' }} />
                        }
                        onClick={() => handleEdit(r)}
                    />
                </Tooltip>
            ),
        },
    ];

    // ✅ Read-only remittance columns — no approve/reject
    const remittanceColumns = [
        {
            title: 'Staff',
            key: 'staff',
            render: (_: any, record: Remittance) => (
                <Space>
                    <span style={{ color: 'var(--text-primary)' }}>
                        {record.staff?.first_name} {record.staff?.last_name}
                    </span>
                    <span
                        style={{ color: 'var(--text-tertiary)', fontSize: 12 }}
                    >
                        ({record.staff?.email})
                    </span>
                </Space>
            ),
        },
        {
            title: 'Remittance Date',
            dataIndex: 'remittance_date',
            key: 'date',
            render: (date: string) => (
                <span style={{ color: 'var(--text-secondary)' }}>
                    {dayjs(date).format('YYYY-MM-DD')}
                </span>
            ),
        },
        {
            title: 'Remitted Amount',
            dataIndex: 'remitted_amount',
            key: 'remitted',
            render: (amount: number) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(amount)}
                </span>
            ),
        },
        {
            title: 'Actual Sales',
            dataIndex: 'actual_sales_amount',
            key: 'actual',
            render: (amount: number, record: Remittance) => {
                const diff =
                    record.actual_sales_amount - record.remitted_amount;
                const isMatch = Math.abs(diff) < 0.01;
                return (
                    <Space>
                        <span style={{ color: 'var(--text-primary)' }}>
                            {formatCurrency(amount)}
                        </span>
                        {!isMatch && (
                            <Tag
                                color={diff > 0 ? 'red' : 'orange'}
                                style={{ margin: 0 }}
                            >
                                {diff > 0
                                    ? `Short by ${formatCurrency(diff)}`
                                    : `Over by ${formatCurrency(Math.abs(diff))}`}
                            </Tag>
                        )}
                        {isMatch && (
                            <Tag color="green" style={{ margin: 0 }}>
                                Exact Match
                            </Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: () => (
                <Tag
                    icon={<CheckCircleOutlined />}
                    color="success"
                    style={{ margin: 0 }}
                >
                    AUTO-APPROVED
                </Tag>
            ),
        },
        {
            title: 'Submitted',
            dataIndex: 'created_at',
            key: 'created',
            render: (date: string) => (
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {dayjs(date).format('YYYY-MM-DD HH:mm')}
                </span>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            width: 100,
            align: 'center' as const,
            render: (_: any, record: Remittance) => (
                <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handleViewRemittance(record)}
                    style={{ borderRadius: 6 }}
                >
                    View
                </Button>
            ),
        },
    ];

    // ─── Footer summary item ──────────────────────────────────────────────────

    const FooterStat: React.FC<{
        label: string;
        value: string;
        color: string;
    }> = ({ label, value, color }) => (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <span
                style={{
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginRight: 4,
                }}
            >
                {label}
            </span>
            <span style={{ fontWeight: 700, color, fontSize: 14 }}>
                {value}
            </span>
        </div>
    );

    // ─── Tabs ─────────────────────────────────────────────────────────────────

    const tabItems = [
        {
            key: 'today',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <CalendarOutlined /> Today's Sales{' '}
                    {todayTotalTransactions > 0 && (
                        <Badge
                            count={todayTotalTransactions}
                            style={{ marginLeft: 6 }}
                        />
                    )}
                </span>
            ),
            children: (
                <>
                    <div
                        style={{
                            marginBottom: 12,
                            padding: '10px 14px',
                            background: 'var(--bg-surface-hover)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 10,
                        }}
                    >
                        <Space wrap size={16}>
                            <span
                                style={{
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    fontSize: 13,
                                }}
                            >
                                <DollarOutlined
                                    style={{
                                        color: 'var(--success)',
                                        marginRight: 6,
                                    }}
                                />
                                Today's Revenue &amp; Profit
                            </span>
                            <FooterStat
                                label="Revenue:"
                                value={formatCurrency(todayTotalRevenue)}
                                color="var(--success)"
                            />
                            <FooterStat
                                label="Cost:"
                                value={formatCurrency(dailyTotals.cost)}
                                color="var(--danger)"
                            />
                            <FooterStat
                                label="Profit:"
                                value={formatCurrency(dailyTotals.profit)}
                                color={
                                    dailyTotals.profit >= 0
                                        ? 'var(--success)'
                                        : 'var(--danger)'
                                }
                            />
                        </Space>
                        <Space>
                            <Button
                                size="small"
                                disabled={isProfitToday}
                                onClick={() => setProfitDate(dayjs())}
                            >
                                Today
                            </Button>
                            <DatePicker
                                size="small"
                                value={profitDate}
                                allowClear={false}
                                disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                                onChange={(d) => d && setProfitDate(d)}
                            />
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                loading={dailyLoading}
                                onClick={() => fetchDailyProfit()}
                            />
                        </Space>
                    </div>

                    <div
                        style={{
                            marginBottom: 12,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8,
                        }}
                    >
                        <Space wrap>
                            <Tag color="green" style={{ margin: 0 }}>
                                Txn: {todayTotalTransactions}
                            </Tag>
                            <Tag color="blue" style={{ margin: 0 }}>
                                {formatNumber(todayTotalLiters)} L
                            </Tag>
                            <Tag color="orange" style={{ margin: 0 }}>
                                Revenue: {formatCurrency(todayTotalRevenue)}
                            </Tag>
                            {isProfitToday && (
                                <Tag
                                    color={
                                        dailyTotals.profit >= 0 ? 'cyan' : 'red'
                                    }
                                    style={{ margin: 0 }}
                                >
                                    Profit: {formatCurrency(dailyTotals.profit)}
                                </Tag>
                            )}
                        </Space>
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={exportTodayReport}
                            disabled={!todaySales.length}
                            size="small"
                            style={{ borderRadius: 6 }}
                        >
                            Export Today
                        </Button>
                    </div>
                    <Table
                        dataSource={todaySales}
                        columns={todaySalesColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        style={{ width: '100%' }}
                    />
                </>
            ),
        },
        {
            key: 'products',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <ShopOutlined /> Products ({products.length})
                </span>
            ),
            children: (
                <>
                    <Table
                        dataSource={products}
                        columns={productColumns}
                        loading={loading}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                    />
                    {products.length > 0 && (
                        <div
                            style={{
                                marginTop: 12,
                                padding: '12px 16px',
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                gap: 24,
                                flexWrap: 'wrap',
                            }}
                        >
                            <FooterStat
                                label="Total Cost Value:"
                                value={formatCurrency(grandTotalCostValue)}
                                color="var(--text-primary)"
                            />
                            <FooterStat
                                label="Total Selling Value:"
                                value={formatCurrency(grandTotalSellingValue)}
                                color="var(--success)"
                            />
                            <FooterStat
                                label="Profit:"
                                value={formatCurrency(
                                    grandTotalSellingValue -
                                        grandTotalCostValue,
                                )}
                                color={
                                    grandTotalSellingValue -
                                        grandTotalCostValue >
                                    0
                                        ? 'var(--success)'
                                        : 'var(--danger)'
                                }
                            />
                        </div>
                    )}
                </>
            ),
        },
        {
            key: 'sales',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <DollarOutlined /> Sales History ({totalSalesCount})
                </span>
            ),
            children: (
                <>
                    <div style={{ marginBottom: 12, textAlign: 'right' }}>
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={exportSalesReport}
                            disabled={!sales.length}
                            size="small"
                            style={{ borderRadius: 6 }}
                        >
                            Export All Sales
                        </Button>
                        <Tooltip title="Download a per-day, per-product revenue breakdown (all recorded sales)">
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={exportDailyRevenueReport}
                                disabled={!sales.length}
                                size="small"
                                style={{ borderRadius: 6, marginLeft: 8 }}
                            >
                                Daily Revenue Report
                            </Button>
                        </Tooltip>
                    </div>
                                        <Table
                        dataSource={sales}
                        columns={salesColumns}
                        rowKey="id"
                        size="small"
                        style={{ width: '100%' }}
                        pagination={{
                            current: salesPage,
                            pageSize: salesPageSize,
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '25', '50', '100'],
                            showQuickJumper: true,
                            showTotal: (total, range) =>
                                `${range[0]}–${range[1]} of ${total} sale${
                                    total === 1 ? '' : 's'
                                }`,
                            onChange: (page, size) => {
                                setSalesPage(page);
                                setSalesPageSize(size);
                            },
                            size: 'small',
                        }}
                        scroll={{ x: 'max-content' }}
                    />
                </>
            ),
        },
        {
            key: 'remittances',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <CheckOutlined style={{ color: 'var(--primary)' }} />{' '}
                    Remittances ({remittances.length})
                </span>
            ),
            children: (
                <>
                    <div
                        style={{
                            marginBottom: 16,
                            display: 'flex',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}
                    >
                        <DatePicker
                            placeholder="Date From"
                            onChange={(date) =>
                                setRemFilters((prev) => ({
                                    ...prev,
                                    date_from: date
                                        ? date.format('YYYY-MM-DD')
                                        : '',
                                }))
                            }
                        />
                        <DatePicker
                            placeholder="Date To"
                            onChange={(date) =>
                                setRemFilters((prev) => ({
                                    ...prev,
                                    date_to: date
                                        ? date.format('YYYY-MM-DD')
                                        : '',
                                }))
                            }
                        />
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchRemittances}
                            loading={remLoading}
                        >
                            Refresh
                        </Button>
                    </div>
                    <Table
                        dataSource={remittances}
                        columns={remittanceColumns}
                        rowKey="id"
                        loading={remLoading}
                        pagination={{ pageSize: 10 }}
                        size="small"
                        locale={{
                            emptyText: 'No remittance records found.',
                        }}
                    />
                </>
            ),
        },
    ];

    if (loading)
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading fuel products..." />
            </div>
        );

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Fuel Products</h1>
                    <p className="page-description">
                        Manage fuel products and view current stock levels.
                    </p>
                </div>
                <Tooltip title={`Low stock threshold: ${lowStockThreshold} L`}>
                    <Badge
                        count={
                            lowStockProducts.length + outOfStockProducts.length
                        }
                    >
                        <Button
                            icon={<BellOutlined />}
                            onClick={() => {
                                thresholdForm.setFieldsValue({
                                    threshold: lowStockThreshold,
                                });
                                setThresholdModalVisible(true);
                            }}
                            style={{ borderRadius: 6 }}
                        >
                            Stock Alert Settings
                        </Button>
                    </Badge>
                </Tooltip>
            </div>

            {outOfStockProducts.length > 0 && (
                <Alert
                    type="error"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginBottom: 10, borderRadius: 8 }}
                    message={
                        <span>
                            <strong style={{ color: 'var(--danger-text)' }}>
                                Out of Stock:{' '}
                            </strong>
                            <span style={{ color: 'var(--text-primary)' }}>
                                {outOfStockProducts
                                    .map((p) => p.type)
                                    .join(', ')}
                            </span>
                        </span>
                    }
                />
            )}
            {lowStockProducts.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginBottom: 16, borderRadius: 8 }}
                    message={
                        <span>
                            <strong style={{ color: 'var(--warning-text)' }}>
                                Low Stock:{' '}
                            </strong>
                            <span style={{ color: 'var(--text-primary)' }}>
                                {lowStockProducts
                                    .map(
                                        (p) =>
                                            `${p.type} (${formatNumber(getCurrentStock(p.id))} L)`,
                                    )
                                    .join(', ')}
                            </span>
                        </span>
                    }
                />
            )}

            {/* Product Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                {products.map((product, index) => {
                    const stock = getCurrentStock(product.id);
                    const price = getActivePrice(product.id);
                    const sold = getTotalSold(product.id);
                    const revenue = getTotalRevenue(product.id);
                    const isLowStock = stock > 0 && stock <= lowStockThreshold;
                    const isOutOfStock = stock <= 0;
                    const cardClasses = [
                        'stat-card stat-card-success',
                        'stat-card stat-card-secondary',
                        'stat-card stat-card-warning',
                        'stat-card stat-card-primary',
                    ];
                    const cls = cardClasses[index % cardClasses.length];
                    const iconColor = isOutOfStock
                        ? 'var(--danger)'
                        : isLowStock
                          ? 'var(--warning)'
                          : 'var(--success)';
                    return (
                        <Col xs={24} sm={12} lg={6} key={product.id}>
                            <Card
                                className={cls}
                                style={{ borderRadius: 14, height: '100%' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginBottom: 4,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 700,
                                                    fontSize: 14,
                                                    color: 'var(--text-primary)',
                                                }}
                                            >
                                                {product.type}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 20,
                                                fontWeight: 700,
                                                color: iconColor,
                                                marginBottom: 6,
                                            }}
                                        >
                                            {formatCurrency(stock * price)}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            Stock:{' '}
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: iconColor,
                                                }}
                                            >
                                                {formatNumber(stock)} L
                                            </span>
                                            {isLowStock && (
                                                <Tag
                                                    color="warning"
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '0 4px',
                                                        margin: '0 0 0 6px',
                                                    }}
                                                >
                                                    Low
                                                </Tag>
                                            )}
                                            {isOutOfStock && (
                                                <Tag
                                                    color="error"
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '0 4px',
                                                        margin: '0 0 0 6px',
                                                    }}
                                                >
                                                    Out
                                                </Tag>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: 'var(--text-secondary)',
                                                marginTop: 4,
                                            }}
                                        >
                                            Price:{' '}
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: 'var(--text-primary)',
                                                }}
                                            >
                                                ₱{formatNumber(price)}/L
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: 'var(--text-secondary)',
                                                marginTop: 4,
                                            }}
                                        >
                                            Sold (all-time):{' '}
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: 'var(--info)',
                                                }}
                                            >
                                                {formatNumber(sold)} L
                                            </span>{' '}
                                            ·{' '}
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: 'var(--success)',
                                                }}
                                            >
                                                {formatCurrency(revenue)}
                                            </span>
                                        </div>
                                    </div>
                                    {isOutOfStock || isLowStock ? (
                                        <WarningOutlined
                                            style={{
                                                color: iconColor,
                                                fontSize: 26,
                                                opacity: 0.8,
                                                flexShrink: 0,
                                            }}
                                        />
                                    ) : (
                                        <FireOutlined
                                            style={{
                                                color: 'var(--success)',
                                                fontSize: 26,
                                                opacity: 0.8,
                                                flexShrink: 0,
                                            }}
                                        />
                                    )}
                                </div>
                            </Card>
                        </Col>
                    );
                })}
            </Row>

            {/* Summary Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <SummaryCard
                        className="stat-card stat-card-success"
                        label="Total Products"
                        value={totalProducts}
                        icon={<ShopOutlined style={{ color: 'var(--success)' }} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <SummaryCard
                        className="stat-card stat-card-secondary"
                        label="Total Stock Value"
                        value={formatCurrency(totalStockValue)}
                        valueSize={22}
                        icon={<InboxOutlined style={{ color: 'var(--info)' }} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <SummaryCard
                        className="stat-card stat-card-success"
                        label="Total Sales"
                        value={totalSalesCount}
                        sub={`${formatNumber(totalLitersSold)} L sold`}
                        icon={<DollarOutlined style={{ color: 'var(--success)' }} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <SummaryCard
                        className="stat-card stat-card-warning"
                        label="Total Revenue (All-time)"
                        value={formatCurrency(totalRevenue)}
                        valueSize={22}
                        valueColor="var(--warning)"
                        icon={<FireOutlined style={{ color: 'var(--warning)' }} />}
                    />
                </Col>
            </Row>

            {/* Main Table */}
            <Card
                title={
                    <Space>
                        <FireOutlined style={{ color: 'var(--primary)' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Fuel Products Management
                        </span>
                    </Space>
                }
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAdd}
                        style={{ borderRadius: 6 }}
                    >
                        Add Product
                    </Button>
                }
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: '16px', overflow: 'visible' } }}
            >
                <Tabs defaultActiveKey="today" items={tabItems} />
            </Card>

            {/* Add/Edit Modal */}
            <Modal
                title={
                    <Space>
                        {editingProduct ? <EditOutlined /> : <PlusOutlined />}
                        <span style={{ color: 'var(--text-primary)' }}>
                            {editingProduct ? 'Edit Product' : 'Add Product'}
                        </span>
                    </Space>
                }
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                width={450}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item
                        name="type"
                        label="Fuel Type"
                        rules={[{ required: true }]}
                    >
                        <Input
                            placeholder="e.g., Gasoline, Diesel"
                            size="large"
                            style={{ borderRadius: 6 }}
                        />
                    </Form.Item>
                    <Form.Item
                        name="selling_price"
                        label="Selling Price (₱/L)"
                        rules={[{ required: true }]}
                    >
                        <InputNumber
                            style={{ width: '100%', borderRadius: 6 }}
                            size="large"
                            min={0}
                            step={0.01}
                            placeholder="Enter selling price"
                        />
                    </Form.Item>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Button
                            onClick={() => setModalVisible(false)}
                            size="large"
                            style={{ marginRight: 8, borderRadius: 6 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            style={{ borderRadius: 6 }}
                        >
                            {editingProduct ? 'Update' : 'Add'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Stock Alert Settings Modal */}
            <Modal
                title={
                    <Space>
                        <SettingOutlined style={{ color: 'var(--warning)' }} />
                        <span style={{ color: 'var(--text-primary)' }}>
                            Stock Alert Settings
                        </span>
                    </Space>
                }
                open={thresholdModalVisible}
                onCancel={() => setThresholdModalVisible(false)}
                footer={null}
                width={420}
            >
                <Form
                    form={thresholdForm}
                    layout="vertical"
                    onFinish={handleSaveThreshold}
                >
                    <div
                        style={{
                            marginBottom: 16,
                            padding: 12,
                            background: 'var(--warning-bg)',
                            borderRadius: 8,
                            border: '1px solid var(--warning-border)',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 13,
                                color: 'var(--warning-text)',
                            }}
                        >
                            When stock falls below this threshold, a{' '}
                            <strong>Low Stock Warning</strong> will appear.
                        </div>
                    </div>
                    <Form.Item
                        name="threshold"
                        label="Low Stock Threshold (Liters)"
                        rules={[{ required: true }]}
                    >
                        <InputNumber
                            style={{ width: '100%', borderRadius: 6 }}
                            size="large"
                            min={1}
                            step={100}
                            placeholder="e.g., 500"
                            addonAfter="L"
                        />
                    </Form.Item>
                    <div
                        style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            marginBottom: 16,
                        }}
                    >
                        Current:{' '}
                        <strong style={{ color: 'var(--warning)' }}>
                            {lowStockThreshold} L
                        </strong>
                    </div>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Button
                            onClick={() => setThresholdModalVisible(false)}
                            size="large"
                            style={{ borderRadius: 6 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            style={{ marginLeft: 8, borderRadius: 6 }}
                        >
                            Save Setting
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Remittance Detail Modal (read-only) */}
            <Modal
                title={
                    <span style={{ color: 'var(--text-primary)' }}>
                        Remittance Details
                    </span>
                }
                open={remModalVisible}
                onCancel={() => setRemModalVisible(false)}
                footer={
                    <Button onClick={() => setRemModalVisible(false)}>
                        Close
                    </Button>
                }
                width={600}
            >
                {selectedRemittance && (
                    <div>
                        {[
                            [
                                'Staff:',
                                `${selectedRemittance.staff?.first_name} ${selectedRemittance.staff?.last_name}`,
                                'var(--text-primary)',
                            ],
                            [
                                'Email:',
                                selectedRemittance.staff?.email,
                                'var(--text-primary)',
                            ],
                            [
                                'Remittance Date:',
                                dayjs(selectedRemittance.remittance_date).format(
                                    'YYYY-MM-DD',
                                ),
                                'var(--text-primary)',
                            ],
                            [
                                'Claimed Amount:',
                                formatCurrency(selectedRemittance.remitted_amount),
                                'var(--success)',
                            ],
                            [
                                'Actual Sales:',
                                formatCurrency(
                                    selectedRemittance.actual_sales_amount,
                                ),
                                'var(--text-primary)',
                            ],
                        ].map(([label, value, color]) => (
                            <p key={label}>
                                <strong style={{ color: 'var(--text-secondary)' }}>
                                    {label}
                                </strong>{' '}
                                <span style={{ color }}>{value}</span>
                            </p>
                        ))}
                        <p>
                            <strong style={{ color: 'var(--text-secondary)' }}>
                                Status:
                            </strong>{' '}
                            <Tag
                                icon={<CheckCircleOutlined />}
                                color="green"
                                style={{ margin: 0 }}
                            >
                                AUTO-APPROVED
                            </Tag>
                        </p>
                        {selectedRemittance.reviewed_at && (
                            <p>
                                <strong
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Accepted At:
                                </strong>{' '}
                                <span style={{ color: 'var(--text-primary)' }}>
                                    {dayjs(
                                        selectedRemittance.reviewed_at,
                                    ).format('YYYY-MM-DD HH:mm')}
                                </span>
                            </p>
                        )}

                        <div
                            style={{
                                marginTop: 16,
                                padding: '10px 14px',
                                background: 'rgba(16,185,129,0.08)',
                                borderRadius: 8,
                                border: '1px solid rgba(16,185,129,0.3)',
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                            }}
                        >
                            <CheckCircleOutlined
                                style={{ color: 'var(--success)', marginTop: 2 }}
                            />
                            <span>
                                This remittance was{' '}
                                <strong style={{ color: 'var(--success)' }}>
                                    automatically accepted
                                </strong>{' '}
                                when it was submitted. No manual review is
                                required.
                            </span>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default FuelProducts;