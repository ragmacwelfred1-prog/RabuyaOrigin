

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Card, Spin, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TruckOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';

interface Supplier {
    id: number;
    supplier_name: string;
}

const Suppliers: React.FC = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [form] = Form.useForm();

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const r = await api.get('/suppliers');
            setSuppliers(Array.isArray(r.data) ? r.data : []);
        } catch { message.error('Failed to load suppliers'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchSuppliers(); }, []);

    const handleAdd = () => { setEditingSupplier(null); form.resetFields(); setModalVisible(true); };
    const handleEdit = (record: Supplier) => { setEditingSupplier(record); form.setFieldsValue({ supplier_name: record.supplier_name }); setModalVisible(true); };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/suppliers/${id}`);
            message.success('Supplier deleted');
            fetchSuppliers();
        } catch (error: any) { message.error(error.response?.data?.message || 'Failed to delete'); }
    };

    const handleSubmit = async (values: any) => {
        try {
            if (editingSupplier) {
                await api.put(`/suppliers/${editingSupplier.id}`, values);
                message.success('Supplier updated!');
            } else {
                await api.post('/suppliers', values);
                message.success('Supplier added!');
            }
            setModalVisible(false); form.resetFields(); fetchSuppliers();
        } catch (error: any) { message.error(error.response?.data?.message || 'Error'); }
    };

    const columns = [
        { 
            title: 'Supplier Name', 
            dataIndex: 'supplier_name', 
            key: 'name', 
            render: (text: string) => (
                <Space>
                    <TruckOutlined style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600 }}>{text}</span>
                </Space>
            ) 
        },
        {
            title: 'Actions', 
            key: 'actions', 
            width: 100,
            render: (_: any, record: Supplier) => (
                <Space size="small">
                    <Button 
                        type="link" 
                        size="small" 
                        icon={<EditOutlined style={{ color: 'var(--success)' }} />} 
                        onClick={() => handleEdit(record)} 
                        style={{ background: 'transparent', border: 'none', padding: 0, height: 'auto', boxShadow: 'none' }}
                    />
                    <Popconfirm title="Delete this supplier?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
                        <Button 
                            type="link" 
                            size="small" 
                            danger 
                            icon={<DeleteOutlined />} 
                            style={{ background: 'transparent', border: 'none', padding: 0, height: 'auto', boxShadow: 'none' }}
                        />
                    </Popconfirm>
                </Space>
            )
        },
    ];

    if (loading) return <div className="page-loading"><Spin size="large" tip="Loading suppliers..." /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Suppliers</h1>
                    <p className="page-description">Manage fuel suppliers.</p>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchSuppliers}>Refresh</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Supplier</Button>
                </Space>
            </div>

            <Card>
                <Table 
                    dataSource={suppliers} 
                    columns={columns} 
                    rowKey="id" 
                    pagination={{ pageSize: 10 }} 
                    locale={{ emptyText: 'No suppliers found' }} 
                />
            </Card>

            <Modal 
                title={<Space><TruckOutlined style={{ color: 'var(--success)' }} /><span>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</span></Space>} 
                open={modalVisible} 
                onCancel={() => setModalVisible(false)} 
                footer={null} 
                width={450}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="supplier_name" label="Supplier Name" rules={[{ required: true, message: 'Please enter supplier name' }]}>
                        <Input placeholder="e.g., Petron Corporation" size="large" />
                    </Form.Item>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Button onClick={() => setModalVisible(false)} size="large" style={{ marginRight: 8 }}>Cancel</Button>
                        <Button type="primary" htmlType="submit" size="large">
                            {editingSupplier ? 'Update' : 'Add'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Suppliers;
