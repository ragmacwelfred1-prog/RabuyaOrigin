// resources/js/pages/ParkingRemittances.tsx
import React, { useState, useEffect } from 'react';
import { Table, Button, Card, Space, DatePicker, Select, message, Spin, Badge } from 'antd';
import { EyeOutlined, ReloadOutlined, CarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../services/api';
import {
    RemittanceRecord,
    RemittanceDetailModal,
    RemittanceStatusTag,
    VarianceTag,
    fmtPHP,
} from '../components/RemittanceShared';

const ParkingRemittances: React.FC = () => {
    const [rows, setRows] = useState<RemittanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);
    const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
    const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
    const [status, setStatus] = useState<string>('');
    const [selected, setSelected] = useState<RemittanceRecord | null>(null);

    const fetchRows = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/parking-remittances', {
                params: {
                    status: status || undefined,
                    date_from: dateFrom?.format('YYYY-MM-DD'),
                    date_to: dateTo?.format('YYYY-MM-DD'),
                },
            });
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch {
            message.error('Failed to load parking remittances.');
        } finally {
            setLoading(false);
            setInitialLoad(false);
        }
    };

    useEffect(() => {
        fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateFrom, dateTo, status]);

    // auto refresh so new staff submissions show up
    useEffect(() => {
        const id = setInterval(() => {
            if (!document.hidden) fetchRows();
        }, 15000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateFrom, dateTo, status]);

    const pendingCount = rows.filter((r) => r.status === 'pending').length;
    const approvedTotal = rows
        .filter((r) => r.status === 'approved')
        .reduce((s, r) => s + Number(r.remitted_amount), 0);

    const columns: ColumnsType<RemittanceRecord> = [
        {
            title: 'Staff',
            key: 'staff',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <b>
                        {r.staff?.first_name} {r.staff?.last_name}
                    </b>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.staff?.email}
                    </span>
                </Space>
            ),
        },
        {
            title: 'Date',
            dataIndex: 'remittance_date',
            render: (d) => dayjs(d).format('MMM DD, YYYY'),
        },
        {
            title: 'Expected',
            dataIndex: 'actual_sales_amount',
            align: 'right',
            render: (n) => fmtPHP(n),
        },
        {
            title: 'Remitted',
            dataIndex: 'remitted_amount',
            align: 'right',
            render: (n) => <b style={{ color: 'var(--success)' }}>{fmtPHP(n)}</b>,
        },
        {
            title: 'Difference',
            dataIndex: 'difference',
            align: 'center',
            render: (d) => <VarianceTag difference={d} />,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            align: 'center',
            render: (s) => <RemittanceStatusTag status={s} />,
        },
        {
            title: 'Submitted',
            dataIndex: 'created_at',
            render: (d) => (
                <span style={{ fontSize: 12 }}>{dayjs(d).format('MMM DD, YYYY h:mm A')}</span>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            align: 'center',
            width: 110,
            render: (_, r) => (
                <Button
                    size="small"
                    type={r.status === 'pending' ? 'primary' : 'default'}
                    icon={<EyeOutlined />}
                    onClick={() => setSelected(r)}
                >
                    {r.status === 'pending' ? 'Review' : 'View'}
                </Button>
            ),
        },
    ];

    if (initialLoad) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading parking remittances..." />
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <CarOutlined style={{ color: 'var(--primary)', marginRight: 10 }} />
                        Parking Remittances
                        {pendingCount > 0 && <Badge count={pendingCount} style={{ marginLeft: 10 }} />}
                    </h1>
                    <p className="page-description">
                        Review staff remittances. Only approved remittances reduce the staff's
                        outstanding balance.
                    </p>
                </div>
                <Button icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>
                    Refresh
                </Button>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <Card style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                        Pending Review
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)' }}>
                        {pendingCount}
                    </div>
                </Card>
                <Card style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                        Approved Total (filtered)
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>
                        {fmtPHP(approvedTotal)}
                    </div>
                </Card>
            </div>

            <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
                <Space wrap>
                    <Select
                        style={{ width: 160 }}
                        value={status}
                        onChange={setStatus}
                        options={[
                            { value: '', label: 'All statuses' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'approved', label: 'Approved' },
                            { value: 'rejected', label: 'Rejected' },
                        ]}
                    />
                    <DatePicker placeholder="Date From" value={dateFrom} onChange={setDateFrom} />
                    <DatePicker placeholder="Date To" value={dateTo} onChange={setDateTo} />
                    <Button
                        size="small"
                        onClick={() => {
                            setDateFrom(null);
                            setDateTo(null);
                            setStatus('');
                        }}
                    >
                        Clear Filters
                    </Button>
                </Space>
            </Card>

            <Card>
                <Table
                    columns={columns}
                    dataSource={rows}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 15, size: 'small', showTotal: (t) => `${t} records` }}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No parking remittances found.' }}
                />
            </Card>

            <RemittanceDetailModal
                record={selected}
                baseUrl="/admin/parking-remittances"
                title="Parking Remittance"
                onClose={() => setSelected(null)}
                onReviewed={fetchRows}
            />
        </div>
    );
};

export default ParkingRemittances;