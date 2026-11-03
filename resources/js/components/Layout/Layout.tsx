// resources/js/components/Layout/Layout.tsx
import React, { useState, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
    children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [pinned, setPinned] = useState(false);
    const hoverRef = useRef(false);

    const toggleSidebar = () => {
        const nextPinned = !pinned;
        setPinned(nextPinned);
        if (nextPinned) {
            setCollapsed(false);
        } else if (!hoverRef.current) {
            setCollapsed(true);
        }
    };

    const handleMouseEnter = () => {
        hoverRef.current = true;
        if (!pinned) setCollapsed(false);
    };

    const handleMouseLeave = () => {
        hoverRef.current = false;
        if (!pinned) setCollapsed(true);
    };

    return (
        <div className="app">
            <Sidebar
                collapsed={collapsed}
                onToggle={toggleSidebar}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                pinned={pinned}
            />
            <div className={`main-content ${pinned ? '' : 'collapsed'}`}>
                <Header />
                <div className="content fade-in">
                    {children || <Outlet />}
                </div>
            </div>
        </div>
    );
};

export default Layout;