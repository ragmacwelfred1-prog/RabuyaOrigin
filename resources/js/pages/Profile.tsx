
// resources/js/pages/Profile.tsx
import React, { useState, useEffect } from 'react';
import {
    Card,
    Row,
    Col,
    Descriptions,
    Avatar,
    Button,
    Form,
    Input,
    message,
    Space,
    Tag,
    Modal,
} from 'antd';
import {
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    IdcardOutlined,
    EditOutlined,
    SaveOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

const Profile: React.FC = () => {
    const { user, setUser } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form] = Form.useForm();
    const [passwordModal, setPasswordModal] = useState(false);
    const [passwordForm] = Form.useForm();
    const [changingPassword, setChangingPassword] = useState(false);

    useEffect(() => {
        if (user) {
            form.setFieldsValue({
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                email: user.email || '',
                phone_number: (user as any).phone_number || '',
            });
        }
    }, [user, form]);

    const handleSaveProfile = async (values: any) => {
        setLoading(true);
        try {
            const res = await api.put('/admin/profile', values);
            if (res.data.success) {
                setUser({ ...user, ...values });
                message.success('Profile updated successfully');
                setEditing(false);
            } else {
                message.error(res.data.message || 'Failed to update profile');
            }
        } catch (e: any) {
            message.error(
                e.response?.data?.message || 'Failed to update profile',
            );
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (values: any) => {
        setChangingPassword(true);
        try {
            const res = await api.post('/admin/change-password', values);
            if (res.data.success) {
                message.success('Password changed successfully');
                setPasswordModal(false);
                passwordForm.resetFields();
            } else {
                message.error(res.data.message || 'Failed to change password');
            }
        } catch (e: any) {
            message.error(
                e.response?.data?.message || 'Failed to change password',
            );
        } finally {
            setChangingPassword(false);
        }
    };

    const getFullName = () => {
        if (user?.first_name && user?.last_name)
            return `${user.first_name} ${user.last_name}`;
        if (user?.first_name) return user.first_name;
        if (user?.email) return user.email.split('@')[0];
        return 'User';
    };

    const getRole = () => {
        if (user?.role === 'admin') return 'Administrator';
        if (user?.role === 'staff') return 'Staff';
        return 'User';
    };

    const getInitials = () => {
        const first = user?.first_name?.charAt(0) || '';
        const last = user?.last_name?.charAt(0) || '';
        return (first + last).toUpperCase() || 'U';
    };

    const phoneNumber = (user as any).phone_number;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">My Profile</h1>
                    <p className="page-description">
                        Manage your account information and password
                    </p>
                </div>
                <Space>
                    {editing ? (
                        <>
                            <Button
                                icon={<CloseOutlined />}
                                onClick={() => {
                                    setEditing(false);
                                    form.resetFields();
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={loading}
                                onClick={() => form.submit()}
                            >
                                Save Changes
                            </Button>
                        </>
                    ) : (
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => setEditing(true)}
                        >
                            Edit Profile
                        </Button>
                    )}
                </Space>
            </div>

            <Row gutter={[24, 24]}>
                {/* Avatar Card */}
                <Col xs={24} md={8}>
                    <Card
                        style={{
                            textAlign: 'center',
                            background: 'var(--bg-card)',
                            borderColor: 'var(--border-color)',
                        }}
                    >
                        <Avatar
                            size={100}
                            style={{
                                background:
                                    'linear-gradient(135deg, #0D6EFD, #489FB5)',
                                fontSize: 40,
                                fontWeight: 700,
                                marginBottom: 16,
                            }}
                        >
                            {getInitials()}
                        </Avatar>
                        <h2
                            style={{
                                marginBottom: 4,
                                fontSize: 20,
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {getFullName()}
                        </h2>
                        <Tag
                            color="green"
                            style={{
                                fontSize: 12,
                                padding: '2px 12px',
                                borderRadius: 20,
                            }}
                        >
                            {getRole()}
                        </Tag>
                        <div
                            style={{
                                marginTop: 16,
                                color: 'var(--text-secondary)',
                                fontSize: 13,
                            }}
                        >
                            <MailOutlined style={{ marginRight: 8 }} />
                            {user?.email || 'No email'}
                        </div>
                        {phoneNumber && (
                            <div
                                style={{
                                    marginTop: 8,
                                    color: 'var(--text-secondary)',
                                    fontSize: 13,
                                }}
                            >
                                <PhoneOutlined style={{ marginRight: 8 }} />
                                {phoneNumber}
                            </div>
                        )}
                        <Button
                            type="default"
                            style={{ marginTop: 20 }}
                            onClick={() => setPasswordModal(true)}
                        >
                            Change Password
                        </Button>
                    </Card>
                </Col>

                {/* Profile Details */}
                <Col xs={24} md={16}>
                    <Card
                        title={
                            <Space>
                                <IdcardOutlined
                                    style={{ color: 'var(--success)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Account Information
                                </span>
                            </Space>
                        }
                        style={{
                            background: 'var(--bg-card)',
                            borderColor: 'var(--border-color)',
                        }}
                    >
                        {editing ? (
                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={handleSaveProfile}
                            >
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="first_name"
                                            label="First Name"
                                            rules={[{ required: true }]}
                                        >
                                            <Input
                                                placeholder="First name"
                                                size="large"
                                                prefix={<UserOutlined />}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="last_name"
                                            label="Last Name"
                                            rules={[{ required: true }]}
                                        >
                                            <Input
                                                placeholder="Last name"
                                                size="large"
                                                prefix={<UserOutlined />}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item
                                    name="email"
                                    label="Email"
                                    rules={[{ required: true, type: 'email' }]}
                                >
                                    <Input
                                        placeholder="Email"
                                        size="large"
                                        prefix={<MailOutlined />}
                                    />
                                </Form.Item>
                                <Form.Item
                                    name="phone_number"
                                    label="Phone Number"
                                >
                                    <Input
                                        placeholder="Phone number"
                                        size="large"
                                        prefix={<PhoneOutlined />}
                                    />
                                </Form.Item>
                            </Form>
                        ) : (
                            <Descriptions bordered column={1} size="middle">
                                <Descriptions.Item
                                    label={
                                        <>
                                            <UserOutlined
                                                style={{ marginRight: 6 }}
                                            />
                                            First Name
                                        </>
                                    }
                                >
                                    {user?.first_name || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item
                                    label={
                                        <>
                                            <UserOutlined
                                                style={{ marginRight: 6 }}
                                            />
                                            Last Name
                                        </>
                                    }
                                >
                                    {user?.last_name || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item
                                    label={
                                        <>
                                            <MailOutlined
                                                style={{ marginRight: 6 }}
                                            />
                                            Email
                                        </>
                                    }
                                >
                                    {user?.email || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item
                                    label={
                                        <>
                                            <PhoneOutlined
                                                style={{ marginRight: 6 }}
                                            />
                                            Phone
                                        </>
                                    }
                                >
                                    {phoneNumber || '-'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Role">
                                    <Tag color="green">{getRole()}</Tag>
                                </Descriptions.Item>
                            </Descriptions>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Change Password Modal */}
            <Modal
                title={
                    <Space>
                        <SaveOutlined style={{ color: 'var(--warning)' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Change Password
                        </span>
                    </Space>
                }
                open={passwordModal}
                onCancel={() => {
                    setPasswordModal(false);
                    passwordForm.resetFields();
                }}
                footer={null}
                width={450}
            >
                <Form
                    form={passwordForm}
                    layout="vertical"
                    onFinish={handleChangePassword}
                >
                    <Form.Item
                        name="current_password"
                        label="Current Password"
                        rules={[
                            {
                                required: true,
                                message: 'Please enter current password',
                            },
                        ]}
                    >
                        <Input.Password
                            placeholder="Current password"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item
                        name="new_password"
                        label="New Password"
                        rules={[
                            {
                                required: true,
                                message: 'Please enter new password',
                            },
                            {
                                min: 6,
                                message:
                                    'Password must be at least 6 characters',
                            },
                        ]}
                    >
                        <Input.Password
                            placeholder="New password"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item
                        name="new_password_confirmation"
                        label="Confirm Password"
                        rules={[
                            {
                                required: true,
                                message: 'Please confirm new password',
                            },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (
                                        !value ||
                                        getFieldValue('new_password') === value
                                    ) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(
                                        'Passwords do not match',
                                    );
                                },
                            }),
                        ]}
                    >
                        <Input.Password
                            placeholder="Confirm new password"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Button
                            onClick={() => {
                                setPasswordModal(false);
                                passwordForm.resetFields();
                            }}
                            style={{ marginRight: 8 }}
                            size="large"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={changingPassword}
                            size="large"
                        >
                            Update Password
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Profile;
