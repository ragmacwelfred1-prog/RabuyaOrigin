
import React, { useState, useEffect, useCallback } from 'react';
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
    Select,
    InputNumber,
    Tabs,
    Tooltip,
    Spin,
    DatePicker,
    Timeline,
    Statistic,
    Progress,
    Badge,
    Divider,
    Empty,
    Alert,
} from 'antd';
import {
    PlusOutlined,
    InboxOutlined,
    ShopOutlined,
    TruckOutlined,
    ReloadOutlined,
    HistoryOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileTextOutlined,
    UserOutlined,
    DollarOutlined,
    FireOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    WarningOutlined,
    EyeOutlined,
    ExportOutlined,
    DashboardOutlined,
    PercentageOutlined,
    StockOutlined,
    CalculatorOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

const { Option } = Select;

// ─── INTERFACES ─────────────────────────────────────────────────────────────

interface Supplier {
    id: number;
    supplier_name: string;
}
interface FuelProduct {
    id: number;
    type: string;
    current_selling_price?: number;
}
interface FuelInventory {
    id: number;
    fuel_product_id: number;
    supplier_id: number;
    delivery_date: string;
    liters_delivered: number;
    remaining_liters: number;
    cost_price_per_liter: number;
    selling_price_per_liter: number;
    reference_no?: string;
    total_cost?: number;
    total_selling?: number;
    profit?: number;
    profit_margin?: number;
    sold_liters?: number;
    remaining_cost_value?: number;
    remaining_sell_value?: number;
    fuel_product?: FuelProduct;
    supplier?: Supplier;
}
interface InventoryLog {
    id: number;
    fuel_inventory_id: number;
    reference_id: number;
    movement: 'in' | 'out';
    liters: number;
    liters_before: number;
    liters_after: number;
    price_per_liter: number;
    created_at: string;
    customer_name?: string;
    fuel_inventory?: FuelInventory;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const formatNumber = (num: number): string => {
    if (isNaN(num) || num === null || num === undefined) return '0';
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

const getStatusColor = (stock: number, threshold: number = 500): string => {
    if (stock <= 0) return 'error';
    if (stock < threshold) return 'warning';
    return 'success';
};

const getStatusLabel = (stock: number, threshold: number = 500): string => {
    if (stock <= 0) return 'Out of Stock';
    if (stock < threshold) return 'Low Stock';
    return 'In Stock';
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

const InventoryManagement: React.FC = () => {
    const [products, setProducts] = useState<FuelProduct[]>([]);
    const [inventory, setInventory] = useState<FuelInventory[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [receivingModalVisible, setReceivingModalVisible] = useState(false);
    const [logModalVisible, setLogModalVisible] = useState(false);
    const [selectedProductForLogs, setSelectedProductForLogs] = useState<
        number | null
    >(null);
    const [receivingForm] = Form.useForm();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [expectedProfit, setExpectedProfit] = useState<any>(null);
    const [calculatingProfit, setCalculatingProfit] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [prodRes, invRes, supRes, logRes] = await Promise.all([
                api.get('/fuel-products'),
                api.get('/fuel/inventory'),
                api.get('/suppliers'),
                api.get('/inventory-logs'),
            ]);
            setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
            setInventory(Array.isArray(invRes.data) ? invRes.data : []);
            setSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
            const logsData = Array.isArray(logRes.data)
                ? logRes.data
                : Array.isArray(logRes.data?.logs)
                  ? logRes.data.logs
                  : Array.isArray(logRes.data?.data)
                    ? logRes.data.data
                    : [];
            setInventoryLogs(logsData);
        } catch (error) {
            console.error('Error:', error);
            setInventoryLogs([]);
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // ─── COMPUTED VALUES ─────────────────────────────────────────────────────

    const totalDelivered = inventory.reduce(
        (s, i) => s + Number(i.liters_delivered || 0),
        0,
    );
    const totalRemaining = inventory.reduce(
        (s, i) => s + Number(i.remaining_liters || 0),
        0,
    );
    const totalSold = totalDelivered - totalRemaining;
    const sellThroughRate =
        totalDelivered > 0 ? (totalSold / totalDelivered) * 100 : 0;

    const totalCostValue = inventory.reduce(
        (s, i) =>
            s +
            Number(i.remaining_liters || 0) *
                Number(i.cost_price_per_liter || 0),
        0,
    );
    const totalSellValue = inventory.reduce(
        (s, i) =>
            s +
            Number(i.remaining_liters || 0) *
                Number(i.selling_price_per_liter || 0),
        0,
    );
    const potentialProfit = totalSellValue - totalCostValue;

    const totalSoldCost = inventory.reduce((s, i) => {
        const sold =
            Number(i.liters_delivered || 0) - Number(i.remaining_liters || 0);
        return s + sold * Number(i.cost_price_per_liter || 0);
    }, 0);
    const totalSoldRevenue = inventory.reduce((s, i) => {
        const sold =
            Number(i.liters_delivered || 0) - Number(i.remaining_liters || 0);
        return s + sold * Number(i.selling_price_per_liter || 0);
    }, 0);
    const totalProfit = totalSoldRevenue - totalSoldCost;
    const profitMargin =
        totalSoldCost > 0 ? (totalProfit / totalSoldCost) * 100 : 0;

    const lowStockThreshold = 500;
    const lowStockProducts = products.filter((p) => {
        const stock = inventory
            .filter((i) => i.fuel_product_id === p.id)
            .reduce((s, i) => s + Number(i.remaining_liters || 0), 0);
        return stock > 0 && stock < lowStockThreshold;
    });
    const outOfStockProducts = products.filter((p) => {
        const stock = inventory
            .filter((i) => i.fuel_product_id === p.id)
            .reduce((s, i) => s + Number(i.remaining_liters || 0), 0);
        return stock <= 0;
    });

    // ─── HANDLERS ────────────────────────────────────────────────────────────

    const getProductStock = (productId: number) =>
        inventory
            .filter((i) => i.fuel_product_id === productId)
            .reduce((sum, i) => sum + Number(i.remaining_liters || 0), 0);

    const getTotalDelivered = (productId: number) =>
        inventory
            .filter((i) => i.fuel_product_id === productId)
            .reduce((sum, i) => sum + Number(i.liters_delivered || 0), 0);

    const getProductLogs = (productId: number) =>
        inventoryLogs.filter((log) => log.reference_id === productId);

    const getProductType = (productId?: number): string => {
        if (!productId) return 'N/A';
        const found = products.find((p) => p.id === productId);
        return found?.type || 'N/A';
    };

    const handleAddReceiving = async (values: any) => {
        try {
            await api.post('/fuel/inventory/add', {
                fuel_product_id: values.product_id,
                supplier_id: values.supplier_id,
                delivery_date: values.delivery_date.format('YYYY-MM-DD'),
                liters_delivered: values.liters_delivered,
                cost_price_per_liter: values.cost_price_per_liter,
                selling_price_per_liter: values.selling_price_per_liter,
                reference_no: values.reference_no,
            });
            message.success('✅ Stock receiving successful!');
            setReceivingModalVisible(false);
            receivingForm.resetFields();
            setExpectedProfit(null);
            fetchAll();
        } catch (error: any) {
            message.error(
                error.response?.data?.message || 'Failed to add receiving',
            );
        }
    };

    const getLatestSellingPrice = (productId: number): number | null => {
        const productInventory = inventory.filter(
            (i) => i.fuel_product_id === productId,
        );
        if (productInventory.length > 0) {
            const sorted = [...productInventory].sort((a, b) => {
                const dateDiff =
                    new Date(b.delivery_date || '').getTime() -
                    new Date(a.delivery_date || '').getTime();
                return dateDiff !== 0 ? dateDiff : b.id - a.id;
            });
            const latestPrice = Number(sorted[0].selling_price_per_liter || 0);
            if (latestPrice > 0) return latestPrice;
        }
        const product = products.find((p) => p.id === productId);
        return product?.current_selling_price
            ? Number(product.current_selling_price)
            : null;
    };

    const handleProductSelect = (productId: number) => {
        const latestPrice = getLatestSellingPrice(productId);
        if (latestPrice !== null && latestPrice > 0) {
            receivingForm.setFieldValue('selling_price_per_liter', latestPrice);
        }
        // Calculate expected profit
        calculateExpectedProfit();
    };

    const calculateExpectedProfit = async () => {
        const productId = receivingForm.getFieldValue('product_id');
        const liters = receivingForm.getFieldValue('liters_delivered');
        const costPrice = receivingForm.getFieldValue('cost_price_per_liter');
        const sellPrice = receivingForm.getFieldValue(
            'selling_price_per_liter',
        );

        if (!productId || !liters || !costPrice || !sellPrice) {
            setExpectedProfit(null);
            return;
        }

        setCalculatingProfit(true);
        try {
            const response = await api.post(
                '/fuel/inventory/calculate-profit',
                {
                    fuel_product_id: productId,
                    liters: liters,
                    cost_price_per_liter: costPrice,
                    selling_price_per_liter: sellPrice,
                },
            );
            setExpectedProfit(response.data);
        } catch (error) {
            console.error('Profit calculation error:', error);
            // Fallback to client-side calculation
            const totalCost = liters * costPrice;
            const totalSell = liters * sellPrice;
            const profit = totalSell - totalCost;
            const margin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
            setExpectedProfit({
                total_cost: totalCost,
                total_revenue: totalSell,
                expected_profit: profit,
                profit_margin: margin,
                current_stock: getProductStock(productId),
                after_stock: getProductStock(productId) + liters,
            });
        } finally {
            setCalculatingProfit(false);
        }
    };

    const showProductLogs = (productId: number) => {
        setSelectedProductForLogs(productId);
        setLogModalVisible(true);
    };

    // ─── TABLE COLUMNS ──────────────────────────────────────────────────────

    const receivingColumns = [
        {
            title: ' Date',
            dataIndex: 'delivery_date',
            key: 'date',
            width: 110,
            render: (d: string) => (d ? dayjs(d).format('MMM DD, YYYY') : '-'),
        },
        {
            title: ' Product',
            key: 'product',
            width: 150,
            render: (_: any, r: FuelInventory) => {
                const type =
                    r.fuel_product?.type || getProductType(r.fuel_product_id);
                return (
                    <Tag color="blue" style={{ fontSize: 13 }}>
                        {type}
                    </Tag>
                );
            },
        },
        {
            title: ' Supplier',
            key: 'supplier',
            width: 130,
            render: (_: any, r: FuelInventory) => (
                <Tag
                    icon={<TruckOutlined />}
                    color="purple"
                    style={{ fontSize: 12 }}
                >
                    {r.supplier?.supplier_name || 'N/A'}
                </Tag>
            ),
        },
        {
            title: ' Received',
            dataIndex: 'liters_delivered',
            key: 'received',
            width: 100,
            align: 'right' as const,
            render: (l: any) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatNumber(Number(l || 0))} L
                </span>
            ),
        },
        {
            title: ' Sold',
            key: 'sold',
            width: 90,
            align: 'right' as const,
            render: (_: any, r: FuelInventory) => (
                <span style={{ fontWeight: 500, color: 'var(--info)' }}>
                    {formatNumber(Number(r.sold_liters || 0))} L
                </span>
            ),
        },
        {
            title: ' Remaining',
            dataIndex: 'remaining_liters',
            key: 'remaining',
            width: 100,
            align: 'right' as const,
            render: (l: any) => {
                const val = Number(l || 0);
                const color = val > 0 ? 'var(--success)' : 'var(--danger)';
                return (
                    <span style={{ fontWeight: 700, color }}>
                        {formatNumber(val)} L
                    </span>
                );
            },
        },
        {
            title: ' Cost/L',
            dataIndex: 'cost_price_per_liter',
            key: 'cost',
            width: 85,
            align: 'right' as const,
            render: (p: any) => (
                <span style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(Number(p || 0))}
                </span>
            ),
        },
        {
            title: ' Sell/L',
            dataIndex: 'selling_price_per_liter',
            key: 'sell',
            width: 85,
            align: 'right' as const,
            render: (p: any) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(Number(p || 0))}
                </span>
            ),
        },
        {
            title: ' Profit',
            key: 'profit',
            width: 100,
            align: 'right' as const,
            render: (_: any, r: FuelInventory) => {
                const profit = r.profit || 0;
                return (
                    <span
                        style={{
                            fontWeight: 600,
                            color:
                                profit > 0
                                    ? 'var(--success)'
                                    : profit < 0
                                      ? 'var(--danger)'
                                      : 'var(--text-tertiary)',
                        }}
                    >
                        {formatCurrency(profit)}
                    </span>
                );
            },
        },
        {
            title: ' Margin',
            key: 'margin',
            width: 80,
            align: 'center' as const,
            render: (_: any, r: FuelInventory) => {
                const margin = r.profit_margin || 0;
                return (
                    <Tag
                        color={
                            margin >= 20
                                ? 'green'
                                : margin >= 0
                                  ? 'orange'
                                  : 'red'
                        }
                    >
                        {margin}%
                    </Tag>
                );
            },
        },
        {
            title: ' Ref #',
            dataIndex: 'reference_no',
            key: 'ref',
            width: 100,
            render: (t: string) => (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {t || '-'}
                </span>
            ),
        },
    ];

    const logColumns = [
        {
            title: ' Date/Time',
            dataIndex: 'created_at',
            key: 'date',
            width: 160,
            render: (d: string) =>
                d ? dayjs(d).format('MMM DD, YYYY h:mm A') : '-',
        },
        {
            title: ' Movement',
            dataIndex: 'movement',
            key: 'movement',
            width: 110,
            render: (m: string) => (
                <Tag
                    icon={
                        m === 'in' ? <ArrowUpOutlined /> : <ArrowDownOutlined />
                    }
                    color={m === 'in' ? 'green' : 'red'}
                    style={{ fontSize: 12 }}
                >
                    {m === 'in' ? '📥 STOCK IN' : '📤 STOCK OUT'}
                </Tag>
            ),
        },
        {
            title: ' Liters',
            dataIndex: 'liters',
            key: 'liters',
            align: 'right' as const,
            width: 100,
            render: (l: any, record: InventoryLog) => (
                <span
                    style={{
                        fontWeight: 700,
                        color:
                            record.movement === 'in'
                                ? 'var(--success)'
                                : 'var(--danger)',
                        fontSize: 14,
                    }}
                >
                    {record.movement === 'in' ? '+' : '-'}
                    {formatNumber(Number(l || 0))} L
                </span>
            ),
        },
        {
            title: ' Before',
            dataIndex: 'liters_before',
            key: 'before',
            align: 'right' as const,
            width: 90,
            render: (l: any) => (
                <span style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(Number(l || 0))} L
                </span>
            ),
        },
        {
            title: ' After',
            dataIndex: 'liters_after',
            key: 'after',
            align: 'right' as const,
            width: 90,
            render: (l: any) => (
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatNumber(Number(l || 0))} L
                </span>
            ),
        },
        {
            title: ' Price/L',
            dataIndex: 'price_per_liter',
            key: 'price',
            align: 'right' as const,
            width: 100,
            render: (p: any) => (
                <span style={{ fontWeight: 500, color: 'var(--success)' }}>
                    {formatCurrency(Number(p || 0))}
                </span>
            ),
        },
        {
            title: ' Customer',
            key: 'customer',
            width: 140,
            render: (_: any, record: InventoryLog) => {
                if (record.movement === 'out') {
                    return (
                        <span style={{ color: 'var(--text-primary)' }}>
                            <UserOutlined
                                style={{ marginRight: 4, color: 'var(--info)' }}
                            />
                            {record.customer_name || 'Walk-in'}
                        </span>
                    );
                }
                return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
            },
        },
    ];

    // ─── RENDER ──────────────────────────────────────────────────────────────

    if (initialLoading) {
        return (
            <div
                className="page-loading"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '60vh',
                }}
            >
                <Spin size="large" tip="Loading inventory data..." />
            </div>
        );
    }

    // ─── STYLES ──────────────────────────────────────────────────────────────
    const statCardBodyStyle: React.CSSProperties = {
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '16px 20px',
    };

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-card)',
        borderColor: 'var(--border-color)',
        borderRadius: 12,
    };

    const cardBodyStyle: React.CSSProperties = {
        padding: '16px 20px',
    };

    return (
        <div style={{ padding: '0 0 24px 0' }}>
            {/* ─── HEADER ────────────────────────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1
                        className="page-title"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <InboxOutlined style={{ color: 'var(--primary)' }} />
                        Inventory Management
                    </h1>
                    <p
                        className="page-description"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Track fuel stock, receiving, profitability, and expected
                        profit
                    </p>
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchAll}
                        loading={loading}
                        style={{ borderRadius: 8 }}
                    >
                        Refresh
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            receivingForm.resetFields();
                            setExpectedProfit(null);
                            setReceivingModalVisible(true);
                        }}
                        style={{ borderRadius: 8 }}
                    >
                        New Receiving
                    </Button>
                </Space>
            </div>

            {/* ─── ALERTS ────────────────────────────────────────────────────── */}
            {outOfStockProducts.length > 0 && (
                <Alert
                    type="error"
                    showIcon
                    icon={<CloseCircleOutlined />}
                    style={{ marginBottom: 12, borderRadius: 8 }}
                    message={
                        <span>
                            <strong style={{ color: 'var(--danger-text)' }}>
                                🚨 Out of Stock:
                            </strong>
                            <span
                                style={{
                                    marginLeft: 8,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {outOfStockProducts
                                    .map((p) => p.type)
                                    .join(', ')}
                            </span>
                            <span
                                style={{
                                    marginLeft: 12,
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                (Restock immediately!)
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
                                ⚠️ Low Stock Alert:
                            </strong>
                            <span
                                style={{
                                    marginLeft: 8,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {lowStockProducts
                                    .map((p) => {
                                        const stock = getProductStock(p.id);
                                        return `${p.type} (${formatNumber(stock)} L)`;
                                    })
                                    .join(', ')}
                            </span>
                            <span
                                style={{
                                    marginLeft: 12,
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                (Below {lowStockThreshold}L)
                            </span>
                        </span>
                    }
                />
            )}

            {/* ─── DASHBOARD STATS ─────────────────────────────────────────────── */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card style={cardStyle} styles={{ body: statCardBodyStyle }}>
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
                                    Total Stock
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.2,
                                        marginTop: 4,
                                    }}
                                >
                                    {formatNumber(totalRemaining)} L
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                        marginTop: 4,
                                    }}
                                >
                                    {products.length} products
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'var(--success-bg)',
                                    padding: 10,
                                    borderRadius: 10,
                                }}
                            >
                                <StockOutlined
                                    style={{
                                        fontSize: 22,
                                        color: 'var(--success)',
                                    }}
                                />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card style={cardStyle} styles={{ body: statCardBodyStyle }}>
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
                                    Inventory Value
                                </div>
                                <div
                                    style={{
                                        fontSize: 24,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.2,
                                        marginTop: 4,
                                    }}
                                >
                                    {formatCurrency(totalCostValue)}
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                        marginTop: 4,
                                    }}
                                >
                                    At cost price
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'var(--info-bg)',
                                    padding: 10,
                                    borderRadius: 10,
                                }}
                            >
                                <DollarOutlined
                                    style={{
                                        fontSize: 22,
                                        color: 'var(--info)',
                                    }}
                                />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card style={cardStyle} styles={{ body: statCardBodyStyle }}>
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
                                    Potential Revenue
                                </div>
                                <div
                                    style={{
                                        fontSize: 24,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                        lineHeight: 1.2,
                                        marginTop: 4,
                                    }}
                                >
                                    {formatCurrency(totalSellValue)}
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                        marginTop: 4,
                                    }}
                                >
                                    <span
                                        style={{
                                            color:
                                                totalProfit >= 0
                                                    ? 'var(--success)'
                                                    : 'var(--danger)',
                                        }}
                                    >
                                        {formatCurrency(potentialProfit)}{' '}
                                        potential profit
                                    </span>
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'var(--success-bg)',
                                    padding: 10,
                                    borderRadius: 10,
                                }}
                            >
                                <FireOutlined
                                    style={{
                                        fontSize: 22,
                                        color: 'var(--success)',
                                    }}
                                />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card style={cardStyle} styles={{ body: statCardBodyStyle }}>
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
                                    Sell-Through Rate
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.2,
                                        marginTop: 4,
                                    }}
                                >
                                    {sellThroughRate.toFixed(1)}%
                                </div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                        marginTop: 4,
                                    }}
                                >
                                    {formatNumber(totalSold)} L sold of{' '}
                                    {formatNumber(totalDelivered)} L
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'var(--warning-bg)',
                                    padding: 10,
                                    borderRadius: 10,
                                }}
                            >
                                <PercentageOutlined
                                    style={{
                                        fontSize: 22,
                                        color: 'var(--warning)',
                                    }}
                                />
                            </div>
                        </div>
                        <Progress
                            percent={sellThroughRate}
                            showInfo={false}
                            strokeColor={
                                sellThroughRate > 70
                                    ? 'var(--success)'
                                    : sellThroughRate > 40
                                      ? 'var(--info)'
                                      : 'var(--danger)'
                            }
                            style={{ marginTop: 12, marginBottom: 0 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* ─── PROFIT SUMMARY BAR ───────────────────────────────────────────── */}
            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    background: 'var(--bg-surface-hover)',
                    borderColor: 'var(--border-color)',
                }}
                styles={{ body: { padding: '16px 24px' } }}
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
                                }}
                            >
                                 Cost of Sold
                            </div>
                            <div
                                style={{
                                    fontSize: 20,
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                {formatCurrency(totalSoldCost)}
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
                                }}
                            >
                                 Revenue from Sold
                            </div>
                            <div
                                style={{
                                    fontSize: 20,
                                    fontWeight: 600,
                                    color: 'var(--success)',
                                }}
                            >
                                {formatCurrency(totalSoldRevenue)}
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
                                }}
                            >
                                 Total Profit
                            </div>
                            <div>
                                <span
                                    style={{
                                        fontSize: 22,
                                        fontWeight: 700,
                                        color:
                                            totalProfit >= 0
                                                ? 'var(--success)'
                                                : 'var(--danger)',
                                    }}
                                >
                                    {formatCurrency(totalProfit)}
                                </span>
                                <Tag
                                    color={
                                        profitMargin >= 20
                                            ? 'green'
                                            : profitMargin >= 0
                                              ? 'orange'
                                              : 'red'
                                    }
                                    style={{ marginLeft: 10, fontSize: 12 }}
                                >
                                    {profitMargin.toFixed(1)}% margin
                                </Tag>
                            </div>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* ─── TABS ────────────────────────────────────────────────────────── */}
            <Card
                style={{
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                }}
                styles={{ body: { padding: '16px' } }}
            >
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'dashboard',
                            label: (
                                <span
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <DashboardOutlined /> Dashboard
                                </span>
                            ),
                            children: (
                                <div>
                                    <Table
                                        dataSource={products}
                                        columns={[
                                            {
                                                title: ' Product',
                                                key: 'product',
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => (
                                                    <Space>
                                                        <ShopOutlined
                                                            style={{
                                                                color: 'var(--success)',
                                                            }}
                                                        />
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color: 'var(--text-primary)',
                                                            }}
                                                        >
                                                            {r.type}
                                                        </span>
                                                    </Space>
                                                ),
                                            },
                                            {
                                                title: ' Stock',
                                                key: 'stock',
                                                align: 'right' as const,
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => {
                                                    const stock =
                                                        getProductStock(r.id);
                                                    const status =
                                                        getStatusColor(stock);
                                                    return (
                                                        <div
                                                            style={{
                                                                textAlign:
                                                                    'right',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontSize: 20,
                                                                    fontWeight: 700,
                                                                    color:
                                                                        status ===
                                                                        'success'
                                                                            ? 'var(--success)'
                                                                            : status ===
                                                                                'warning'
                                                                              ? 'var(--warning)'
                                                                              : 'var(--danger)',
                                                                }}
                                                            >
                                                                {formatNumber(
                                                                    stock,
                                                                )}{' '}
                                                                L
                                                            </span>
                                                            <br />
                                                            <Tag
                                                                color={status}
                                                                style={{
                                                                    marginTop: 2,
                                                                }}
                                                            >
                                                                {getStatusLabel(
                                                                    stock,
                                                                )}
                                                            </Tag>
                                                        </div>
                                                    );
                                                },
                                            },
                                            {
                                                title: ' Price/L',
                                                key: 'price',
                                                align: 'right' as const,
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => {
                                                    const latest =
                                                        inventory.filter(
                                                            (i) =>
                                                                i.fuel_product_id ===
                                                                    r.id &&
                                                                Number(
                                                                    i.remaining_liters,
                                                                ) > 0,
                                                        );
                                                    const price =
                                                        latest.length > 0
                                                            ? Number(
                                                                  latest[0]
                                                                      .selling_price_per_liter,
                                                              )
                                                            : Number(
                                                                  r.current_selling_price ||
                                                                      0,
                                                              );
                                                    return (
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color: 'var(--success)',
                                                            }}
                                                        >
                                                            {formatCurrency(
                                                                price,
                                                            )}
                                                        </span>
                                                    );
                                                },
                                            },
                                            {
                                                title: ' Sold',
                                                key: 'sold',
                                                align: 'right' as const,
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => {
                                                    const sold = inventory
                                                        .filter(
                                                            (i) =>
                                                                i.fuel_product_id ===
                                                                r.id,
                                                        )
                                                        .reduce(
                                                            (s, i) =>
                                                                s +
                                                                Number(
                                                                    i.sold_liters ||
                                                                        0,
                                                                ),
                                                            0,
                                                        );
                                                    return (
                                                        <span
                                                            style={{
                                                                color: 'var(--info)',
                                                            }}
                                                        >
                                                            {formatNumber(sold)}{' '}
                                                            L
                                                        </span>
                                                    );
                                                },
                                            },
                                            {
                                                title: ' Revenue',
                                                key: 'revenue',
                                                align: 'right' as const,
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => {
                                                    const rev = inventory
                                                        .filter(
                                                            (i) =>
                                                                i.fuel_product_id ===
                                                                r.id,
                                                        )
                                                        .reduce((s, i) => {
                                                            const sold = Number(
                                                                i.sold_liters ||
                                                                    0,
                                                            );
                                                            return (
                                                                s +
                                                                sold *
                                                                    Number(
                                                                        i.selling_price_per_liter ||
                                                                            0,
                                                                    )
                                                            );
                                                        }, 0);
                                                    return (
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color: 'var(--success)',
                                                            }}
                                                        >
                                                            {formatCurrency(
                                                                rev,
                                                            )}
                                                        </span>
                                                    );
                                                },
                                            },
                                            {
                                                title: ' Profit',
                                                key: 'profit',
                                                align: 'right' as const,
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => {
                                                    const profit = inventory
                                                        .filter(
                                                            (i) =>
                                                                i.fuel_product_id ===
                                                                r.id,
                                                        )
                                                        .reduce(
                                                            (s, i) =>
                                                                s +
                                                                Number(
                                                                    i.profit ||
                                                                        0,
                                                                ),
                                                            0,
                                                        );
                                                    return (
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color:
                                                                    profit >= 0
                                                                        ? 'var(--success)'
                                                                        : 'var(--danger)',
                                                            }}
                                                        >
                                                            {formatCurrency(
                                                                profit,
                                                            )}
                                                        </span>
                                                    );
                                                },
                                            },
                                            {
                                                title: ' Actions',
                                                key: 'actions',
                                                render: (
                                                    _: any,
                                                    r: FuelProduct,
                                                ) => (
                                                    <Space>
                                                        <Button
                                                            type="primary"
                                                            size="small"
                                                            icon={
                                                                <PlusOutlined />
                                                            }
                                                            onClick={() => {
                                                                const latestPrice =
                                                                    getLatestSellingPrice(
                                                                        r.id,
                                                                    );
                                                                receivingForm.setFieldsValue(
                                                                    {
                                                                        product_id:
                                                                            r.id,
                                                                        ...(latestPrice
                                                                            ? {
                                                                                  selling_price_per_liter:
                                                                                      latestPrice,
                                                                              }
                                                                            : {}),
                                                                    },
                                                                );
                                                                setExpectedProfit(
                                                                    null,
                                                                );
                                                                setReceivingModalVisible(
                                                                    true,
                                                                );
                                                            }}
                                                            style={{
                                                                borderRadius: 6,
                                                            }}
                                                        >
                                                            Receive Stock
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            icon={
                                                                <HistoryOutlined />
                                                            }
                                                            onClick={() =>
                                                                showProductLogs(
                                                                    r.id,
                                                                )
                                                            }
                                                            style={{
                                                                borderRadius: 6,
                                                            }}
                                                        >
                                                            Logs
                                                        </Button>
                                                    </Space>
                                                ),
                                            },
                                        ]}
                                        rowKey="id"
                                        pagination={false}
                                        locale={{
                                            emptyText: 'No products found',
                                        }}
                                        style={{ background: 'var(--bg-card)' }}
                                    />
                                </div>
                            ),
                        },
                        {
                            key: 'receiving',
                            label: (
                                <span
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <TruckOutlined /> Receiving History (
                                    {inventory.length})
                                </span>
                            ),
                            children: (
                                <Table
                                    dataSource={inventory}
                                    columns={receivingColumns}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                    scroll={{ x: 1200 }}
                                    size="middle"
                                    locale={{
                                        emptyText: 'No receiving records yet',
                                    }}
                                    style={{ background: 'var(--bg-card)' }}
                                />
                            ),
                        },
                        {
                            key: 'logs',
                            label: (
                                <span
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <HistoryOutlined /> Activity Logs (
                                    {inventoryLogs.length})
                                </span>
                            ),
                            children: (
                                <div>
                                    <div
                                        style={{
                                            marginBottom: 12,
                                            display: 'flex',
                                            gap: 12,
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <Tag
                                            icon={<ArrowUpOutlined />}
                                            color="green"
                                            style={{
                                                fontSize: 13,
                                                padding: '4px 12px',
                                            }}
                                        >
                                             Stock In:{' '}
                                            {formatNumber(
                                                inventoryLogs
                                                    .filter(
                                                        (l) =>
                                                            l.movement === 'in',
                                                    )
                                                    .reduce(
                                                        (s, l) =>
                                                            s +
                                                            Number(l.liters),
                                                        0,
                                                    ),
                                            )}{' '}
                                            L
                                        </Tag>
                                        <Tag
                                            icon={<ArrowDownOutlined />}
                                            color="red"
                                            style={{
                                                fontSize: 13,
                                                padding: '4px 12px',
                                            }}
                                        >
                                             Stock Out:{' '}
                                            {formatNumber(
                                                inventoryLogs
                                                    .filter(
                                                        (l) =>
                                                            l.movement ===
                                                            'out',
                                                    )
                                                    .reduce(
                                                        (s, l) =>
                                                            s +
                                                            Number(l.liters),
                                                        0,
                                                    ),
                                            )}{' '}
                                            L
                                        </Tag>
                                    </div>
                                    <Table
                                        dataSource={inventoryLogs}
                                        columns={logColumns}
                                        rowKey="id"
                                        loading={loading}
                                        pagination={{ pageSize: 15 }}
                                        scroll={{ x: 900 }}
                                        size="middle"
                                        locale={{
                                            emptyText: 'No activity logs yet',
                                        }}
                                        style={{ background: 'var(--bg-card)' }}
                                    />
                                </div>
                            ),
                        },
                    ]}
                />
            </Card>

            {/* ─── NEW RECEIVING MODAL ────────────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <TruckOutlined
                            style={{ color: 'var(--success)', fontSize: 18 }}
                        />
                        <span
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                             Stock Receiving
                        </span>
                    </Space>
                }
                open={receivingModalVisible}
                onCancel={() => {
                    setReceivingModalVisible(false);
                    receivingForm.resetFields();
                    setExpectedProfit(null);
                }}
                footer={null}
                width={650}
                destroyOnClose
            >
                <Form
                    form={receivingForm}
                    layout="vertical"
                    onFinish={handleAddReceiving}
                    initialValues={{ delivery_date: dayjs() }}
                    onValuesChange={(changedValues) => {
                        if (
                            changedValues.product_id ||
                            changedValues.liters_delivered ||
                            changedValues.cost_price_per_liter ||
                            changedValues.selling_price_per_liter
                        ) {
                            calculateExpectedProfit();
                        }
                    }}
                >
                    <Form.Item
                        name="product_id"
                        label=" Select Product"
                        rules={[{ required: true }]}
                    >
                        <Select
                            placeholder="Choose a fuel product"
                            size="large"
                            showSearch
                            optionFilterProp="children"
                            onSelect={handleProductSelect}
                            style={{ borderRadius: 8 }}
                        >
                            {products.map((p) => (
                                <Option
                                    key={p.id}
                                    value={p.id}
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {p.type}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="supplier_id"
                        label=" Supplier"
                        rules={[{ required: true }]}
                    >
                        <Select
                            placeholder="Choose supplier"
                            size="large"
                            showSearch
                            optionFilterProp="children"
                            style={{ borderRadius: 8 }}
                        >
                            {suppliers.map((s) => (
                                <Option
                                    key={s.id}
                                    value={s.id}
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {s.supplier_name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="delivery_date"
                        label=" Receiving Date"
                        rules={[{ required: true }]}
                    >
                        <DatePicker
                            style={{ width: '100%', borderRadius: 8 }}
                            size="large"
                        />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="liters_delivered"
                                label=" Liters Received"
                                rules={[{ required: true }]}
                            >
                                <InputNumber
                                    style={{ width: '100%', borderRadius: 8 }}
                                    size="large"
                                    min={0.01}
                                    step={100}
                                    placeholder="Quantity"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="reference_no"
                                label=" Reference No."
                            >
                                <Input
                                    placeholder="Invoice/PO #"
                                    size="large"
                                    style={{ borderRadius: 8 }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="cost_price_per_liter"
                                label=" Cost Price/Liter (₱)"
                                rules={[{ required: true }]}
                            >
                                <InputNumber
                                    style={{ width: '100%', borderRadius: 8 }}
                                    size="large"
                                    min={0}
                                    step={0.01}
                                    placeholder="Supplier price"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="selling_price_per_liter"
                                label=" Selling Price/Liter (₱)"
                                rules={[{ required: true }]}
                            >
                                <InputNumber
                                    style={{ width: '100%', borderRadius: 8 }}
                                    size="large"
                                    min={0}
                                    step={0.01}
                                    placeholder="Customer price"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* ─── EXPECTED PROFIT CALCULATOR ────────────────────────── */}
                    {expectedProfit && (
                        <Card
                            size="small"
                            style={{
                                marginBottom: 16,
                                background:
                                    expectedProfit.expected_profit > 0
                                        ? 'var(--success-bg)'
                                        : 'var(--danger-bg)',
                                borderColor:
                                    expectedProfit.expected_profit > 0
                                        ? 'var(--success-border)'
                                        : 'var(--danger-border)',
                                borderRadius: 8,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <CalculatorOutlined
                                        style={{ marginRight: 6 }}
                                    />{' '}
                                    Expected Profit Summary
                                </span>
                                <Tag
                                    color={
                                        expectedProfit.expected_profit > 0
                                            ? 'green'
                                            : 'red'
                                    }
                                >
                                    {expectedProfit.expected_profit > 0
                                        ? '✅ Profitable'
                                        : '⚠️ Check Pricing'}
                                </Tag>
                            </div>
                            <Row gutter={12}>
                                <Col span={6}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        Current Stock
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {formatNumber(
                                            expectedProfit.current_stock || 0,
                                        )}{' '}
                                        L
                                    </div>
                                </Col>
                                <Col span={6}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        After Receiving
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: 'var(--success)',
                                        }}
                                    >
                                        {formatNumber(
                                            expectedProfit.after_stock || 0,
                                        )}{' '}
                                        L
                                    </div>
                                </Col>
                                <Col span={6}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        Total Cost
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: 'var(--danger)',
                                        }}
                                    >
                                        {formatCurrency(
                                            expectedProfit.total_cost || 0,
                                        )}
                                    </div>
                                </Col>
                                <Col span={6}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        Total Value
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: 'var(--success)',
                                        }}
                                    >
                                        {formatCurrency(
                                            expectedProfit.total_revenue || 0,
                                        )}
                                    </div>
                                </Col>
                            </Row>
                            <Divider
                                style={{
                                    margin: '8px 0',
                                    borderColor: 'var(--border-color)',
                                }}
                            />
                            <Row gutter={12}>
                                <Col span={12}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        Expected Profit
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 700,
                                            color:
                                                expectedProfit.expected_profit >
                                                0
                                                    ? 'var(--success)'
                                                    : 'var(--danger)',
                                        }}
                                    >
                                        {formatCurrency(
                                            expectedProfit.expected_profit || 0,
                                        )}
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        Profit Margin
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 16,
                                            fontWeight: 700,
                                        }}
                                    >
                                        <Tag
                                            color={
                                                expectedProfit.profit_margin >=
                                                20
                                                    ? 'green'
                                                    : expectedProfit.profit_margin >=
                                                        0
                                                      ? 'orange'
                                                      : 'red'
                                            }
                                            style={{
                                                fontSize: 14,
                                                padding: '2px 12px',
                                            }}
                                        >
                                            {expectedProfit.profit_margin?.toFixed(
                                                1,
                                            ) || 0}
                                            %
                                        </Tag>
                                    </div>
                                </Col>
                            </Row>
                            {calculatingProfit && (
                                <div
                                    style={{
                                        textAlign: 'center',
                                        marginTop: 8,
                                    }}
                                >
                                    <Spin size="small" />
                                </div>
                            )}
                        </Card>
                    )}

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <Button
                            onClick={() => {
                                setReceivingModalVisible(false);
                                receivingForm.resetFields();
                                setExpectedProfit(null);
                            }}
                            size="large"
                            style={{ borderRadius: 8 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            icon={<CheckCircleOutlined />}
                            style={{ borderRadius: 8 }}
                        >
                            Confirm Receiving
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* ─── PRODUCT MOVEMENT LOGS MODAL ────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <HistoryOutlined style={{ color: 'var(--info)' }} />
                        <span
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            📊 Movement History:{' '}
                            {selectedProductForLogs
                                ? getProductType(selectedProductForLogs)
                                : 'Product'}
                        </span>
                    </Space>
                }
                open={logModalVisible}
                onCancel={() => {
                    setLogModalVisible(false);
                    setSelectedProductForLogs(null);
                }}
                footer={null}
                width={950}
                destroyOnClose
            >
                {selectedProductForLogs && (
                    <>
                        <div
                            style={{
                                marginBottom: 16,
                                display: 'flex',
                                gap: 12,
                                flexWrap: 'wrap',
                            }}
                        >
                            <Tag
                                color="blue"
                                style={{ fontSize: 13, padding: '4px 14px' }}
                            >
                                ⛽ {getProductType(selectedProductForLogs)}
                            </Tag>
                            <Tag
                                icon={<ArrowUpOutlined />}
                                color="green"
                                style={{ fontSize: 13, padding: '4px 14px' }}
                            >
                                📥 Total In:{' '}
                                {formatNumber(
                                    getProductLogs(selectedProductForLogs)
                                        .filter((l) => l.movement === 'in')
                                        .reduce(
                                            (s, l) => s + Number(l.liters),
                                            0,
                                        ),
                                )}{' '}
                                L
                            </Tag>
                            <Tag
                                icon={<ArrowDownOutlined />}
                                color="red"
                                style={{ fontSize: 13, padding: '4px 14px' }}
                            >
                                📤 Total Out:{' '}
                                {formatNumber(
                                    getProductLogs(selectedProductForLogs)
                                        .filter((l) => l.movement === 'out')
                                        .reduce(
                                            (s, l) => s + Number(l.liters),
                                            0,
                                        ),
                                )}{' '}
                                L
                            </Tag>
                            <Tag
                                icon={<InboxOutlined />}
                                color="purple"
                                style={{ fontSize: 13, padding: '4px 14px' }}
                            >
                                📦 Current Stock:{' '}
                                {formatNumber(
                                    getProductStock(selectedProductForLogs),
                                )}{' '}
                                L
                            </Tag>
                        </div>

                        {getProductLogs(selectedProductForLogs).length > 0 ? (
                            <>
                                <Table
                                    dataSource={getProductLogs(
                                        selectedProductForLogs,
                                    )}
                                    columns={logColumns}
                                    rowKey="id"
                                    pagination={{ pageSize: 10 }}
                                    size="small"
                                    scroll={{ x: 800 }}
                                    style={{ background: 'var(--bg-card)' }}
                                />
                                <div style={{ marginTop: 24 }}>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            marginBottom: 16,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <HistoryOutlined
                                            style={{ marginRight: 8 }}
                                        />
                                        Recent Activity Timeline
                                    </div>
                                    <Timeline>
                                        {getProductLogs(selectedProductForLogs)
                                            .slice(0, 10)
                                            .map((log) => (
                                                <Timeline.Item
                                                    key={log.id}
                                                    color={
                                                        log.movement === 'in'
                                                            ? 'green'
                                                            : 'red'
                                                    }
                                                    dot={
                                                        log.movement ===
                                                        'in' ? (
                                                            <ArrowUpOutlined />
                                                        ) : (
                                                            <ArrowDownOutlined />
                                                        )
                                                    }
                                                >
                                                    <div>
                                                        <div
                                                            style={{
                                                                fontWeight: 500,
                                                                color: 'var(--text-primary)',
                                                            }}
                                                        >
                                                            {log.movement ===
                                                            'in'
                                                                ? '📥 Stock In'
                                                                : '📤 Stock Out'}
                                                            :{' '}
                                                            <span
                                                                style={{
                                                                    color:
                                                                        log.movement ===
                                                                        'in'
                                                                            ? 'var(--success)'
                                                                            : 'var(--danger)',
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {log.movement ===
                                                                'in'
                                                                    ? '+'
                                                                    : '-'}
                                                                {formatNumber(
                                                                    Number(
                                                                        log.liters,
                                                                    ),
                                                                )}{' '}
                                                                L
                                                            </span>
                                                            {log.movement ===
                                                                'out' && (
                                                                <span
                                                                    style={{
                                                                        fontSize: 12,
                                                                        color: 'var(--text-tertiary)',
                                                                        marginLeft: 8,
                                                                    }}
                                                                >
                                                                    —{' '}
                                                                    {log.customer_name ||
                                                                        'Walk-in Customer'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: 12,
                                                                color: 'var(--text-secondary)',
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            {dayjs(
                                                                log.created_at,
                                                            ).format(
                                                                'MMM DD, YYYY h:mm A',
                                                            )}{' '}
                                                            • Before:{' '}
                                                            {formatNumber(
                                                                Number(
                                                                    log.liters_before,
                                                                ),
                                                            )}{' '}
                                                            L → After:{' '}
                                                            {formatNumber(
                                                                Number(
                                                                    log.liters_after,
                                                                ),
                                                            )}{' '}
                                                            L • Price:{' '}
                                                            {formatCurrency(
                                                                Number(
                                                                    log.price_per_liter,
                                                                ),
                                                            )}
                                                            /L
                                                        </div>
                                                    </div>
                                                </Timeline.Item>
                                            ))}
                                    </Timeline>
                                </div>
                            </>
                        ) : (
                            <Empty
                                description="No movement logs for this product yet"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
};

export default InventoryManagement;
