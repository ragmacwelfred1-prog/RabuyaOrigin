
import React, { useState } from 'react';
import {
    Card,
    Row,
    Col,
    Switch,
    Button,
    message,
    Space,
    Divider,
    Select,
    Slider,
    Tag,
    Badge,
    Tooltip,
} from 'antd';
import {
    MoonFilled,
    SunFilled,
    BellOutlined,
    SoundOutlined,
    EyeOutlined,
    LockOutlined,
    GlobalOutlined,
    SettingOutlined,
    CheckCircleOutlined,
    SoundFilled,
    WifiOutlined,
    SafetyOutlined,
    DeleteOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { soundService } from '../services/soundService';

const Settings: React.FC = () => {
    const [isDark, setIsDark] = useState(() => {
        return (
            localStorage.getItem('theme') === 'dark' ||
            document.documentElement.getAttribute('data-theme') === 'dark'
        );
    });

    const [notifications, setNotifications] = useState(() => {
        return localStorage.getItem('notifications') !== 'false';
    });

    const [soundEnabled, setSoundEnabled] = useState(() => {
        return soundService.isSoundEnabled();
    });

    const [soundVolume, setSoundVolume] = useState(() => {
        return soundService.getVolume() * 100;
    });

    const [compactMode, setCompactMode] = useState(() => {
        return localStorage.getItem('compactMode') === 'true';
    });

    const [language, setLanguage] = useState(() => {
        return localStorage.getItem('language') || 'en';
    });

    const [tableRows, setTableRows] = useState(() => {
        return Number(localStorage.getItem('tableRows')) || 10;
    });

    // ─── Theme ──────────────────────────────────────────────────────────────
    const handleThemeToggle = (checked: boolean) => {
        setIsDark(checked);
        if (checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.style.backgroundColor = '#191C24';
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body.style.backgroundColor = '#E8EEF2';
            localStorage.setItem('theme', 'light');
        }
        message.success(`Switched to ${checked ? 'Dark' : 'Light'} Mode`);
    };

    // ─── Notifications ──────────────────────────────────────────────────────
    const handleNotificationToggle = (checked: boolean) => {
        setNotifications(checked);
        localStorage.setItem('notifications', String(checked));
        message.success(`Notifications ${checked ? 'enabled' : 'disabled'}`);
    };

    // ─── Sound ──────────────────────────────────────────────────────────────
    const handleSoundToggle = (checked: boolean) => {
        soundService.setEnabled(checked);
        setSoundEnabled(checked);
        message.success(`Sound ${checked ? 'enabled' : 'disabled'}`);
    };

    const handleVolumeChange = (value: number) => {
        soundService.setVolume(value / 100);
        setSoundVolume(value);
    };

    const handleTestSound = () => {
        soundService.test();
        message.info('🔊 Testing sound...');
    };

    // ─── Compact Mode ──────────────────────────────────────────────────────
    const handleCompactToggle = (checked: boolean) => {
        setCompactMode(checked);
        localStorage.setItem('compactMode', String(checked));
        message.success(`Compact mode ${checked ? 'enabled' : 'disabled'}`);
    };

    // ─── Language ──────────────────────────────────────────────────────────
    const handleLanguageChange = (value: string) => {
        setLanguage(value);
        localStorage.setItem('language', value);
        message.success('Language preference saved');
    };

    // ─── Table Rows ────────────────────────────────────────────────────────
    const handleTableRowsChange = (value: number) => {
        setTableRows(value);
        localStorage.setItem('tableRows', String(value));
        message.success(`Default table rows set to ${value}`);
    };

    // ─── Data Management ──────────────────────────────────────────────────
    const handleClearCache = () => {
        localStorage.removeItem('theme');
        localStorage.removeItem('notifications');
        localStorage.removeItem('sound_enabled');
        localStorage.removeItem('sound_volume');
        localStorage.removeItem('compactMode');
        localStorage.removeItem('language');
        localStorage.removeItem('tableRows');
        message.success('Cache cleared successfully');
    };

    const handleResetSettings = () => {
        // Reset all settings
        setIsDark(false);
        setNotifications(true);
        setSoundEnabled(true);
        setSoundVolume(100);
        setCompactMode(false);
        setLanguage('en');
        setTableRows(10);

        // Apply theme
        document.documentElement.removeAttribute('data-theme');
        document.body.style.backgroundColor = '#E8EEF2';

        // Apply sound
        soundService.setEnabled(true);
        soundService.setVolume(1.0);

        // Clear localStorage
        localStorage.clear();

        message.success('Settings reset to default');
    };

    // ─── Styles ──────────────────────────────────────────────────────────────
    const cardStyle = {
        borderRadius: 12,
        borderColor: 'var(--border-color)',
        background: 'var(--bg-card)',
    };

    const settingItemStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--border-color)',
    };

    const iconWrapperStyle = {
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'var(--bg-surface-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        flexShrink: 0,
    };

    const isDarkMode = isDark;

    return (
        <div>
            {/* ─── HEADER ─────────────────────────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1
                        className="page-title"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <SettingOutlined
                            style={{ color: 'var(--primary)', marginRight: 10 }}
                        />
                        Settings
                    </h1>
                    <p
                        className="page-description"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Customize your application preferences
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Badge dot={isDarkMode}>
                        <Tag
                            color={isDarkMode ? 'default' : 'green'}
                            style={{ padding: '4px 12px' }}
                        >
                            {isDarkMode ? '🌙 Dark' : '☀️ Light'}
                        </Tag>
                    </Badge>
                    <Badge dot={soundEnabled}>
                        <Tag
                            color={soundEnabled ? 'green' : 'default'}
                            style={{ padding: '4px 12px' }}
                        >
                            {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
                        </Tag>
                    </Badge>
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {/* ─── APPEARANCE ────────────────────────────────────────────── */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <EyeOutlined
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Appearance
                                </span>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    {isDarkMode ? (
                                        <MoonFilled
                                            style={{ color: 'var(--warning)' }}
                                        />
                                    ) : (
                                        <SunFilled
                                            style={{ color: 'var(--warning)' }}
                                        />
                                    )}
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Dark Mode
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Switch between light and dark theme
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={isDarkMode}
                                onChange={handleThemeToggle}
                                checkedChildren={<MoonFilled />}
                                unCheckedChildren={<SunFilled />}
                            />
                        </div>

                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <EyeOutlined />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Compact Mode
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Reduce spacing for a denser layout
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={compactMode}
                                onChange={handleCompactToggle}
                            />
                        </div>

                        <div style={{ paddingTop: 12 }}>
                            <div
                                style={{
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    marginBottom: 8,
                                }}
                            >
                                Default Table Rows
                            </div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                    marginBottom: 12,
                                }}
                            >
                                Number of rows per page in tables
                            </div>
                            <Slider
                                min={5}
                                max={50}
                                step={5}
                                value={tableRows}
                                onChange={handleTableRowsChange}
                                marks={{ 5: '5', 10: '10', 25: '25', 50: '50' }}
                                style={{ marginBottom: 8 }}
                            />
                            <Tag
                                color="blue"
                                style={{ fontSize: 13, padding: '2px 12px' }}
                            >
                                {tableRows} rows per page
                            </Tag>
                        </div>

                        <div
                            style={{
                                marginTop: 16,
                                padding: 12,
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 8,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <CheckCircleOutlined
                                    style={{
                                        color: 'var(--success)',
                                        marginRight: 6,
                                    }}
                                />
                                Theme changes apply immediately
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* ─── SOUND NOTIFICATIONS ───────────────────────────────────── */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <SoundFilled
                                    style={{ color: 'var(--primary)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Sound Notifications
                                </span>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    {soundEnabled ? (
                                        <SoundFilled
                                            style={{ color: 'var(--success)' }}
                                        />
                                    ) : (
                                        <SoundOutlined />
                                    )}
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Sound Alerts
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Play sound when receiving notifications
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={soundEnabled}
                                onChange={handleSoundToggle}
                                checkedChildren={<SoundFilled />}
                                unCheckedChildren={<SoundOutlined />}
                            />
                        </div>

                        <Divider
                            style={{
                                margin: '8px 0',
                                borderColor: 'var(--border-color)',
                            }}
                        />

                        <div style={{ padding: '12px 0' }}>
                            <div
                                style={{
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    marginBottom: 8,
                                }}
                            >
                                Volume
                            </div>
                            <Slider
                                min={0}
                                max={100}
                                value={soundVolume}
                                onChange={handleVolumeChange}
                                disabled={!soundEnabled}
                                marks={{ 0: '🔇', 50: '🔊', 100: '🔊' }}
                                style={{ marginBottom: 4 }}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                <span>Mute</span>
                                <span>Loud</span>
                            </div>
                        </div>

                        <Divider
                            style={{
                                margin: '8px 0',
                                borderColor: 'var(--border-color)',
                            }}
                        />

                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <SoundFilled />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Test Sound
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Play a test notification sound
                                    </div>
                                </div>
                            </div>
                            <Button
                                onClick={handleTestSound}
                                icon={<SoundFilled />}
                                disabled={!soundEnabled}
                            >
                                Test
                            </Button>
                        </div>

                        <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 8,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <SoundFilled
                                    style={{
                                        color: 'var(--success)',
                                        marginRight: 6,
                                    }}
                                />
                                Different sounds play for success, error,
                                warning, and info notifications
                            </div>
                        </div>
                    </Card>

                    {/* ─── NOTIFICATIONS ───────────────────────────────────────── */}
                    <Card
                        title={
                            <Space>
                                <BellOutlined
                                    style={{ color: 'var(--warning)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Notifications
                                </span>
                            </Space>
                        }
                        style={{ ...cardStyle, marginTop: 24 }}
                    >
                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <BellOutlined />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Push Notifications
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Receive alerts for bookings and
                                        checkouts
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={notifications}
                                onChange={handleNotificationToggle}
                            />
                        </div>

                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <WifiOutlined />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Real-time Connection
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Status of the real-time notification
                                        service
                                    </div>
                                </div>
                            </div>
                            <Tag color={soundEnabled ? 'green' : 'red'}>
                                {soundEnabled ? 'Connected' : 'Disconnected'}
                            </Tag>
                        </div>
                    </Card>
                </Col>

                {/* ─── LANGUAGE ────────────────────────────────────────────────── */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <GlobalOutlined
                                    style={{ color: 'var(--info)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Language &amp; Region
                                </span>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <div style={{ padding: '4px 0' }}>
                            <div
                                style={{
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    marginBottom: 8,
                                }}
                            >
                                Language
                            </div>
                            <Select
                                value={language}
                                onChange={handleLanguageChange}
                                style={{ width: '100%' }}
                                size="large"
                            >
                                <Select.Option value="en">
                                    🇬🇧 English
                                </Select.Option>
                                <Select.Option value="fil">
                                    🇵🇭 Filipino
                                </Select.Option>
                                <Select.Option value="ceb">
                                    🇵🇭 Cebuano
                                </Select.Option>
                            </Select>
                        </div>
                    </Card>
                </Col>

                {/* ─── DATA & PRIVACY ─────────────────────────────────────────── */}
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <LockOutlined
                                    style={{ color: 'var(--danger)' }}
                                />
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Data &amp; Privacy
                                </span>
                            </Space>
                        }
                        style={cardStyle}
                    >
                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <DeleteOutlined />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Clear Cache
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Remove all saved preferences and
                                        settings
                                    </div>
                                </div>
                            </div>
                            <Button onClick={handleClearCache} danger>
                                Clear Cache
                            </Button>
                        </div>

                        <div style={settingItemStyle}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <div style={iconWrapperStyle}>
                                    <ReloadOutlined />
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        Reset All Settings
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Restore default settings (light theme,
                                        sound on, English)
                                    </div>
                                </div>
                            </div>
                            <Button
                                danger
                                type="primary"
                                onClick={handleResetSettings}
                            >
                                Reset
                            </Button>
                        </div>

                        <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 8,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <SafetyOutlined
                                    style={{
                                        color: 'var(--success)',
                                        marginRight: 6,
                                    }}
                                />
                                Your settings are stored locally in your browser
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Settings;
