// resources/js/components/Layout/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    DashboardOutlined,
    UserOutlined,
    CarOutlined,
    ShopOutlined,
    TeamOutlined,
    InboxOutlined,
    TruckOutlined,
    BarChartOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    GiftOutlined,
    FileTextOutlined,
    CalendarOutlined,
    PushpinFilled,
    MessageOutlined,
} from '@ant-design/icons';

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    pinned?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
    collapsed,
    onToggle,
    onMouseEnter,
    onMouseLeave,
    pinned = false,
}) => {
    const overviewItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
            path: '/dashboard',
        },
        {
            key: 'system-analytics',
            icon: <BarChartOutlined />,
            label: 'Analytics',
            path: '/system-analytics',
        },
    ];

    const managementItems = [
        {
            key: 'customers',
            icon: <UserOutlined />,
            label: 'Customers',
            path: '/customers',
        },
        {
            key: 'parking-remittance',
            icon: <UserOutlined />,
            label: 'Parking Remittance',
            path: '/parking-remittances',
        },
        {
            key: 'parking-calendar',
            icon: <CalendarOutlined />,
            label: 'Parking Calendar',
            path: '/parking-calendar',
        },
        {
            key: 'parking-slots',
            icon: <CarOutlined />,
            label: 'Parking Slots',
            path: '/parking-slots',
        },
        {
            key: 'fuel-products',
            icon: <ShopOutlined />,
            label: 'Fuel Products',
            path: '/fuel-products',
        },
        {
            key: 'inventory',
            icon: <InboxOutlined />,
            label: 'Inventory',
            path: '/inventory',
        },
        {
            key: 'suppliers',
            icon: <TruckOutlined />,
            label: 'Suppliers',
            path: '/suppliers',
        },
        {
            key: 'staff',
            icon: <TeamOutlined />,
            label: 'Staff',
            path: '/staff',
        },
        {
            key: 'promos',
            icon: <GiftOutlined />,
            label: 'Promo',
            path: '/promos',
        },
        {
            key: 'reports',
            icon: <FileTextOutlined />,
            label: 'Reports',
            path: '/reports',
        },
        {
            key: 'chat',
            icon: <MessageOutlined />,
            label: 'Messages',
            path: '/chat',
        },
    ];

    return (
        <div
            className={`sidebar ${collapsed ? 'collapsed' : ''} ${pinned ? 'pinned' : ''}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="sidebar-header">
                <div className="sidebar-header-left">
                    <div className="logo-icon">
                        <img
                            src="/images/Rabuya.png"
                            alt="Rabuya Logo"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    </div>
                    <div>
                        <h2>Rabuya</h2>
                        <p>Park &amp; Fuel</p>
                    </div>
                </div>
                <button
                    className="sidebar-toggle-btn"
                    onClick={onToggle}
                    aria-label={
                        pinned
                            ? 'Unpin sidebar (auto-collapse on leave)'
                            : 'Pin sidebar open'
                    }
                    title={
                        pinned
                            ? 'Unpin sidebar (auto-collapse on leave)'
                            : 'Pin sidebar open'
                    }
                >
                    {pinned ? (
                        <PushpinFilled />
                    ) : collapsed ? (
                        <MenuUnfoldOutlined />
                    ) : (
                        <MenuFoldOutlined />
                    )}
                </button>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section">
                    <div className="sidebar-section-title">Overview</div>
                    {overviewItems.map((item) => (
                        <NavLink
                            key={item.key}
                            to={item.path}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                            title={collapsed ? item.label : undefined}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>

                <div className="sidebar-section">
                    <div className="sidebar-section-title">Management</div>
                    {managementItems.map((item) => (
                        <NavLink
                            key={item.key}
                            to={item.path}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                            title={collapsed ? item.label : undefined}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
};

export default Sidebar;