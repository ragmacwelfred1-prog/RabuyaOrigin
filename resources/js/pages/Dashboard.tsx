// resources/js/pages/Dashboard.tsx
import React from 'react';
import {
    Card,
    Row,
    Col,
    Table,
    Tag,
    Progress,
    Spin,
    Space,
    Radio,
} from 'antd';
import {
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    CarOutlined,
    FireOutlined,
    DollarOutlined,
    ShoppingOutlined,
    RiseOutlined,
    WarningOutlined,
    CalendarOutlined,
    ToolOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface DashboardStats {
    success: boolean;
    total_slots: number;
    available_slots: number;
    occupied_slots: number;
    maintenance_slots: number;
    occupancy_rate: number;
    month_parking_revenue: number;
    total_fuel_revenue: number;
    weekly: { day: string; fuel_sales: number; parking_revenue: number }[];
    monthly: { month: string; fuel_sales: number; parking_revenue: number }[];
}

interface FuelProduct {
    id: number;
    type: string;
    current_selling_price?: number;
}

interface FuelInventoryRow {
    id: number;
    fuel_product_id: number;
    remaining_liters: number;
    selling_price_per_liter: number;
    delivery_date: string;
    fuel_product?: FuelProduct;
}

interface FuelSaleRow {
    id: number;
    fuel_product_id: number | null;
    liters: number;
    price_per_liter: number;
    total_amount: number;
    fuel_product?: FuelProduct;
}

interface ParkingSlot {
    id: number;
    slot_number: string;
    status: 'available' | 'occupied' | 'maintenance';
    nightly_rate: number;
}

interface FuelProfitSummary {
    success: boolean;
    total_cost: number;
    total_revenue: number;
    total_profit: number;
    profit_margin: number;
}

// Theme-aware: values come from CSS variables so charts follow light/dark.
const CHART_COLORS = {
    fuel: 'var(--chart-fuel)',
    parking: 'var(--chart-parking)',
};

const PIE_COLORS = [
    'var(--chart-fuel)',
    'var(--chart-parking)',
    'var(--chart-danger)',
];

const RevenueTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const fuel = payload.find((p: any) => p.dataKey === 'gasoline')?.value ?? 0;
    const parking =
        payload.find((p: any) => p.dataKey === 'parking')?.value ?? 0;
    return (
        <div
            style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: '10px 14px',
                boxShadow: '0 8px 24px var(--shadow-color)',
            }}
        >
            <p
                style={{
                    fontWeight: 700,
                    margin: '0 0 6px',
                    color: 'var(--primary)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                }}
            >
                {label}
            </p>
            <p
                style={{
                    color: CHART_COLORS.fuel,
                    margin: '2px 0',
                    fontSize: 13,
                    fontWeight: 600,
                }}
            >
                Fuel: {formatCurrency(fuel)}
            </p>
            <p
                style={{
                    color: CHART_COLORS.parking,
                    margin: '2px 0',
                    fontSize: 13,
                    fontWeight: 600,
                }}
            >
                Parking: {formatCurrency(parking)}
            </p>
        </div>
    );
};

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(n || 0);

const formatNumber = (n: number) => {
    if (n % 1 === 0) return n.toLocaleString();
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

const toNum = (v: any): number => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? 0 : n;
};

const PieLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
}: any) => {
    if (percent < 0.05) return null;
    const R = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
        <text
            x={cx + r * Math.cos(-midAngle * R)}
            y={cy + r * Math.sin(-midAngle * R)}
            fill="var(--chart-label)"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={700}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

const Dashboard: React.FC = () => {
    const [chartType, setChartType] = React.useState<'weekly' | 'monthly'>(
        'weekly',
    );

    const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
        queryKey: ['dashboard-stats'],
        queryFn: async () => (await api.get('/admin/dashboard/stats')).data,
    });

    const { data: fuelProfit, isLoading: profitLoading } =
        useQuery<FuelProfitSummary>({
            queryKey: ['fuel-profit-summary'],
            queryFn: async () => {
                const response = await api.get('/admin/fuel-profit-summary');
                return response.data;
            },
            refetchInterval: 300000,
        });

    const { data: products = [], isLoading: productsLoading } = useQuery<
        FuelProduct[]
    >({
        queryKey: ['fuel-products'],
        queryFn: async () => {
            const r = await api.get('/fuel-products');
            return Array.isArray(r.data) ? r.data : [];
        },
    });

    const { data: inventory = [], isLoading: inventoryLoading } = useQuery<
        FuelInventoryRow[]
    >({
        queryKey: ['fuel-inventory'],
        queryFn: async () => {
            const r = await api.get('/fuel/inventory');
            return Array.isArray(r.data) ? r.data : [];
        },
    });

    const { data: sales = [], isLoading: salesLoading } = useQuery<FuelSaleRow[]>(
        {
            queryKey: ['fuel-sales'],
            queryFn: async () => {
                const r = await api.get('/fuel/sales');
                return Array.isArray(r.data) ? r.data : [];
            },
        },
    );

    const { data: parkingSlots = [], isLoading: parkingLoading } = useQuery<
        ParkingSlot[]
    >({
        queryKey: ['parking-slots'],
        queryFn: async () => {
            const r = await api.get('/parking-slots');
            return Array.isArray(r.data) ? r.data : [];
        },
    });

    const isLoading =
        statsLoading ||
        productsLoading ||
        inventoryLoading ||
        salesLoading ||
        parkingLoading ||
        profitLoading;

    const getCurrentStock = (pid: number): number =>
        inventory
            .filter(
                (i) =>
                    i.fuel_product_id === pid && toNum(i.remaining_liters) > 0,
            )
            .reduce((s, i) => s + toNum(i.remaining_liters), 0);

    const getCurrentPrice = (pid: number): number => {
        const withStock = inventory
            .filter(
                (i) =>
                    i.fuel_product_id === pid && toNum(i.remaining_liters) > 0,
            )
            .sort(
                (a, b) =>
                    new Date(b.delivery_date).getTime() -
                    new Date(a.delivery_date).getTime(),
            );
        if (withStock.length)
            return toNum(withStock[0].selling_price_per_liter);
        const p = products.find((pr) => pr.id === pid);
        return toNum(p?.current_selling_price);
    };

    const getTotalSold = (pid: number): number =>
        sales
            .filter((s) => s.fuel_product_id === pid)
            .reduce((s, r) => s + toNum(r.liters), 0);
    const getTotalRevenue = (pid: number): number =>
        sales
            .filter((s) => s.fuel_product_id === pid)
            .reduce((s, r) => s + toNum(r.total_amount), 0);

    const totalSlots = stats?.total_slots ?? parkingSlots.length;
    const availableSlots =
        stats?.available_slots ??
        parkingSlots.filter((s) => s.status === 'available').length;
    const occupiedSlots =
        stats?.occupied_slots ??
        parkingSlots.filter((s) => s.status === 'occupied').length;
    const maintenanceSlots =
        stats?.maintenance_slots ??
        parkingSlots.filter((s) => s.status === 'maintenance').length;
    const occupancyRate =
        stats?.occupancy_rate ??
        (totalSlots > 0 ? (occupiedSlots / totalSlots) * 100 : 0);
    const totalParkingRevenue = toNum(stats?.month_parking_revenue);

    const totalLitersSold = sales.reduce((s, r) => s + toNum(r.liters), 0);
    const totalFuelRevenue = sales.reduce(
        (s, r) => s + toNum(r.total_amount),
        0,
    );
    const lowStockThreshold = 100;

    const lowStockProducts = products.filter((p) => {
        const st = getCurrentStock(p.id);
        return st > 0 && st < lowStockThreshold;
    });
    const outOfStockProducts = products.filter(
        (p) => getCurrentStock(p.id) <= 0,
    );

    const weeklyData = (stats?.weekly ?? []).map((d) => ({
        name: d.day,
        gasoline: toNum(d.fuel_sales),
        parking: toNum(d.parking_revenue),
    }));
    const monthlyData = (stats?.monthly ?? []).map((d) => ({
        name: d.month,
        gasoline: toNum(d.fuel_sales),
        parking: toNum(d.parking_revenue),
    }));
    const chartData = chartType === 'weekly' ? weeklyData : monthlyData;

    const occupancyData = [
        { name: 'Available', value: availableSlots },
        { name: 'Occupied', value: occupiedSlots },
        { name: 'Maintenance', value: maintenanceSlots },
    ];

    const sumPrice = products.reduce((s, p) => s + getCurrentPrice(p.id), 0);
    const sumStock = products.reduce((s, p) => s + getCurrentStock(p.id), 0);
    const sumStockValue = products.reduce(
        (s, p) => s + getCurrentStock(p.id) * getCurrentPrice(p.id),
        0,
    );

    const fuelColumns = [
        {
            title: 'Product',
            key: 'product',
            render: (_: any, r: FuelProduct) => (
                <Space>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent)',
                            fontSize: 14,
                        }}
                    >
                        <FireOutlined />
                    </div>
                    <div
                        style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                        }}
                    >
                        {r.type}
                    </div>
                </Space>
            ),
        },
        {
            title: 'Price/L',
            key: 'price',
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(getCurrentPrice(r.id))}
                </span>
            ),
        },
        {
            title: 'Stock (L)',
            key: 'stock',
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => {
                const st = getCurrentStock(r.id);
                const out = st <= 0;
                const low = st > 0 && st < lowStockThreshold;
                return (
                    <span
                        style={{
                            fontWeight: 600,
                            color: out
                                ? 'var(--danger)'
                                : low
                                  ? 'var(--warning)'
                                  : 'var(--success)',
                        }}
                    >
                        {formatNumber(st)} L
                    </span>
                );
            },
        },
        {
            title: 'Stock Value',
            key: 'sv',
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ color: 'var(--info)', fontWeight: 500 }}>
                    {formatCurrency(
                        getCurrentStock(r.id) * getCurrentPrice(r.id),
                    )}
                </span>
            ),
        },
        {
            title: 'Sold (L)',
            key: 'sold',
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(getTotalSold(r.id))} L
                </span>
            ),
        },
        {
            title: 'Revenue',
            key: 'rev',
            align: 'right' as const,
            render: (_: any, r: FuelProduct) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(getTotalRevenue(r.id))}
                </span>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_: any, r: FuelProduct) => {
                const st = getCurrentStock(r.id);
                if (st <= 0) return <Tag color="error">Out of Stock</Tag>;
                if (st < lowStockThreshold)
                    return <Tag color="warning">Low Stock</Tag>;
                return <Tag color="success">In Stock</Tag>;
            },
        },
    ];

    if (isLoading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading dashboard..." />
            </div>
        );
    }

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-card)',
        borderColor: 'var(--border-color)',
        borderRadius: 24,
        height: '100%',
    };

    const statCardBodyStyle: React.CSSProperties = {
        height: 140,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '20px 24px',
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-description">
                        Overview of parking and fuel operations
                    </p>
                </div>
            </div>

            {fuelProfit && (
                <Card
                    title={
                        <Space>
                            <FireOutlined
                                style={{ color: 'var(--accent)' }}
                            />
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: 'var(--primary)',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 24,
                                }}
                            >
                                Fuel Profit Summary
                            </span>
                            <Tag color="blue" style={{ fontSize: 11 }}>
                                All Time
                            </Tag>
                        </Space>
                    }
                    style={{ ...cardStyle, marginBottom: 24 }}
                >
                    <Row gutter={[24, 16]} align="middle">
                        <Col xs={24} sm={8}>
                            <div style={{ textAlign: 'center' }}>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Revenue
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {formatCurrency(
                                        fuelProfit.total_revenue || 0,
                                    )}
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={8}>
                            <div style={{ textAlign: 'center' }}>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Cost
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--danger)',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {formatCurrency(fuelProfit.total_cost || 0)}
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} sm={8}>
                            <div style={{ textAlign: 'center' }}>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Profit
                                </div>
                                <div>
                                    <span
                                        style={{
                                            fontSize: 28,
                                            fontWeight: 700,
                                            color:
                                                (fuelProfit.total_profit ||
                                                    0) >= 0
                                                    ? 'var(--success)'
                                                    : 'var(--danger)',
                                            fontFamily: 'var(--font-display)',
                                        }}
                                    >
                                        {formatCurrency(
                                            fuelProfit.total_profit || 0,
                                        )}
                                    </span>
                                    <Tag
                                        color={
                                            (fuelProfit.profit_margin || 0) >=
                                            20
                                                ? 'green'
                                                : (fuelProfit.profit_margin ||
                                                        0) >= 0
                                                  ? 'orange'
                                                  : 'red'
                                        }
                                        style={{ marginLeft: 10, fontSize: 12 }}
                                    >
                                        {(
                                            fuelProfit.profit_margin || 0
                                        ).toFixed(1)}
                                        % margin
                                    </Tag>
                                </div>
                            </div>
                        </Col>
                    </Row>
                </Card>
            )}

            <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-primary"
                        styles={{ body: statCardBodyStyle }}
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
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        letterSpacing: '0.3px',
                                    }}
                                >
                                    Total Slots
                                </div>
                                <div
                                    style={{
                                        fontSize: 40,
                                        fontWeight: 700,
                                        color: 'var(--primary)',
                                        lineHeight: 1.1,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {totalSlots}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                    }}
                                >
                                    {Math.round(occupancyRate)}% occupied
                                </div>
                            </div>
                            <div className="stat-card-icon">
                                <CarOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-success"
                        styles={{ body: statCardBodyStyle }}
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
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        letterSpacing: '0.3px',
                                    }}
                                >
                                    Parking Revenue
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                        lineHeight: 1.1,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {formatCurrency(totalParkingRevenue)}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                    }}
                                >
                                    This month
                                </div>
                            </div>
                            <div className="stat-card-icon">
                                <DollarOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-secondary"
                        styles={{ body: statCardBodyStyle }}
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
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        letterSpacing: '0.3px',
                                    }}
                                >
                                    Fuel Products
                                </div>
                                <div
                                    style={{
                                        fontSize: 40,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.1,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {products.length}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                    }}
                                >
                                    {formatNumber(totalLitersSold)} L sold
                                </div>
                            </div>
                            <div className="stat-card-icon">
                                <FireOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-warning"
                        styles={{ body: statCardBodyStyle }}
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
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                        letterSpacing: '0.3px',
                                    }}
                                >
                                    Fuel Revenue
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--accent)',
                                        lineHeight: 1.1,
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {formatCurrency(
                                        toNum(stats?.total_fuel_revenue) ||
                                            totalFuelRevenue,
                                    )}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                    }}
                                >
                                    All time
                                </div>
                            </div>
                            <div className="stat-card-icon">
                                <ShoppingOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <RiseOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span>Revenue Trend</span>
                            </Space>
                        }
                        extra={
                            <Radio.Group
                                value={chartType}
                                onChange={(e) => setChartType(e.target.value)}
                                size="small"
                            >
                                <Radio.Button value="weekly">
                                    Weekly
                                </Radio.Button>
                                <Radio.Button value="monthly">
                                    Monthly
                                </Radio.Button>
                            </Radio.Group>
                        }
                        style={cardStyle}
                    >
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart
                                data={chartData}
                                margin={{
                                    top: 5,
                                    right: 20,
                                    left: 0,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="var(--border-color)"
                                />
                                <XAxis
                                    dataKey="name"
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 12,
                                    }}
                                    axisLine={{
                                        stroke: 'var(--border-color)',
                                    }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 12,
                                    }}
                                    axisLine={{
                                        stroke: 'var(--border-color)',
                                    }}
                                    tickLine={false}
                                    tickFormatter={(v) =>
                                        `₱${(v / 1000).toFixed(0)}k`
                                    }
                                />
                                <Tooltip content={<RevenueTooltip />} />
                                <Legend
                                    wrapperStyle={{
                                        color: 'var(--text-secondary)',
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="gasoline"
                                    stroke={CHART_COLORS.fuel}
                                    strokeWidth={3}
                                    dot={{
                                        fill: CHART_COLORS.fuel,
                                        r: 5,
                                        strokeWidth: 2,
                                        stroke: 'var(--bg-card)',
                                    }}
                                    name="Fuel"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="parking"
                                    stroke={CHART_COLORS.parking}
                                    strokeWidth={3}
                                    dot={{
                                        fill: CHART_COLORS.parking,
                                        r: 5,
                                        strokeWidth: 2,
                                        stroke: 'var(--bg-card)',
                                    }}
                                    name="Parking"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <CarOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span>Parking Status</span>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={occupancyData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                    labelLine={false}
                                    label={<PieLabel />}
                                >
                                    {occupancyData.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(v: any) => [
                                        `${v} slot(s)`,
                                        '',
                                    ]}
                                    contentStyle={{
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 12,
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                marginTop: 8,
                            }}
                        >
                            {[
                                {
                                    label: 'Available',
                                    val: availableSlots,
                                    color: 'var(--success)',
                                    icon: <CheckCircleOutlined />,
                                },
                                {
                                    label: 'Occupied',
                                    val: occupiedSlots,
                                    color: 'var(--accent)',
                                    icon: <CarOutlined />,
                                },
                                {
                                    label: 'Maintenance',
                                    val: maintenanceSlots,
                                    color: 'var(--danger)',
                                    icon: <ToolOutlined />,
                                },
                            ].map(({ label, val, color, icon }) => (
                                <div
                                    key={label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '6px 0',
                                        borderBottom:
                                            '1px solid var(--border-light)',
                                    }}
                                >
                                    <Space size={6}>
                                        <span style={{ color, fontSize: 14 }}>
                                            {icon}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 13,
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {label}
                                        </span>
                                    </Space>
                                    <Tag
                                        color={
                                            label === 'Available'
                                                ? 'success'
                                                : label === 'Occupied'
                                                  ? 'warning'
                                                  : 'error'
                                        }
                                        style={{ margin: 0 }}
                                    >
                                        {val}
                                    </Tag>
                                </div>
                            ))}
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card
                title={
                    <Space>
                        <FireOutlined style={{ color: 'var(--primary)' }} />
                        <span>Fuel Products — Stock &amp; Revenue</span>
                    </Space>
                }
                extra={
                    <a
                        href="/fuel-products"
                        style={{
                            color: 'var(--primary)',
                            fontSize: 13,
                            textDecoration: 'none',
                            fontWeight: 600,
                        }}
                    >
                        Manage →
                    </a>
                }
                style={cardStyle}
            >
                <Table
                    dataSource={products}
                    columns={fuelColumns}
                    rowKey="id"
                    pagination={false}
                    scroll={{ x: 800 }}
                    locale={{ emptyText: 'No fuel products found' }}
                    summary={() => (
                        <Table.Summary fixed>
                            <Table.Summary.Row
                                style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    borderTop:
                                        '2px solid var(--border-color)',
                                    fontWeight: 700,
                                }}
                            >
                                <Table.Summary.Cell index={0}>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: 'var(--primary)',
                                        }}
                                    >
                                        TOTALS
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right">
                                    <span style={{ color: 'var(--success)' }}>
                                        {formatCurrency(sumPrice)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right">
                                    <span
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {formatNumber(sumStock)} L
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right">
                                    <span style={{ color: 'var(--info)' }}>
                                        {formatCurrency(sumStockValue)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right">
                                    <span
                                        style={{
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {formatNumber(totalLitersSold)} L
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={5} align="right">
                                    <span style={{ color: 'var(--success)' }}>
                                        {formatCurrency(totalFuelRevenue)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={6} />
                            </Table.Summary.Row>
                        </Table.Summary>
                    )}
                />
            </Card>

            {lowStockProducts.length > 0 && (
                <Card
                    style={{
                        marginTop: 16,
                        borderRadius: 24,
                        borderLeft: '4px solid var(--accent)',
                        background: 'var(--warning-bg)',
                        borderColor: 'var(--warning-border)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 12,
                        }}
                    >
                        <WarningOutlined
                            style={{ color: 'var(--accent)', fontSize: 20 }}
                        />
                        <h3
                            style={{
                                margin: 0,
                                fontSize: 18,
                                color: 'var(--warning-text)',
                                fontFamily: 'var(--font-display)',
                                fontWeight: 700,
                            }}
                        >
                            Low Stock Alerts (below {lowStockThreshold} L)
                        </h3>
                    </div>
                    {lowStockProducts.map((p) => (
                        <div
                            key={p.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '8px 0',
                                borderBottom:
                                    '1px solid var(--warning-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <div>
                                <strong
                                    style={{ color: 'var(--warning-text)' }}
                                >
                                    {p.type}
                                </strong>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    ₱{getCurrentPrice(p.id)}/L
                                </div>
                            </div>
                            <Space>
                                <span
                                    style={{
                                        color: 'var(--warning)',
                                        fontWeight: 600,
                                    }}
                                >
                                    {formatNumber(getCurrentStock(p.id))} L
                                </span>
                                <Tag color="warning">LOW</Tag>
                            </Space>
                        </div>
                    ))}
                </Card>
            )}

            {outOfStockProducts.length > 0 && (
                <Card
                    style={{
                        marginTop: 16,
                        borderRadius: 24,
                        borderLeft: '4px solid var(--danger)',
                        background: 'var(--danger-bg)',
                        borderColor: 'var(--danger-border)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 12,
                        }}
                    >
                        <WarningOutlined
                            style={{ color: 'var(--danger)', fontSize: 20 }}
                        />
                        <h3
                            style={{
                                margin: 0,
                                fontSize: 18,
                                color: 'var(--danger-text)',
                                fontFamily: 'var(--font-display)',
                                fontWeight: 700,
                            }}
                        >
                            Out of Stock — Restock Immediately!
                        </h3>
                    </div>
                    {outOfStockProducts.map((p) => (
                        <div
                            key={p.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '8px 0',
                                borderBottom: '1px solid var(--danger-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <strong style={{ color: 'var(--danger-text)' }}>
                                {p.type}
                            </strong>
                            <Tag color="error">OUT OF STOCK</Tag>
                        </div>
                    ))}
                </Card>
            )}
        </div>
    );
};

export default Dashboard;