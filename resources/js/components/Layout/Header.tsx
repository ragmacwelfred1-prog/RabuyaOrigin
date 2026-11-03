// resources/js/components/Layout/Header.tsx
import React, { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { soundService } from '../../services/soundService';
import { getInitialIsDark, applyTheme } from '../../theme/evergreen';
import { useNavigate } from 'react-router-dom';
import {
    message,
    Dropdown,
    Avatar,
    Space,
    MenuProps,
    Badge,
    List,
    Popover,
    Button,
    Tag,
    Tooltip,
} from 'antd';
import {
    UserOutlined,
    LogoutOutlined,
    SettingOutlined,
    MoonOutlined,
    SunOutlined,
    BellOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    WarningOutlined,
    InfoCircleOutlined,
    WifiOutlined,
    DisconnectOutlined,
    SoundFilled,
    SoundOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const Header: React.FC = () => {
    const { user, logout } = useAuthStore();
    const {
        notifications,
        unreadCount,
        isConnected,
        connect,
        disconnect,
        markAsRead,
        markAllAsRead,
        clearAll,
    } = useNotificationStore();
    const navigate = useNavigate();

    const [isDark, setIsDark] = React.useState(getInitialIsDark);

    const [soundEnabled, setSoundEnabled] = React.useState(() =>
        soundService.isSoundEnabled(),
    );

    useEffect(() => {
        connect(user?.id);
        return () => {
            disconnect();
        };
    }, [user?.id]);

    useEffect(() => {
        console.log('🔔 Header: notifications =', notifications.length);
        console.log('🔔 Header: unread =', unreadCount);
        console.log('🔔 Header: polling connected =', isConnected);
    }, [notifications, unreadCount, isConnected]);

    // ─── Theme toggle ─────────────────────────────────────────────────────
    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        applyTheme(next);
    };

    const toggleSound = () => {
        soundService.toggle();
        setSoundEnabled(soundService.isSoundEnabled());
        message.success(
            `Sound ${soundService.isSoundEnabled() ? 'enabled' : 'disabled'}`,
        );
    };

    const handleLogout = async () => {
        try {
            await logout();
            message.success('Logged out successfully');
            navigate('/login', { replace: true });
        } catch (error) {
            console.error('Logout error:', error);
            navigate('/login', { replace: true });
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircleOutlined style={{ color: 'var(--success)' }} />;
            case 'error':
                return <CloseCircleOutlined style={{ color: 'var(--danger)' }} />;
            case 'warning':
                return <WarningOutlined style={{ color: 'var(--accent)' }} />;
            default:
                return <InfoCircleOutlined style={{ color: 'var(--info)' }} />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'success':
                return 'green';
            case 'error':
                return 'red';
            case 'warning':
                return 'orange';
            default:
                return 'blue';
        }
    };

    const items: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Profile',
            onClick: () => navigate('/profile'),
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Settings',
            onClick: () => navigate('/settings'),
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Sign Out',
            onClick: handleLogout,
            danger: true,
        },
    ];

    const getDisplayName = () => {
        if (user?.first_name && user?.last_name)
            return `${user.first_name} ${user.last_name}`;
        if (user?.first_name) return user.first_name;
        if (user?.email) return user.email.split('@')[0];
        return 'Guest';
    };

    const getUserRole = () => {
        if (user?.role === 'admin') return 'Administrator';
        if (user?.role === 'staff') return 'Staff';
        if (user?.role === 'customer') return 'Customer';
        return 'User';
    };

    const notificationContent = (
        <div style={{ width: 380, maxHeight: 400, overflowY: 'auto' }}>
            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isConnected
                        ? 'var(--success-bg)'
                        : 'var(--danger-bg)',
                    borderRadius: '12px 12px 0 0',
                }}
            >
                <span
                    style={{
                        fontSize: 12,
                        color: isConnected
                            ? 'var(--success-text)'
                            : 'var(--danger-text)',
                        fontWeight: 500,
                    }}
                >
                    {isConnected ? (
                        <>
                            <WifiOutlined /> Auto-refresh active (5s)
                        </>
                    ) : (
                        <>
                            <DisconnectOutlined /> Polling stopped
                        </>
                    )}
                </span>
                <Tag color={isConnected ? 'green' : 'red'} style={{ margin: 0 }}>
                    {isConnected ? 'Live' : 'Offline'}
                </Tag>
            </div>

            <div
                style={{
                    padding: '4px 12px',
                    background: 'var(--bg-surface-hover)',
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-color)',
                }}
            >
                📊 {notifications.length} notification
                {notifications.length !== 1 ? 's' : ''} · {unreadCount} unread
            </div>

            {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <BellOutlined
                        style={{ fontSize: 32, color: 'var(--text-tertiary)' }}
                    />
                    <p
                        style={{
                            color: 'var(--text-secondary)',
                            marginTop: 8,
                        }}
                    >
                        No notifications
                    </p>
                    <p
                        style={{
                            color: 'var(--text-tertiary)',
                            fontSize: 11,
                        }}
                    >
                        💡 All caught up!
                    </p>
                </div>
            ) : (
                <List
                    size="small"
                    dataSource={notifications.slice(0, 20)}
                    renderItem={(item) => (
                        <List.Item
                            key={item.id || Math.random()}
                            onClick={() => markAsRead(item.id!)}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                background: item.read
                                    ? 'transparent'
                                    : 'var(--bg-surface-hover)',
                                borderRadius: 8,
                                marginBottom: 2,
                                borderLeft: `3px solid ${getTypeColor(item.type)}`,
                            }}
                        >
                            <List.Item.Meta
                                avatar={getIcon(item.type)}
                                title={
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 600,
                                                color: 'var(--text-primary)',
                                                fontSize: 13,
                                            }}
                                        >
                                            {item.title}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--text-tertiary)',
                                            }}
                                        >
                                            {item.timestamp
                                                ? dayjs(item.timestamp).fromNow()
                                                : 'just now'}
                                        </span>
                                    </div>
                                }
                                description={
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {item.message}
                                    </span>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            {notifications.length > 0 && (
                <div
                    style={{
                        padding: '8px 12px',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: 'var(--bg-surface-hover)',
                        borderRadius: '0 0 12px 12px',
                    }}
                >
                    <Button
                        type="text"
                        size="small"
                        onClick={markAllAsRead}
                        style={{ color: 'var(--primary)' }}
                    >
                        Mark all as read
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        onClick={clearAll}
                        style={{ color: 'var(--danger)' }}
                    >
                        Clear all
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <header className="header">
            <div className="header-left">
                <div>
                    <h1>Park &amp; Fuel Management</h1>
                    <div className="header-subtitle">
                        Manage your parking and fuel operations
                        {user && (
                            <span
                                style={{
                                    marginLeft: 12,
                                    fontSize: 11,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                👤 {user.first_name}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="header-right">
                <Tooltip
                    title={
                        soundEnabled
                            ? 'Sound is ON - Click to mute'
                            : 'Sound is OFF - Click to unmute'
                    }
                >
                    <Button
                        type="text"
                        icon={
                            soundEnabled ? (
                                <SoundFilled
                                    style={{
                                        color: 'var(--primary)',
                                        fontSize: 18,
                                    }}
                                />
                            ) : (
                                <SoundOutlined
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 18,
                                    }}
                                />
                            )
                        }
                        onClick={toggleSound}
                        style={{
                            borderRadius: '50%',
                            background: soundEnabled
                                ? 'var(--primary-bg)'
                                : 'transparent',
                            width: 40,
                            height: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: 'none',
                        }}
                    />
                </Tooltip>

                <Popover
                    content={notificationContent}
                    title={
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingBottom: 4,
                            }}
                        >
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: 'var(--primary)',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 20,
                                }}
                            >
                                Notifications
                            </span>
                            {unreadCount > 0 && (
                                <span
                                    style={{
                                        fontSize: 12,
                                        color: 'var(--text-tertiary)',
                                    }}
                                >
                                    {unreadCount} unread
                                </span>
                            )}
                        </div>
                    }
                    trigger="click"
                    placement="bottomRight"
                    overlayStyle={{ padding: 0 }}
                >
                    <Badge
                        count={unreadCount}
                        size="small"
                        offset={[-4, 4]}
                        style={{
                            backgroundColor:
                                unreadCount > 0
                                    ? 'var(--danger)'
                                    : 'transparent',
                        }}
                    >
                        <Button
                            icon={<BellOutlined />}
                            style={{
                                borderRadius: 999,
                                border: !isConnected
                                    ? '2px solid var(--danger)'
                                    : '2px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-secondary)',
                                height: 40,
                            }}
                        >
                            Notifications
                            {!isConnected && (
                                <span
                                    style={{
                                        marginLeft: 4,
                                        fontSize: 10,
                                        color: 'var(--danger)',
                                    }}
                                >
                                    ●
                                </span>
                            )}
                        </Button>
                    </Badge>
                </Popover>

                <button
                    type="button"
                    className="theme-toggle-btn"
                    aria-pressed={isDark}
                    aria-label="Dark mode"
                    title={
                        isDark ? 'Switch to light mode' : 'Switch to dark mode'
                    }
                    onClick={toggleTheme}
                >
                    {isDark ? <SunOutlined /> : <MoonOutlined />}
                </button>

                <Dropdown
                    menu={{ items }}
                    placement="bottomRight"
                    trigger={['click']}
                >
                    <Space
                        style={{ cursor: 'pointer' }}
                        className="user-dropdown"
                    >
                        <Avatar
                            icon={<UserOutlined />}
                            style={{
                                background: 'var(--primary)',
                                color: 'var(--accent)',
                                width: 36,
                                height: 36,
                                fontSize: 15,
                            }}
                        />
                        <div className="user-info">
                            <div className="user-name">{getDisplayName()}</div>
                            <div className="user-role">
                                {getUserRole()}
                                {isConnected ? (
                                    <span
                                        style={{
                                            marginLeft: 6,
                                            fontSize: 8,
                                            color: 'var(--success)',
                                            display: 'inline-block',
                                        }}
                                    >
                                        ●
                                    </span>
                                ) : (
                                    <span
                                        style={{
                                            marginLeft: 6,
                                            fontSize: 8,
                                            color: 'var(--danger)',
                                            display: 'inline-block',
                                        }}
                                    >
                                        ○
                                    </span>
                                )}
                            </div>
                        </div>
                    </Space>
                </Dropdown>
            </div>
        </header>
    );
};

export default Header;