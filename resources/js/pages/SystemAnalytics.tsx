
import React from 'react';
import { Card, Row, Col, Table, Tag, Space, Spin, Empty } from 'antd';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    TeamOutlined,
    UserAddOutlined,
    SafetyCertificateOutlined,
    ClockCircleOutlined,
    CreditCardOutlined,
    RiseOutlined,
    FireOutlined,
    BarChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AnalyticsData {
    success: boolean;
    bookings: {
        total: number;
        status_counts: Record<string, number>;
        approval_rate: number;
        average_nights: number;
        peak_hours: Array<{ hour: number; label: string; checkins: number }>;
        booking_status_data: Array<{ name: string; value: number }>;
    };
    customers: {
        total: number;
        new_this_month: number;
        with_bookings: number;
        repeat_customers: number;
        repeat_rate: number;
        growth: Array<{ month: string; new_customers: number }>;
    };
    fuel: {
        profit_by_product: Array<{
            type: string;
            cost: number;
            selling: number;
            profit: number;
            margin: number;
        }>;
        payment_methods: Array<{ name: string; value: number }>;
        total_profit: number;
    };
    parking: {
        payment_methods: Array<{ name: string; value: number }>;
    };
    revenue: {
        parking: number;
        fuel: number;
        total: number;
    };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    completed: '#198754',
    approved: '#198754',
    pending: '#FFC107',
    rejected: '#AB2E3C',
    cancelled: '#718096',
};

const PAYMENT_COLORS = ['#198754', '#3B82F6', '#8B5CF6'];

// ─── Component ────────────────────────────────────────────────────────────────

const SystemAnalytics: React.FC = () => {
    const { data, isLoading, error } = useQuery<AnalyticsData>({
        queryKey: ['analytics'],
        queryFn: async () => {
            const r = await api.get('/admin/analytics');
            return r.data;
        },
    });

    if (isLoading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading analytics…" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <h3>Failed to load analytics</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Please try refreshing the page
                </p>
            </div>
        );
    }

    const bookingStatusData = data.bookings.booking_status_data.filter(
        (d) => d.value > 0,
    );
    const customerGrowthData = data.customers.growth;
    const paymentData = [
        ...data.fuel.payment_methods,
        ...data.parking.payment_methods,
    ]
        .reduce(
            (acc, curr) => {
                const existing = acc.find((item) => item.name === curr.name);
                if (existing) {
                    existing.value += curr.value;
                } else {
                    acc.push({ ...curr });
                }
                return acc;
            },
            [] as Array<{ name: string; value: number }>,
        )
        .filter((d) => d.value > 0);

    const peakHourData = data.bookings.peak_hours.map((h) => ({
        label: h.label,
        checkins: h.checkins,
        fuel_sales: 0, // Fuel sales by hour not available from backend yet
    }));

    const profitRows = data.fuel.profit_by_product;

    const overallCost = profitRows.reduce((s, p) => s + p.cost, 0);
    const overallSelling = profitRows.reduce((s, p) => s + p.selling, 0);
    const overallProfit = profitRows.reduce((s, p) => s + p.profit, 0);
    const overallMargin =
        overallCost > 0 ? (overallProfit / overallCost) * 100 : 0;

    // ─── Render ───────────────────────────────────────────────────────────────

    const statBody: React.CSSProperties = {
        height: 130,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '16px 20px',
    };

    const profitColumns = [
        { title: 'Product', dataIndex: 'type', key: 'type' },
        {
            title: 'Total Cost',
            dataIndex: 'cost',
            key: 'cost',
            align: 'right' as const,
            render: (v: number) => fmtCurrency(v),
        },
        {
            title: 'Total Revenue',
            dataIndex: 'selling',
            key: 'selling',
            align: 'right' as const,
            render: (v: number) => (
                <span style={{ color: 'var(--success)' }}>
                    {fmtCurrency(v)}
                </span>
            ),
        },
        {
            title: 'Profit',
            dataIndex: 'profit',
            key: 'profit',
            align: 'right' as const,
            render: (v: number) => (
                <span
                    style={{
                        fontWeight: 600,
                        color: v >= 0 ? 'var(--success)' : 'var(--danger)',
                    }}
                >
                    {fmtCurrency(v)}
                </span>
            ),
        },
        {
            title: 'Margin',
            dataIndex: 'margin',
            key: 'margin',
            align: 'center' as const,
            render: (v: number) => (
                <Tag color={v >= 20 ? 'green' : v >= 0 ? 'orange' : 'red'}>
                    {fmtPct(v)}
                </Tag>
            ),
        },
    ];

    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 20 }}>
                <h2
                    style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 4,
                    }}
                >
                    <BarChartOutlined
                        style={{ color: 'var(--primary)', marginRight: 10 }}
                    />
                    System Analytics
                </h2>
                <p
                    style={{
                        color: 'var(--text-secondary)',
                        fontSize: 13,
                        margin: 0,
                    }}
                >
                    Booking health, customer retention, payment trends, and fuel
                    profitability.
                </p>
            </div>

            <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-success"
                        styles={{ body: statBody }}
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
                                    }}
                                >
                                    Booking Approval Rate
                                </div>
                                <div
                                    style={{
                                        fontSize: 26,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                    }}
                                >
                                    {fmtPct(data.bookings.approval_rate)}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                    }}
                                >
                                    Based on decided bookings
                                </div>
                            </div>
                            <SafetyCertificateOutlined
                                style={{
                                    color: 'var(--success)',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-secondary"
                        styles={{ body: statBody }}
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
                                    }}
                                >
                                    Avg. Length of Stay
                                </div>
                                <div
                                    style={{
                                        fontSize: 26,
                                        fontWeight: 700,
                                        color: 'var(--info)',
                                    }}
                                >
                                    {data.bookings.average_nights} nights
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                    }}
                                >
                                    Based on completed bookings
                                </div>
                            </div>
                            <ClockCircleOutlined
                                style={{
                                    color: 'var(--info)',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-primary"
                        styles={{ body: statBody }}
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
                                    }}
                                >
                                    Repeat Customer Rate
                                </div>
                                <div
                                    style={{
                                        fontSize: 26,
                                        fontWeight: 700,
                                        color: 'var(--primary)',
                                    }}
                                >
                                    {fmtPct(data.customers.repeat_rate)}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                    }}
                                >
                                    {data.customers.repeat_customers} of{' '}
                                    {data.customers.with_bookings} customers
                                </div>
                            </div>
                            <TeamOutlined
                                style={{
                                    color: 'var(--primary)',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-warning"
                        styles={{ body: statBody }}
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
                                    }}
                                >
                                    Fuel Profit Margin
                                </div>
                                <div
                                    style={{
                                        fontSize: 26,
                                        fontWeight: 700,
                                        color: 'var(--warning)',
                                    }}
                                >
                                    {fmtPct(overallMargin)}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                    }}
                                >
                                    {fmtCurrency(overallProfit)} total profit
                                </div>
                            </div>
                            <RiseOutlined
                                style={{
                                    color: 'var(--warning)',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <SafetyCertificateOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Booking Status Breakdown
                                </span>
                            </Space>
                        }
                        extra={
                            <Tag color="blue">{data.bookings.total} total</Tag>
                        }
                        style={{ height: '100%' }}
                    >
                        {bookingStatusData.length ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie
                                        data={bookingStatusData}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={50}
                                        outerRadius={85}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {bookingStatusData.map((d, i) => (
                                            <Cell
                                                key={i}
                                                fill={
                                                    STATUS_COLORS[
                                                        d.name.toLowerCase()
                                                    ] || '#718096'
                                                }
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(v: any) => [
                                            `${v} booking(s)`,
                                            '',
                                        ]}
                                    />
                                    <Legend
                                        formatter={(
                                            value: string,
                                            entry: any,
                                        ) =>
                                            `${value} (${entry.payload?.value ?? 0})`
                                        }
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <Empty description="No booking data yet" />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={14}>
                    <Card
                        title={
                            <Space>
                                <UserAddOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    New Customers — Last 6 Months
                                </span>
                            </Space>
                        }
                        style={{ height: '100%' }}
                    >
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart
                                data={customerGrowthData}
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
                                    dataKey="month"
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 12,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 12,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    formatter={(v: any) => [
                                        `${v} new customer(s)`,
                                        '',
                                    ]}
                                />
                                <Bar
                                    dataKey="new_customers"
                                    name="New Customers"
                                    fill="var(--primary)"
                                    radius={[6, 6, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <CreditCardOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Payment Method Mix
                                </span>
                            </Space>
                        }
                        style={{ height: '100%' }}
                    >
                        {paymentData.length ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie
                                        data={paymentData}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={50}
                                        outerRadius={85}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {paymentData.map((_, i) => (
                                            <Cell
                                                key={i}
                                                fill={
                                                    PAYMENT_COLORS[
                                                        i %
                                                            PAYMENT_COLORS.length
                                                    ]
                                                }
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(v: any) => [
                                            `${v} transaction(s)`,
                                            '',
                                        ]}
                                    />
                                    <Legend
                                        formatter={(
                                            value: string,
                                            entry: any,
                                        ) =>
                                            `${value} (${entry.payload?.value ?? 0})`
                                        }
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <Empty description="No payment data yet" />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={14}>
                    <Card
                        title={
                            <Space>
                                <ClockCircleOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Peak Activity Hours
                                </span>
                            </Space>
                        }
                        style={{ height: '100%' }}
                    >
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart
                                data={peakHourData}
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
                                    dataKey="label"
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 10,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={1}
                                />
                                <YAxis
                                    tick={{
                                        fill: 'var(--text-secondary)',
                                        fontSize: 12,
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip />
                                <Legend />
                                <Bar
                                    dataKey="checkins"
                                    name="Check-ins"
                                    fill="#0DCAF0"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Fuel profitability table */}
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
                            Fuel Profitability by Product
                        </span>
                    </Space>
                }
            >
                <Table
                    dataSource={profitRows}
                    columns={profitColumns}
                    rowKey="type"
                    pagination={false}
                    locale={{ emptyText: 'No fuel inventory data yet' }}
                    summary={() => (
                        <Table.Summary fixed>
                            <Table.Summary.Row
                                style={{
                                    backgroundColor: 'var(--bg-surface-hover)',
                                    fontWeight: 700,
                                }}
                            >
                                <Table.Summary.Cell index={0}>
                                    <span
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        TOTAL
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={1} align="right">
                                    <span
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {fmtCurrency(overallCost)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={2} align="right">
                                    <span
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {fmtCurrency(overallSelling)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right">
                                    <span style={{ color: 'var(--success)' }}>
                                        {fmtCurrency(overallProfit)}
                                    </span>
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="center">
                                    <Tag color="green">
                                        {fmtPct(overallMargin)}
                                    </Tag>
                                </Table.Summary.Cell>
                            </Table.Summary.Row>
                        </Table.Summary>
                    )}
                />
            </Card>
        </div>
    );
};

export default SystemAnalytics;

// ─── Pure helpers ───────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(n || 0);
}

function fmtPct(n: number): string {
    return `${(n || 0).toFixed(1)}%`;
}
