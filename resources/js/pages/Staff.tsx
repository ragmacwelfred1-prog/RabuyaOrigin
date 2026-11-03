
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Switch, message, Space, Popconfirm, Tag, Card, Row, Col, Progress, Spin } from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, 
    UserOutlined, TeamOutlined, MailOutlined, PhoneOutlined,
    IdcardOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';

interface Staff {
    id: number;
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    phone_number: string;
    employee_id: string;
    is_active: boolean;
    role: string;
    created_at?: string;
}

const StaffManagement: React.FC = () => {
    const [staff, setStaff] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const response = await api.get('/admin/staff');
            setStaff(response.data);
        } catch (error) {
            console.error('Error fetching staff:', error);
            message.error('Failed to load staff');
        } finally {
            setLoading(false);
        }
    };

    // ─── Auto‑generate Employee ID ──────────────────────────────────────────
    const generateNextEmployeeId = (): string => {
        const currentYear = new Date().getFullYear().toString();
        const pattern = new RegExp(`^${currentYear}-(\\d{4})$`);

        // Find all existing IDs for this year and extract the numeric part
        const numbers = staff
            .map(s => s.employee_id)
            .filter(id => pattern.test(id))
            .map(id => parseInt(id.split('-')[1], 10))
            .filter(num => !isNaN(num));

        const max = numbers.length > 0 ? Math.max(...numbers) : 0;
        const next = max + 1;
        const padded = String(next).padStart(4, '0');
        return `${currentYear}-${padded}`;
    };

    const handleAdd = () => {
        setEditingStaff(null);
        form.resetFields();
        // Generate next employee ID
        const newId = generateNextEmployeeId();
        form.setFieldsValue({
            is_active: true,
            employee_id: newId,
        });
        setModalVisible(true);
    };

    const handleEdit = (record: Staff) => {
        setEditingStaff(record);
        form.setFieldsValue({
            first_name:   record.first_name,
            middle_name:  record.middle_name || '',
            last_name:    record.last_name,
            email:        record.email,
            phone_number: record.phone_number,
            employee_id:  record.employee_id,
            is_active:    record.is_active,
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/admin/staff/${id}`);
            message.success('Staff deleted successfully');
            fetchStaff();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Error deleting staff');
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            const data: Record<string, any> = {
                first_name: values.first_name,
                middle_name: values.middle_name || '',
                last_name: values.last_name,
                email: values.email,
                phone_number: values.phone_number,
                employee_id: values.employee_id, // auto-generated or existing
                is_active: values.is_active,
            };

            if (editingStaff) {
                if (values.password) {
                    data.password = values.password;
                }
                await api.put(`/admin/staff/${editingStaff.id}`, data);
                message.success('Staff updated successfully');
            } else {
                if (!values.password) {
                    message.error('Password is required for new staff');
                    return;
                }
                data.password = values.password;
                await api.post('/admin/staff', data);
                message.success('Staff added successfully');
            }
            setModalVisible(false);
            form.resetFields();
            fetchStaff();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Error saving staff');
        }
    };

    const getFullName = (record: Staff) => {
        const parts = [record.first_name];
        if (record.middle_name && record.middle_name.trim() !== '') {
            parts.push(record.middle_name);
        }
        parts.push(record.last_name);
        return parts.join(' ');
    };

    const totalStaff = staff.length;
    const activeStaff = staff.filter(s => s.is_active).length;
    const inactiveStaff = staff.filter(s => !s.is_active).length;
    const activePercentage = totalStaff > 0 ? (activeStaff / totalStaff) * 100 : 0;

    const columns = [
        {
            title: 'Employee', key: 'employee',
            render: (_: any, record: Staff) => (
                <Space>
                    <UserOutlined style={{ 
                        color: record.is_active ? 'var(--success)' : 'var(--text-tertiary)', 
                        fontSize: 18 
                    }} />
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{getFullName(record)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{record.email}</div>
                    </div>
                </Space>
            )
        },
        {
            title: 'Employee ID', dataIndex: 'employee_id', key: 'employee_id',
            render: (text: string) => (
                <Tag icon={<IdcardOutlined />} style={{ fontSize: 12 }}>{text}</Tag>
            )
        },
        {
            title: 'Contact', key: 'contact',
            render: (_: any, record: Staff) => (
                <div style={{ fontSize: 12 }}>
                    <div>
                        <MailOutlined style={{ color: 'var(--text-tertiary)', marginRight: 6, fontSize: 11 }} />
                        {record.email}
                    </div>
                    {record.phone_number && (
                        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                            <PhoneOutlined style={{ marginRight: 6, fontSize: 11 }} />
                            {record.phone_number}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Status', dataIndex: 'is_active', key: 'status', width: 100,
            render: (active: boolean) => (
                <Tag
                    color={active ? 'success' : 'default'}
                    icon={active ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    style={{ fontSize: 11 }}
                >
                    {active ? 'Active' : 'Inactive'}
                </Tag>
            )
        },
        {
            title: 'Actions', key: 'actions', width: 80, align: 'center' as const,
            render: (_: any, record: Staff) => (
                <Space size={0}>
                    <Button 
                        type="text" 
                        size="small"
                        icon={<EditOutlined />} 
                        onClick={() => handleEdit(record)} 
                        style={{ 
                            color: 'var(--primary)', 
                            border: 'none', 
                            background: 'transparent',
                            boxShadow: 'none',
                            padding: '4px 6px'
                        }}
                        className="icon-btn"
                    />
                    <Popconfirm 
                        title="Delete this staff?" 
                        onConfirm={() => handleDelete(record.id)} 
                        okText="Yes" 
                        cancelText="No"
                    >
                        <Button 
                            type="text" 
                            size="small"
                            icon={<DeleteOutlined />}
                            style={{ 
                                color: 'var(--danger)', 
                                border: 'none', 
                                background: 'transparent',
                                boxShadow: 'none',
                                padding: '4px 6px'
                            }}
                            className="icon-btn"
                        />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    if (loading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading staff..." />
            </div>
        );
    }

    return (
        <div>
            <style>{`
                .icon-btn.ant-btn-text {
                    border: none !important;
                    background: transparent !important;
                    box-shadow: none !important;
                }
                .icon-btn.ant-btn-text:hover {
                    background: var(--bg-surface-hover) !important;
                    border-radius: 4px;
                }
                .ant-table-cell .ant-btn-text {
                    border: none !important;
                    background: transparent !important;
                    box-shadow: none !important;
                }
            `}</style>

            <div className="page-header">
                <div>
                    <h1 className="page-title">Staff Management</h1>
                    <p className="page-description">Manage staff accounts and mobile app access.</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    Add Staff
                </Button>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card stat-card-success" size="small">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Total Staff</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{totalStaff}</div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 4 }}>Registered employees</div>
                            </div>
                            <TeamOutlined style={{ color: 'var(--success)', fontSize: 22, opacity: 0.8 }} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card stat-card-success" size="small">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Active Staff</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)', lineHeight: 1.1 }}>{activeStaff}</div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 4 }}>Can login to mobile app</div>
                            </div>
                            <CheckCircleOutlined style={{ color: 'var(--success)', fontSize: 22, opacity: 0.8 }} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card stat-card-danger" size="small">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Inactive Staff</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--danger)', lineHeight: 1.1 }}>{inactiveStaff}</div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 10, marginTop: 4 }}>Cannot login to mobile app</div>
                            </div>
                            <CloseCircleOutlined style={{ color: 'var(--danger)', fontSize: 22, opacity: 0.8 }} />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card stat-card-secondary" size="small">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Active Rate</div>
                                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--info)', lineHeight: 1.1 }}>{Math.round(activePercentage)}%</div>
                                <Progress 
                                    percent={activePercentage} 
                                    size="small" 
                                    showInfo={false} 
                                    style={{ marginTop: 4 }} 
                                />
                            </div>
                            <UserOutlined style={{ color: 'var(--info)', fontSize: 22, opacity: 0.8 }} />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card
                size="small"
                title={<Space><TeamOutlined style={{ color: 'var(--success)' }} /><span style={{ fontWeight: 600 }}>Staff Members</span></Space>}
            >
                <Table 
                    dataSource={staff} 
                    columns={columns} 
                    rowKey="id" 
                    pagination={{ pageSize: 10, size: 'small' }} 
                    size="small"
                    locale={{ emptyText: 'No staff members found' }} 
                />
            </Card>

            <Modal
                title={
                    <Space>
                        {editingStaff ? <EditOutlined style={{ color: 'var(--primary)' }} /> : <PlusOutlined style={{ color: 'var(--success)' }} />}
                        <span style={{ fontWeight: 600 }}>{editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}</span>
                    </Space>
                }
                open={modalVisible} 
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }} 
                footer={null} 
                width={550}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ is_active: true }} size="small">
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'Required' }]}>
                                <Input placeholder="First name" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="middle_name" label="Middle Name">
                                <Input placeholder="Middle name (optional)" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Required' }]}>
                                <Input placeholder="Last name" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Invalid email' }]}>
                        <Input placeholder="email@example.com" prefix={<MailOutlined style={{ color: 'var(--text-tertiary)' }} />} />
                    </Form.Item>

                    <Form.Item name="phone_number" label="Phone Number" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="Phone number" prefix={<PhoneOutlined style={{ color: 'var(--text-tertiary)' }} />} />
                    </Form.Item>

                    <Form.Item 
                        name="employee_id" 
                        label="Employee ID" 
                        rules={[{ required: true, message: 'Required' }]}
                    >
                        <Input 
                            placeholder="Auto-generated" 
                            disabled={true}   // always disabled, auto-generated
                            prefix={<IdcardOutlined style={{ color: 'var(--text-tertiary)' }} />} 
                        />
                    </Form.Item>

                    <Form.Item 
                        name="password" 
                        label="Password" 
                        rules={editingStaff ? [] : [{ required: true, message: 'Password is required' }]}
                    >
                        <Input.Password 
                            placeholder={editingStaff ? 'Leave blank to keep current' : 'Enter password'} 
                        />
                    </Form.Item>

                    <Form.Item name="is_active" label="Mobile App Access" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>

                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Button 
                            onClick={() => {
                                setModalVisible(false);
                                form.resetFields();
                            }} 
                            style={{ marginRight: 8 }}
                        >
                            Cancel
                        </Button>
                        <Button type="primary" htmlType="submit">
                            {editingStaff ? 'Update Staff' : 'Add Staff'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default StaffManagement;
