
// resources/js/pages/Promo.tsx
import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    message,
    Space,
    Card,
    Tag,
    Popconfirm,
    Spin,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    GiftOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';

interface Promo {
    id: number;
    title: string;
    description?: string;
    discount: number;
    user_id: number;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

const Promos: React.FC = () => {
    const [promos, setPromos] = useState<Promo[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [form] = Form.useForm();

    const fetchPromos = async () => {
        setLoading(true);
        try {
            const r = await api.get('/admin/promos');
            setPromos(Array.isArray(r.data) ? r.data : []);
        } catch (err) {
            console.error('fetchPromos error:', err);
            message.error('Failed to load promos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPromos();
    }, []);

    const openAdd = () => {
        setEditingPromo(null);
        form.resetFields();
        setModalVisible(true);
    };

    const openEdit = (record: Promo) => {
        setEditingPromo(record);
        form.setFieldsValue({
            title: record.title,
            description: record.description ?? '',
        });
        setModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const payload = {
                title: values.title,
                description: values.description ?? null,
            };

            if (editingPromo) {
                const r = await api.put(
                    `/admin/promos/${editingPromo.id}`,
                    payload,
                );
                if (r.data.success) {
                    message.success('Promo updated successfully.');
                    setPromos((prev) =>
                        prev.map((p) =>
                            p.id === editingPromo.id
                                ? { ...p, ...r.data.promo }
                                : p,
                        ),
                    );
                } else {
                    message.error(r.data.message ?? 'Failed to update promo.');
                }
            } else {
                const r = await api.post('/admin/promos', payload);
                if (r.data.success) {
                    message.success('Promo created successfully.');
                    setPromos((prev) => [r.data.promo, ...prev]);
                } else {
                    message.error(r.data.message ?? 'Failed to create promo.');
                }
            }
            setModalVisible(false);
            form.resetFields();
        } catch (err: any) {
            message.error(err.response?.data?.message ?? 'An error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        setDeletingId(id);
        try {
            const r = await api.delete(`/admin/promos/${id}`);
            if (r.data.success) {
                message.success('Promo deleted successfully.');
                setPromos((prev) => prev.filter((p) => p.id !== id));
            } else {
                message.error(r.data.message ?? 'Failed to delete promo.');
            }
        } catch (err: any) {
            message.error(
                err.response?.data?.message ?? 'Failed to delete promo.',
            );
        } finally {
            setDeletingId(null);
        }
    };

    // ── Table columns ──────────────────────────────────────────────────────────
    const columns = [
        {
            title: 'Title',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => (
                <Space>
                    <GiftOutlined style={{ color: 'var(--primary)' }} />
                    <span
                        style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                        }}
                    >
                        {text}
                    </span>
                </Space>
            ),
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (text: string) => (
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {text || '—'}
                </span>
            ),
        },
        {
            title: 'Date',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (v: string) => (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {v ? dayjs(v).format('MMM DD, YYYY') : '—'}
                </span>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 110,
            render: (_: any, record: Promo) => (
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined style={{ color: 'var(--primary)' }} />}
                        onClick={() => openEdit(record)}
                    />
                    <Popconfirm
                        title="Delete this promo? This cannot be undone."
                        okText="Yes, Delete"
                        okButtonProps={{ danger: true }}
                        cancelText="Cancel"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Button
                            type="text"
                            size="small"
                            loading={deletingId === record.id}
                            icon={
                                <DeleteOutlined style={{ color: 'var(--danger)' }} />
                            }
                            style={{
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none',
                            }}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading promos..." />
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Promos</h1>
                    <p className="page-description">
                        Manage promotional labels. The actual discount amount is
                        entered manually at checkout.
                    </p>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchPromos}>
                        Refresh
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openAdd}
                    >
                        Add Promo
                    </Button>
                </Space>
            </div>

            <Card
                style={{
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                }}
            >
                <Table
                    dataSource={promos}
                    columns={columns}
                    rowKey="id"
                    pagination={{ pageSize: 10, size: 'small' }}
                    size="small"
                    locale={{
                        emptyText:
                            'No promos yet. Click "Add Promo" to create one.',
                    }}
                />
            </Card>

            {/* Add / Edit Modal */}
            <Modal
                title={
                    <Space>
                        {editingPromo ? <EditOutlined /> : <PlusOutlined />}
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {editingPromo ? 'Edit Promo' : 'Add New Promo'}
                        </span>
                    </Space>
                }
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={480}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item
                        name="title"
                        label="Title"
                        rules={[
                            {
                                required: true,
                                message: 'Please enter a title.',
                            },
                        ]}
                    >
                        <Input
                            placeholder="e.g., Drop off / Pick up"
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item name="description" label="Description">
                        <Input.TextArea
                            placeholder="Optional description of this promo…"
                            rows={3}
                            style={{ borderRadius: 8 }}
                        />
                    </Form.Item>

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
                                setModalVisible(false);
                                form.resetFields();
                            }}
                            size="large"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={submitting}
                            size="large"
                        >
                            {editingPromo ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default Promos;
