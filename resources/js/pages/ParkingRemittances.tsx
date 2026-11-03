// resources/js/pages/ParkingRemittances.tsx
import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Card, Tag, Space, DatePicker,
    message, Spin,
} from 'antd';
import {
    EyeOutlined, ReloadOutlined, CarOutlined, DollarOutlined,
    CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../services/api';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Staff {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    employee_id?: string;
}

interface ParkingRemittance {
    id: number;
    staff_id: number;
    staff: Staff;
    remittance_date: string;
    remitted_amount: number;
    actual_sales_amount: number;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_at: string | null;
    created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n ?? 0);

const fmtDate = (d: string | null) =>
    d ? dayjs(d).format('MMM DD, YYYY') : '—';

const fmtDateTime = (d: string | null) =>
    d ? dayjs(d).format('MMM DD, YYYY h:mm A') : '—';

// ─── Component ────────────────────────────────────────────────────────────────

const ParkingRemittances: React.FC = () => {
    const [remittances, setRemittances] = useState<ParkingRemittance[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters (status filter removed — everything is auto-approved)
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Detail modal
    const [detailModal, setDetailModal] = useState<ParkingRemittance | null>(null);

    // ── Summary counts ────────────────────────────────────────────────────────
    const approvedCount = remittances.length;

    const totalRemitted = remittances.reduce(
        (s, r) => s + Number(r.remitted_amount),
        0,
    );

    const todayTotal = remittances
        .filter((r) =>
            dayjs(r.remittance_date).isSame(dayjs(), 'day'),
        )
        .reduce((s, r) => s + Number(r.remitted_amount), 0);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchRemittances = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const res = await api.get(`/admin/parking-remittances?${params.toString()}`);
            setRemittances(Array.isArray(res.data) ? res.data : []);
        } catch {
            message.error('Failed to load parking remittances.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRemittances();
    }, [dateFrom, dateTo]);

    // ── Variance helper ───────────────────────────────────────────────────────
    const getVariance = (r: ParkingRemittance) => {
        const diff = Number(r.actual_sales_amount) - Number(r.remitted_amount);
        const isMatch = Math.abs(diff) < 0.01;
        if (isMatch) return <Tag color="success">Exact Match ✓</Tag>;
        if (diff > 0) return <Tag color="error">Short ₱{diff.toFixed(2)}</Tag>;
        return <Tag color="warning">Over ₱{Math.abs(diff).toFixed(2)}</Tag>;
    };

    // ── Table columns (read-only) ─────────────────────────────────────────────
    const columns: ColumnsType<ParkingRemittance> = [
        {
            title: 'Staff',
            key: 'staff',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {r.staff?.first_name} {r.staff?.last_name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.staff?.email}
                    </span>
                </Space>
            ),
        },
        {
            title: 'Date',
            dataIndex: 'remittance_date',
            key: 'date',
            render: (d: string) => fmtDate(d),
        },
        {
            title: 'Remitted Amount',
            dataIndex: 'remitted_amount',
            key: 'remitted',
            align: 'right',
            render: (n: number) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {fmtCurrency(n)}
                </span>
            ),
        },
        {
            title: 'Actual Collections',
            dataIndex: 'actual_sales_amount',
            key: 'actual',
            align: 'right',
            render: (n: number) => fmtCurrency(n),
        },
        {
            title: 'Variance',
            key: 'variance',
            align: 'center',
            render: (_, r) => getVariance(r),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            align: 'center',
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
            render: (d: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {fmtDateTime(d)}
                </span>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            width: 100,
            align: 'center',
            render: (_, r) => (
                <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => setDetailModal(r)}
                    style={{ borderRadius: 6 }}
                >
                    View
                </Button>
            ),
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading && remittances.length === 0) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading parking remittances..." />
            </div>
        );
    }

    const statBodyStyle: React.CSSProperties = {
        height: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
    };

    return (
        <div>
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <CarOutlined
                            style={{ color: 'var(--primary)', marginRight: 10 }}
                        />
                        Parking Remittances
                    </h1>
                    <p className="page-description">
                        All staff parking remittances are automatically accepted.
                    </p>
                </div>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={fetchRemittances}
                    loading={loading}
                    style={{ borderRadius: 6 }}
                >
                    Refresh
                </Button>
            </div>

            {/* Summary stat cards */}
            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    marginBottom: 20,
                    flexWrap: 'wrap',
                }}
            >
                <Card
                    className="stat-card stat-card-primary"
                    styles={{ body: statBodyStyle }}
                    style={{ flex: 1, minWidth: 160 }}
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
                                Total Records
                            </div>
                            <div
                                style={{
                                    fontSize: 28,
                                    fontWeight: 700,
                                    color: 'var(--primary)',
                                }}
                            >
                                {approvedCount}
                            </div>
                        </div>
                        <CheckCircleOutlined
                            style={{ color: 'var(--primary)', fontSize: 22, opacity: 0.8 }}
                        />
                    </div>
                </Card>

                <Card
                    className="stat-card stat-card-success"
                    styles={{ body: statBodyStyle }}
                    style={{ flex: 1, minWidth: 160 }}
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
                                Today's Total
                            </div>
                            <div
                                style={{
                                    fontSize: 20,
                                    fontWeight: 700,
                                    color: 'var(--success)',
                                }}
                            >
                                {fmtCurrency(todayTotal)}
                            </div>
                        </div>
                        <ClockCircleOutlined
                            style={{ color: 'var(--success)', fontSize: 22, opacity: 0.8 }}
                        />
                    </div>
                </Card>

                <Card
                    className="stat-card stat-card-warning"
                    styles={{ body: statBodyStyle }}
                    style={{ flex: 1.4, minWidth: 200 }}
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
                                Total Remitted (All Time)
                            </div>
                            <div
                                style={{
                                    fontSize: 20,
                                    fontWeight: 700,
                                    color: 'var(--warning)',
                                }}
                            >
                                {fmtCurrency(totalRemitted)}
                            </div>
                        </div>
                        <DollarOutlined
                            style={{ color: 'var(--warning)', fontSize: 22, opacity: 0.8 }}
                        />
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card
                style={{ marginBottom: 16, borderRadius: 12 }}
                styles={{ body: { padding: '12px 16px' } }}
            >
                <Space wrap>
                    <DatePicker
                        placeholder="Date From"
                        style={{ width: 150 }}
                        onChange={(d) => setDateFrom(d ? d.format('YYYY-MM-DD') : '')}
                    />

                    <DatePicker
                        placeholder="Date To"
                        style={{ width: 150 }}
                        onChange={(d) => setDateTo(d ? d.format('YYYY-MM-DD') : '')}
                    />

                    <Button
                        onClick={() => {
                            setDateFrom('');
                            setDateTo('');
                        }}
                        size="small"
                    >
                        Clear Filters
                    </Button>
                </Space>
            </Card>

            {/* Table */}
            <Card style={{ borderRadius: 12 }}>
                <Table
                    columns={columns}
                    dataSource={remittances}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        pageSize: 15,
                        size: 'small',
                        showTotal: (total) => `${total} records`,
                    }}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No parking remittances found.' }}
                />
            </Card>

            {/* ── Detail Modal (read-only) ─────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <CarOutlined style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 600 }}>
                            Parking Remittance Details
                        </span>
                    </Space>
                }
                open={!!detailModal}
                onCancel={() => setDetailModal(null)}
                footer={
                    <Button onClick={() => setDetailModal(null)}>Close</Button>
                }
                width={520}
                destroyOnClose
            >
                {detailModal && (
                    <>
                        {/* Staff & Info */}
                        <div
                            style={{
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 10,
                                padding: 16,
                                marginBottom: 16,
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 12,
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Staff
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {detailModal.staff?.first_name}{' '}
                                        {detailModal.staff?.last_name}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {detailModal.staff?.email}
                                    </div>
                                    {detailModal.staff?.employee_id && (
                                        <div
                                            style={{
                                                fontSize: 11,
                                                color: 'var(--text-tertiary)',
                                            }}
                                        >
                                            ID: {detailModal.staff.employee_id}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 12,
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Remittance Date
                                </span>
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {fmtDate(detailModal.remittance_date)}
                                </span>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Status
                                </span>
                                <Tag
                                    icon={<CheckCircleOutlined />}
                                    color="success"
                                    style={{ margin: 0 }}
                                >
                                    AUTO-APPROVED
                                </Tag>
                            </div>
                        </div>

                        {/* Amount Breakdown */}
                        <div
                            style={{
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 10,
                                padding: 16,
                                marginBottom: 16,
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    marginBottom: 12,
                                }}
                            >
                                Amount Breakdown
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 8,
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Actual Collections (System)
                                </span>
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {fmtCurrency(detailModal.actual_sales_amount)}
                                </span>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 12,
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Remitted by Staff
                                </span>
                                <span
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 16,
                                        color: 'var(--success)',
                                    }}
                                >
                                    {fmtCurrency(detailModal.remitted_amount)}
                                </span>
                            </div>

                            <div
                                style={{
                                    height: 1,
                                    background: 'var(--border-color)',
                                    marginBottom: 12,
                                }}
                            />

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Variance
                                </span>
                                {getVariance(detailModal)}
                            </div>
                        </div>

                        {/* Timeline */}
                        <div
                            style={{
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 10,
                                padding: 16,
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: 8,
                                }}
                            >
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Submitted At
                                </span>
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {fmtDateTime(detailModal.created_at)}
                                </span>
                            </div>
                            {detailModal.reviewed_at && (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 13,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Accepted At
                                    </span>
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {fmtDateTime(detailModal.reviewed_at)}
                                    </span>
                                </div>
                            )}
                        </div>

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
                    </>
                )}
            </Modal>
        </div>
    );
};

export default ParkingRemittances;