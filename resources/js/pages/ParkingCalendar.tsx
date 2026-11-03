// resources/js/pages/ParkingCalendar.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Card,
    Row,
    Col,
    Tag,
    Space,
    Spin,
    message,
    Button,
    Select,
    Typography,
    Empty,
    Modal,
    Descriptions,
    Badge,
    Divider,
} from 'antd';
import {
    CalendarOutlined,
    CarOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    InboxOutlined,
    LeftOutlined,
    RightOutlined,
    InfoCircleOutlined,
    UserOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isBetween from 'dayjs/plugin/isBetween';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import api from '../services/api';

// ─── Extend dayjs ────────────────────────────────────────────────────────────
dayjs.extend(isToday);
dayjs.extend(isBetween);
dayjs.extend(weekOfYear);

const { Text } = Typography;
const { Option } = Select;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Slot {
    id: number;
    slot_number: string;
    status: 'available' | 'occupied' | 'maintenance';
    nightly_rate: number;
}

interface DayInfo {
    date: string;
    day: string;
    dayOfMonth: string;
    isToday: boolean;
    isWeekend: boolean;
}

interface CalendarStatus {
    status: 'available' | 'booked' | 'occupied' | 'maintenance';
    customer_name: string | null;
    booking_id: number | null;
    source: string;
}

interface CalendarData {
    success: boolean;
    month: number;
    year: number;
    month_name: string;
    days: DayInfo[];
    slots: Slot[];
    calendar: Record<string, Record<number, CalendarStatus>>;
    summary: {
        total_slots: number;
        available_today: number;
        booked_today: number;
        occupied_today: number;
        maintenance_today: number;
    };
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    available: {
        label: 'Available',
        color: 'success',
        bg: 'var(--success-bg)',
        border: 'var(--success-border)',
        text: 'var(--success-text)',
        icon: <CheckCircleOutlined />,
        emoji: '✅',
    },
    booked: {
        label: 'Booked',
        color: 'processing',
        bg: 'var(--info-bg)',
        border: 'var(--info-border)',
        text: 'var(--info-text)',
        icon: <ClockCircleOutlined />,
        emoji: '📋',
    },
    occupied: {
        label: 'Occupied',
        color: 'warning',
        bg: 'var(--warning-bg)',
        border: 'var(--warning-border)',
        text: 'var(--warning-text)',
        icon: <CarOutlined />,
        emoji: '🚗',
    },
    maintenance: {
        label: 'Maintenance',
        color: 'error',
        bg: 'var(--danger-bg)',
        border: 'var(--danger-border)',
        text: 'var(--danger-text)',
        icon: <ExclamationCircleOutlined />,
        emoji: '🔧',
    },
};

const getStatusConfig = (status: string) =>
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.available;

const isTodayDate = (date: string) => dayjs(date).isToday();
const formatDate = (date: string) => dayjs(date).format('MMMM D, YYYY');
const formatDayName = (date: string) => dayjs(date).format('dddd');

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Component ────────────────────────────────────────────────────────────────

const ParkingCalendar: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(dayjs().month() + 1);
    const [selectedYear, setSelectedYear] = useState(dayjs().year());

    // Selected date for the detail modal
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    // ─── Fetch Data ──────────────────────────────────────────────────────────

    const fetchCalendar = async () => {
        setLoading(true);
        try {
            const response = await api.get('/admin/parking-calendar', {
                params: { month: selectedMonth, year: selectedYear },
            });

            if (response.data.success) {
                setCalendarData(response.data);
            } else {
                message.error('Failed to load calendar data');
            }
        } catch (error) {
            console.error('Calendar error:', error);
            message.error('Failed to load parking calendar');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, selectedYear]);

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleMonthChange = (offset: number) => {
        const newMonth = selectedMonth + offset;
        if (newMonth > 12) {
            setSelectedMonth(1);
            setSelectedYear(selectedYear + 1);
        } else if (newMonth < 1) {
            setSelectedMonth(12);
            setSelectedYear(selectedYear - 1);
        } else {
            setSelectedMonth(newMonth);
        }
    };

    const goToToday = () => {
        setSelectedMonth(dayjs().month() + 1);
        setSelectedYear(dayjs().year());
    };

    const getSlotStatus = (
        slotId: number,
        date: string,
    ): CalendarStatus | null => {
        if (!calendarData) return null;
        if (!calendarData.calendar[date]) return null;
        return calendarData.calendar[date][slotId] || null;
    };

    // ─── Handle day click → open details modal ──────────────────────────────

    const handleDayClick = (day: DayInfo) => {
        setSelectedDate(day.date);
        setDetailsOpen(true);
    };

    // ─── Slots for the selected date (only booked/occupied/maintenance) ─────

    const selectedDateSlots = useMemo(() => {
        if (!calendarData || !selectedDate) return [];

        return calendarData.slots
            .map((slot) => ({
                slot,
                status: getSlotStatus(slot.id, selectedDate),
            }))
            .filter(
                (item) =>
                    item.status &&
                    item.status.status !== 'available' &&
                    item.status.status !== 'maintenance',
            );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarData, selectedDate]);

    const selectedDateAllSlots = useMemo(() => {
        if (!calendarData || !selectedDate) return [];

        return calendarData.slots.map((slot) => ({
            slot,
            status: getSlotStatus(slot.id, selectedDate),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarData, selectedDate]);

    const selectedDateCounts = useMemo(() => {
        return {
            total: selectedDateAllSlots.length,
            available: selectedDateAllSlots.filter(
                (s) => s.status?.status === 'available',
            ).length,
            booked: selectedDateAllSlots.filter(
                (s) => s.status?.status === 'booked',
            ).length,
            occupied: selectedDateAllSlots.filter(
                (s) => s.status?.status === 'occupied',
            ).length,
            maintenance: selectedDateAllSlots.filter(
                (s) => s.status?.status === 'maintenance',
            ).length,
        };
    }, [selectedDateAllSlots]);

    // ─── Build calendar weeks grid ──────────────────────────────────────────

    const calendarWeeks = useMemo(() => {
        if (!calendarData) return [];

        const firstDay = dayjs(calendarData.days[0]?.date);
        const startWeekday = firstDay.day(); // 0=Sun ... 6=Sat

        const cells: (DayInfo | null)[] = [
            ...Array(startWeekday).fill(null),
            ...calendarData.days,
        ];

        while (cells.length % 7 !== 0) cells.push(null);

        const weeks: (DayInfo | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) {
            weeks.push(cells.slice(i, i + 7));
        }
        return weeks;
    }, [calendarData]);

    // ─── Loading / Empty states ─────────────────────────────────────────────

    if (loading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading parking calendar..." />
            </div>
        );
    }

    if (!calendarData) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <Empty description="No calendar data available" />
            </div>
        );
    }

    const { slots, summary, month_name } = calendarData;

    // ─── Render day cell (simple calendar style) ────────────────────────────

    const renderDayCell = (day: DayInfo | null, cellKey: string) => {
        if (!day) {
            return (
                <div
                    key={cellKey}
                    style={{
                        minHeight: 80,
                        background: 'transparent',
                        border: '1px solid transparent',
                        borderRadius: 8,
                    }}
                />
            );
        }

        // Count booked + occupied for subtle indicator
        const daySlots = slots.map((slot) => getSlotStatus(slot.id, day.date));
        const bookedCount = daySlots.filter(
            (s) => s?.status === 'booked',
        ).length;
        const occupiedCount = daySlots.filter(
            (s) => s?.status === 'occupied',
        ).length;
        const busyCount = bookedCount + occupiedCount;

        const isToday = day.isToday;

        return (
            <div
                key={cellKey}
                onClick={() => handleDayClick(day)}
                style={{
                    minHeight: 80,
                    background: isToday
                        ? 'var(--primary-bg)'
                        : 'var(--bg-surface)',
                    border: isToday
                        ? '2px solid var(--primary)'
                        : '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-surface-hover)';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow =
                        '0 4px 12px var(--shadow-color)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = isToday
                        ? 'var(--primary-bg)'
                        : 'var(--bg-surface)';
                    e.currentTarget.style.borderColor = isToday
                        ? 'var(--primary)'
                        : 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                {/* Day number */}
                <div
                    style={{
                        fontSize: 18,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday
                            ? 'var(--primary)'
                            : day.isWeekend
                              ? 'var(--text-tertiary)'
                              : 'var(--text-primary)',
                    }}
                >
                    {/* FIXED: parseInt removes the leading zero (e.g. "01" -> "1") */}
                    {parseInt(day.dayOfMonth, 10)}
                </div>

                {/* Today label */}
                {isToday && (
                    <div
                        style={{
                            fontSize: 9,
                            color: 'var(--primary)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            marginTop: 2,
                        }}
                    >
                        Today
                    </div>
                )}

                {/* Busy indicator badge */}
                {busyCount > 0 && (
                    <Badge
                        count={busyCount}
                        size="small"
                        style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'var(--warning)',
                            fontSize: 10,
                            boxShadow: 'none',
                        }}
                    />
                )}
            </div>
        );
    };

    // ─── Render ─────────────────────────────────────────────────────────────

    return (
        <div style={{ paddingBottom: 24 }}>
            {/* ─── HEADER ─────────────────────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <CalendarOutlined
                            style={{ color: 'var(--primary)', marginRight: 10 }}
                        />
                        Parking Calendar
                    </h1>
                    <p className="page-description">
                        Click any date to see which customers have booked or
                        occupied slots.
                    </p>
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchCalendar}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        type="primary"
                        onClick={goToToday}
                        disabled={
                            selectedMonth === dayjs().month() + 1 &&
                            selectedYear === dayjs().year()
                        }
                    >
                        <CalendarOutlined /> Today
                    </Button>
                </Space>
            </div>

            {/* ─── SUMMARY STATS ────────────────────────────────────────── */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={12} sm={6}>
                    <Card
                        size="small"
                        style={{ borderRadius: 10, height: '100%' }}
                        styles={{ body: { padding: '12px 16px' } }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Slots
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {summary.total_slots}
                                </div>
                            </div>
                            <InboxOutlined
                                style={{
                                    color: 'var(--primary)',
                                    fontSize: 20,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card
                        size="small"
                        style={{ borderRadius: 10, height: '100%' }}
                        styles={{ body: { padding: '12px 16px' } }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Available Today
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                    }}
                                >
                                    {summary.available_today}
                                </div>
                            </div>
                            <CheckCircleOutlined
                                style={{
                                    color: 'var(--success)',
                                    fontSize: 20,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card
                        size="small"
                        style={{ borderRadius: 10, height: '100%' }}
                        styles={{ body: { padding: '12px 16px' } }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Booked / Occupied
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: 'var(--warning)',
                                    }}
                                >
                                    {summary.booked_today +
                                        summary.occupied_today}
                                </div>
                            </div>
                            <CarOutlined
                                style={{
                                    color: 'var(--warning)',
                                    fontSize: 20,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card
                        size="small"
                        style={{ borderRadius: 10, height: '100%' }}
                        styles={{ body: { padding: '12px 16px' } }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Maintenance
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: 'var(--danger)',
                                    }}
                                >
                                    {summary.maintenance_today}
                                </div>
                            </div>
                            <ExclamationCircleOutlined
                                style={{ color: 'var(--danger)', fontSize: 20 }}
                            />
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* ─── LEGEND ────────────────────────────────────────────────── */}
            <Card
                size="small"
                style={{ marginBottom: 16, borderRadius: 10 }}
                styles={{ body: { padding: '10px 16px' } }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: 20,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                    }}
                >
                    <Text
                        strong
                        style={{ color: 'var(--text-secondary)', fontSize: 12 }}
                    >
                        📌 Legend:
                    </Text>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <div
                            key={key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <div
                                style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    background: config.bg,
                                    border: `1px solid ${config.border}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                }}
                            >
                                {config.emoji}
                            </div>
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {config.label}
                            </span>
                        </div>
                    ))}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginLeft: 'auto',
                        }}
                    >
                        <Badge
                            count={3}
                            size="small"
                            style={{
                                backgroundColor: 'var(--warning)',
                                boxShadow: 'none',
                            }}
                        />
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Booked/Occupied count
                        </span>
                    </div>
                </div>
            </Card>

            {/* ─── CALENDAR ──────────────────────────────────────────────── */}
            <Card
                style={{ borderRadius: 12, overflow: 'hidden' }}
                styles={{ body: { padding: 16 } }}
            >
                {/* Month navigation */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    <Space>
                        <Button
                            icon={<LeftOutlined />}
                            onClick={() => handleMonthChange(-1)}
                        />
                        <Text
                            strong
                            style={{
                                fontSize: 18,
                                color: 'var(--text-primary)',
                                minWidth: 160,
                                textAlign: 'center',
                            }}
                        >
                            {month_name}
                        </Text>
                        <Button
                            icon={<RightOutlined />}
                            onClick={() => handleMonthChange(1)}
                        />
                    </Space>
                    <Space>
                        <Select
                            value={selectedMonth}
                            onChange={(val) => setSelectedMonth(val)}
                            style={{ width: 100 }}
                            size="small"
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (m) => (
                                    <Option key={m} value={m}>
                                        {dayjs().month(m - 1).format('MMM')}
                                    </Option>
                                ),
                            )}
                        </Select>
                        <Select
                            value={selectedYear}
                            onChange={(val) => setSelectedYear(val)}
                            style={{ width: 85 }}
                            size="small"
                        >
                            {Array.from(
                                { length: 5 },
                                (_, i) => dayjs().year() - 2 + i,
                            ).map((y) => (
                                <Option key={y} value={y}>
                                    {y}
                                </Option>
                            ))}
                        </Select>
                    </Space>
                </div>

                {/* Weekday header */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        gap: 8,
                        marginBottom: 8,
                    }}
                >
                    {WEEKDAY_LABELS.map((label, i) => (
                        <div
                            key={label}
                            style={{
                                textAlign: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                    i === 0 || i === 6
                                        ? 'var(--text-tertiary)'
                                        : 'var(--text-secondary)',
                                textTransform: 'uppercase',
                                padding: '6px 0',
                                letterSpacing: 0.5,
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {/* Weeks grid */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {calendarWeeks.map((week, wi) => (
                        <div
                            key={`week-${wi}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(7, 1fr)',
                                gap: 8,
                            }}
                        >
                            {week.map((day, di) =>
                                renderDayCell(day, `day-${wi}-${di}`),
                            )}
                        </div>
                    ))}
                </div>
            </Card>

            {/* ─── DAY DETAILS MODAL ─────────────────────────────────────── */}
            <Modal
                open={detailsOpen && !!selectedDate}
                onCancel={() => setDetailsOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailsOpen(false)}>
                        Close
                    </Button>,
                ]}
                width={640}
                centered
                title={
                    selectedDate ? (
                        <Space>
                            <CalendarOutlined
                                style={{ color: 'var(--primary)' }}
                            />
                            <span style={{ fontWeight: 600 }}>
                                {formatDate(selectedDate)}
                            </span>
                            <Text
                                type="secondary"
                                style={{ fontSize: 12, fontWeight: 400 }}
                            >
                                ({formatDayName(selectedDate)}
                                {isTodayDate(selectedDate) && ' • Today'})
                            </Text>
                        </Space>
                    ) : null
                }
            >
                {selectedDate && (
                    <>
                        {/* Counts summary */}
                        <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
                            <Col span={6}>
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: 'var(--success-bg)',
                                        border: '1px solid var(--success-border)',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: 'var(--success-text)',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Available
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: 'var(--success)',
                                        }}
                                    >
                                        {selectedDateCounts.available}
                                    </div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: 'var(--info-bg)',
                                        border: '1px solid var(--info-border)',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: 'var(--info-text)',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Booked
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: 'var(--info)',
                                        }}
                                    >
                                        {selectedDateCounts.booked}
                                    </div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: 'var(--warning-bg)',
                                        border: '1px solid var(--warning-border)',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: 'var(--warning-text)',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Occupied
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: 'var(--warning)',
                                        }}
                                    >
                                        {selectedDateCounts.occupied}
                                    </div>
                                </div>
                            </Col>
                            <Col span={6}>
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: 'var(--danger-bg)',
                                        border: '1px solid var(--danger-border)',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: 'var(--danger-text)',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Maint.
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: 'var(--danger)',
                                        }}
                                    >
                                        {selectedDateCounts.maintenance}
                                    </div>
                                </div>
                            </Col>
                        </Row>

                        <Divider style={{ margin: '12px 0' }}>
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'uppercase',
                                    fontWeight: 600,
                                }}
                            >
                                Bookings & Occupants
                            </span>
                        </Divider>

                        {/* Booked/occupied slots */}
                        {selectedDateSlots.length > 0 ? (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    maxHeight: 400,
                                    overflowY: 'auto',
                                }}
                            >
                                {selectedDateSlots.map(
                                    ({ slot, status }) => {
                                        if (!status) return null;
                                        const config = getStatusConfig(
                                            status.status,
                                        );
                                        return (
                                            <div
                                                key={slot.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    padding: '10px 12px',
                                                    borderRadius: 8,
                                                    background:
                                                        'var(--bg-surface)',
                                                    border: `1px solid ${config.border}`,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: 8,
                                                        background: config.bg,
                                                        border: `1px solid ${config.border}`,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent:
                                                            'center',
                                                        fontSize: 20,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {config.emoji}
                                                </div>
                                                <div
                                                    style={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 14,
                                                            fontWeight: 700,
                                                            color: 'var(--text-primary)',
                                                        }}
                                                    >
                                                        Slot {slot.slot_number}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 12,
                                                            color: 'var(--text-secondary)',
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        <UserOutlined
                                                            style={{
                                                                marginRight: 4,
                                                            }}
                                                        />
                                                        {status.customer_name ||
                                                            'Unknown customer'}
                                                    </div>
                                                </div>
                                                <Tag
                                                    color={config.color}
                                                    icon={config.icon}
                                                    style={{
                                                        margin: 0,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {config.label}
                                                </Tag>
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        ) : (
                            <Empty
                                description="No bookings or occupants on this date"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                style={{ margin: '20px 0' }}
                            />
                        )}

                        {/* Available slots hint */}
                        {selectedDateSlots.length === 0 &&
                            selectedDateCounts.available > 0 && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        background: 'var(--success-bg)',
                                        border: '1px solid var(--success-border)',
                                        fontSize: 13,
                                        color: 'var(--success-text)',
                                        textAlign: 'center',
                                    }}
                                >
                                    ✅ All {selectedDateCounts.available} slot
                                    {selectedDateCounts.available > 1
                                        ? 's are'
                                        : ' is'}{' '}
                                    available on this date.
                                </div>
                            )}
                    </>
                )}
            </Modal>

            {/* ─── TIPS ─────────────────────────────────────────────────── */}
            <Card
                size="small"
                style={{
                    marginTop: 16,
                    borderRadius: 10,
                    background: 'var(--info-bg)',
                    borderColor: 'var(--info-border)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                    }}
                >
                    <InfoCircleOutlined style={{ color: 'var(--info-text)' }} />
                    <span style={{ color: 'var(--info-text)', fontSize: 13 }}>
                        <strong>💡 Tip:</strong> I-click ang anumang numero sa
                        calendar para makita kung sino ang may booking o
                        occupied na slot sa araw na iyon. Ang badge sa kanang
                        taas ng bawat araw ay nagpapakita kung ilan ang
                        booked/occupied.
                    </span>
                </div>
            </Card>
        </div>
    );
};

export default ParkingCalendar;