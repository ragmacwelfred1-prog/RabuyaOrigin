import React, { useEffect, useState } from 'react';
import { Modal, Button, Tag, Space, Input, Popconfirm, Alert, message } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

export interface RemittanceRecord {
    id: number;
    staff_id: number;
    staff?: {
        first_name: string;
        last_name: string;
        email: string;
        employee_id?: string;
    };
    reviewer?: { first_name: string; last_name: string } | null;
    remittance_date: string;
    remitted_amount: number | string;
    actual_sales_amount: number | string; // expected amount at submission
    difference: number | string;          // remitted - expected
    status: 'pending' | 'approved' | 'rejected';
    reject_reason?: string | null;
    reviewed_at: string | null;
    created_at: string;
}

export const fmtPHP = (n: any) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        Number(n ?? 0),
    );

export const RemittanceStatusTag: React.FC<{ status: RemittanceRecord['status'] }> = ({
    status,
}) => {
    if (status === 'approved')
        return (
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>
                APPROVED
            </Tag>
        );
    if (status === 'rejected')
        return (
            <Tag icon={<CloseCircleOutlined />} color="error" style={{ margin: 0 }}>
                REJECTED
            </Tag>
        );
    return (
        <Tag icon={<ClockCircleOutlined />} color="warning" style={{ margin: 0 }}>
            PENDING REVIEW
        </Tag>
    );
};

export const VarianceTag: React.FC<{ difference: number | string }> = ({ difference }) => {
    const d = Number(difference ?? 0);
    if (Math.abs(d) < 0.01) return <Tag color="success">Exact match ✓</Tag>;
    if (d < 0) return <Tag color="error">Short {fmtPHP(Math.abs(d))}</Tag>;
    return <Tag color="warning">Over {fmtPHP(d)}</Tag>;
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid var(--border-color)',
        }}
    >
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</span>
    </div>
);

interface Props {
    record: RemittanceRecord | null;
    /** '/admin/remittances' or '/admin/parking-remittances' */
    baseUrl: string;
    title: string;
    onClose: () => void;
    onReviewed: () => void;
}

export const RemittanceDetailModal: React.FC<Props> = ({
    record,
    baseUrl,
    title,
    onClose,
    onReviewed,
}) => {
    const isAdmin = localStorage.getItem('user_type') === 'admin';
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setRejecting(false);
        setReason('');
    }, [record?.id]);

    if (!record) return null;

    const canReview = isAdmin && record.status === 'pending';

    const submit = async (status: 'approved' | 'rejected') => {
        if (status === 'rejected' && !reason.trim()) {
            message.warning('Please enter the reason for rejection.');
            return;
        }
        setBusy(true);
        try {
            await api.patch(`${baseUrl}/${record.id}`, {
                status,
                reject_reason: status === 'rejected' ? reason.trim() : undefined,
            });
            message.success(
                status === 'approved' ? 'Remittance approved.' : 'Remittance rejected.',
            );
            onReviewed();
            onClose();
        } catch (e: any) {
            message.error(
                e.response?.data?.message ||
                    Object.values(e.response?.data?.errors ?? {}).flat().join(' ') ||
                    'Failed to update remittance.',
            );
        } finally {
            setBusy(false);
        }
    };

    const footer = !canReview
        ? [
              <Button key="close" onClick={onClose}>
                  Close
              </Button>,
          ]
        : rejecting
          ? [
                <Button key="back" onClick={() => setRejecting(false)} disabled={busy}>
                    Back
                </Button>,
                <Button
                    key="confirm"
                    danger
                    type="primary"
                    loading={busy}
                    onClick={() => submit('rejected')}
                >
                    Confirm Reject
                </Button>,
            ]
          : [
                <Button key="close" onClick={onClose} disabled={busy}>
                    Close
                </Button>,
                <Button
                    key="reject"
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => setRejecting(true)}
                    disabled={busy}
                >
                    Reject
                </Button>,
                <Popconfirm
                    key="approve"
                    title="Approve this remittance?"
                    okText="Yes, approve"
                    onConfirm={() => submit('approved')}
                >
                    <Button type="primary" icon={<CheckCircleOutlined />} loading={busy}>
                        Approve
                    </Button>
                </Popconfirm>,
            ];

    return (
        <Modal
            open
            title={title}
            onCancel={busy ? undefined : onClose}
            footer={footer}
            width={540}
            destroyOnClose
        >
            <Row label="Staff">
                {record.staff?.first_name} {record.staff?.last_name}
            </Row>
            <Row label="Remittance Date">{dayjs(record.remittance_date).format('MMM DD, YYYY')}</Row>
            <Row label="Expected (system)">{fmtPHP(record.actual_sales_amount)}</Row>
            <Row label="Remitted by staff">
                <span style={{ color: 'var(--success)' }}>{fmtPHP(record.remitted_amount)}</span>
            </Row>
            <Row label="Difference">
                <VarianceTag difference={record.difference} />
            </Row>
            <Row label="Status">
                <RemittanceStatusTag status={record.status} />
            </Row>
            <Row label="Submitted">{dayjs(record.created_at).format('MMM DD, YYYY h:mm A')}</Row>

            {record.reviewed_at && (
                <Row label="Reviewed">
                    {dayjs(record.reviewed_at).format('MMM DD, YYYY h:mm A')}
                    {record.reviewer
                        ? ` · ${record.reviewer.first_name} ${record.reviewer.last_name}`
                        : ''}
                </Row>
            )}

            {record.status === 'rejected' && record.reject_reason && (
                <Alert
                    style={{ marginTop: 14 }}
                    type="error"
                    showIcon
                    message="Reason for rejection"
                    description={record.reject_reason}
                />
            )}

            {canReview && !rejecting && Math.abs(Number(record.difference)) >= 0.01 && (
                <Alert
                    style={{ marginTop: 14 }}
                    type="warning"
                    showIcon
                    message="The remitted amount does not match the expected amount. Review before approving."
                />
            )}

            {canReview && rejecting && (
                <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>
                        Reason for rejection <span style={{ color: 'var(--danger)' }}>*</span>
                    </div>
                    <Input.TextArea
                        rows={3}
                        maxLength={500}
                        showCount
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Amount is short by ₱200. Please recount and remit the correct amount."
                    />
                </div>
            )}
        </Modal>
    );
};