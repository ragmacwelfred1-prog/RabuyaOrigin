// resources/js/pages/ParkingSlots.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    Select,
    Card,
    Space,
    Tag,
    message,
    Row,
    Col,
    Tooltip,
    Progress,
    Spin,
    Alert,
    Badge,
    Descriptions,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    CarOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ToolOutlined,
    ReloadOutlined,
    EnvironmentOutlined,
    DollarOutlined,
    SaveOutlined,
    UnorderedListOutlined,
    ApiOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    SyncOutlined,
    ThunderboltOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { ParkingMap3D } from '../components/3DParkingMap';

dayjs.extend(isBetween);

const { Option } = Select;

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface ParkingSlot {
    id: number;
    slot_number: string;
    status: 'available' | 'occupied' | 'maintenance';
    nightly_rate: number;
    created_at?: string;
    updated_at?: string;
}

interface Booking {
    id: number;
    parking_slot_id: number;
    status: string;
    check_in_date: string;
    check_out_date: string;
}

interface ActiveTransaction {
    id: number;
    parking_slot_id?: number;
    parking_slot?: { id: number };
    booking?: { parking_slot_id: number };
}

interface SlotBookingInfo {
    booking_id: number;
    booking_type: 'walk_in' | 'online';
    status: string;
    is_checked_in: boolean;
    check_in_date: string;
    check_out_date: string;
    customer: { name: string; phone?: string; email?: string } | null;
    vehicle: { plate_number: string; vehicle_model: string } | null;
    checked_in_by: string | null;
    approved_by: string | null;
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    available: {
        color: 'success',
        tagColor: 'success',
        icon: <CheckCircleOutlined />,
        label: 'Available',
        description: 'Ready for booking',
        emoji: '✅',
    },
    occupied: {
        color: 'warning',
        tagColor: 'warning',
        icon: <CarOutlined />,
        label: 'Occupied',
        description: 'Currently in use',
        emoji: '🚗',
    },
    maintenance: {
        color: 'error',
        tagColor: 'error',
        icon: <ToolOutlined />,
        label: 'Maintenance',
        description: 'Temporarily unavailable',
        emoji: '🔧',
    },
} as const;

// ─── Helper Functions ──────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(amount || 0);

const getStatusTag = (status: string, realStatus?: string) => {
    const effectiveStatus = realStatus || status;
    const cfg = STATUS_CONFIG[effectiveStatus as keyof typeof STATUS_CONFIG];
    if (!cfg) return <Tag color="default">{effectiveStatus}</Tag>;
    return (
        <Tag
            icon={cfg.icon}
            color={cfg.tagColor}
            style={{ fontSize: 13, padding: '2px 12px' }}
        >
            {cfg.emoji} {cfg.label}
        </Tag>
    );
};

// Sort numeric segment inside slot_number
const slotNumericValue = (slot_number: string): number => {
    const m = (slot_number || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
};

// ─── Component ──────────────────────────────────────────────────────────────────

const ParkingSlots: React.FC = () => {
    const navigate = useNavigate();

    const [slots, setSlots] = useState<ParkingSlot[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [activeTransactions, setActiveTransactions] = useState<
        ActiveTransaction[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingSlot, setEditingSlot] = useState<ParkingSlot | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | '3d'>('table');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // ✅ Remount key for the 3D map — bump on every fetch so new slots appear
    const [mapKey, setMapKey] = useState(0);

    // ✅ Slot details modal state
    const [detailsSlot, setDetailsSlot] = useState<ParkingSlot | null>(null);
    const [slotBookings, setSlotBookings] = useState<SlotBookingInfo[]>([]);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const userType = localStorage.getItem('user_type');
    const isAdmin = userType === 'admin';

    // ─── Fetch Data ─────────────────────────────────────────────────────────────

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        try {
            setLoading(true);

            const [slotsRes, bookingsRes, activeRes] = await Promise.all([
                api.get('/parking-slots'),
                api.get('/admin/bookings'),
                api.get('/staff/parking/active'),
            ]);

            const slotsData = (slotsRes.data || []).sort(
                (a: ParkingSlot, b: ParkingSlot) =>
                    slotNumericValue(a.slot_number) -
                    slotNumericValue(b.slot_number),
            );

            setSlots(slotsData);
            setBookings(bookingsRes.data || []);
            setActiveTransactions(activeRes.data || []);

            // ✅ Force 3D map remount so new slots are drawn immediately.
            setMapKey((k) => k + 1);
        } catch (error) {
            console.error('Error fetching data:', error);
            message.error('Failed to load parking data');
        } finally {
            setLoading(false);
        }
    };

    // ─── Real-Time Status Check ─────────────────────────────────────────────────

    const getRealStatus = (
        slot: ParkingSlot,
    ): 'available' | 'occupied' | 'maintenance' => {
        if (slot.status === 'maintenance') {
            return 'maintenance';
        }

        const today = dayjs();

        const isActive = activeTransactions.some((tx) => {
            const slotId =
                tx.parking_slot_id ||
                tx.parking_slot?.id ||
                tx.booking?.parking_slot_id;
            return slotId === slot.id;
        });

        if (isActive) {
            return 'occupied';
        }

        const hasBookingToday = bookings.some((booking) => {
            if (booking.parking_slot_id !== slot.id) return false;
            if (!['pending', 'approved'].includes(booking.status)) return false;

            const checkIn = dayjs(booking.check_in_date);
            const checkOut = dayjs(booking.check_out_date);

            return today.isBetween(checkIn, checkOut, 'day', '[]');
        });

        if (hasBookingToday) {
            return 'occupied';
        }

        return 'available';
    };

    // ─── Open Slot Details ──────────────────────────────────────────────────────

    const openSlotDetails = async (slot: ParkingSlot) => {
        setDetailsSlot(slot);
        setSlotBookings([]);
        setDetailsLoading(true);
        try {
            const r = await api.get(`/admin/parking-slots/${slot.id}/details`);
            setSlotBookings(r.data?.bookings ?? []);
        } catch {
            message.error('Failed to load slot details');
        } finally {
            setDetailsLoading(false);
        }
    };

    // ─── Book Now Handler ───────────────────────────────────────────────────────

    const handleBookNow = (slot: ParkingSlot) => {
        const realStatus = getRealStatus(slot);

        if (realStatus === 'maintenance') {
            message.warning(
                `Slot ${slot.slot_number} is under maintenance and cannot be booked.`,
            );
            return;
        }

        if (realStatus === 'occupied') {
            message.warning(
                `Slot ${slot.slot_number} is currently occupied. Please choose another slot.`,
            );
            return;
        }

        navigate('/customers', {
            state: {
                openCheckIn: true,
                slotId: slot.id,
                slotNumber: slot.slot_number,
                nightlyRate: slot.nightly_rate,
                timestamp: Date.now(),
            },
        });
    };

    // ─── Sync Slots Status ──────────────────────────────────────────────────────

    const syncSlotStatuses = async () => {
        if (!isAdmin) {
            message.warning('Only administrators can sync slot statuses');
            return;
        }

        setSyncing(true);
        try {
            const activeBookings = bookings.filter((b) => {
                if (!['pending', 'approved'].includes(b.status)) return false;
                const checkIn = dayjs(b.check_in_date);
                const checkOut = dayjs(b.check_out_date);
                return dayjs().isBetween(checkIn, checkOut, 'day', '[]');
            });

            const activeSlotIds = activeTransactions
                .map(
                    (tx) =>
                        tx.parking_slot_id ||
                        tx.parking_slot?.id ||
                        tx.booking?.parking_slot_id,
                )
                .filter(Boolean);

            const bookedSlotIds = activeBookings
                .map((b) => b.parking_slot_id)
                .filter(Boolean);

            const occupiedSlotIds = [
                ...new Set([...activeSlotIds, ...bookedSlotIds]),
            ];

            const updatePromises = slots.map(async (slot) => {
                if (slot.status === 'maintenance') return;

                const shouldBeOccupied = occupiedSlotIds.includes(slot.id);
                const currentStatus = slot.status;
                const newStatus = shouldBeOccupied ? 'occupied' : 'available';

                if (currentStatus !== newStatus) {
                    await api.put(`/parking-slots/${slot.id}`, {
                        slot_number: slot.slot_number,
                        nightly_rate: slot.nightly_rate,
                        status: newStatus,
                    });
                }
            });

            await Promise.all(updatePromises);

            message.success(
                "Slots synced successfully with today's bookings!",
            );
            await fetchAllData();
        } catch (error) {
            console.error('Sync error:', error);
            message.error('Failed to sync slot statuses');
        } finally {
            setSyncing(false);
        }
    };

    // ─── CRUD Handlers ──────────────────────────────────────────────────────────

    const handleAdd = () => {
        if (!isAdmin) {
            message.warning('Only administrators can add parking slots');
            return;
        }
        setEditingSlot(null);
        form.resetFields();
        form.setFieldsValue({ status: 'available', nightly_rate: 250 });
        setModalVisible(true);
    };

    const handleEdit = (slot: ParkingSlot) => {
        if (!isAdmin) {
            message.warning('Only administrators can edit parking slots');
            return;
        }
        setEditingSlot(slot);
        form.setFieldsValue({
            slot_number: slot.slot_number,
            nightly_rate: slot.nightly_rate,
            status: slot.status,
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        if (!isAdmin) {
            message.warning('Only administrators can delete parking slots');
            return;
        }

        setDeletingId(id);
        try {
            await api.delete(`/parking-slots/${id}`);
            message.success('Parking slot deleted successfully');
            await fetchAllData();
        } catch (error: any) {
            const errorMsg =
                error.response?.data?.message ||
                'Failed to delete parking slot';
            message.error(errorMsg);
        } finally {
            setDeletingId(null);
        }
    };

    const handleSubmit = async (values: any) => {
        const data = {
            slot_number: values.slot_number.trim().toUpperCase(),
            nightly_rate: parseFloat(values.nightly_rate),
            status: values.status,
        };

        setSubmitting(true);
        try {
            if (editingSlot) {
                await api.put(`/parking-slots/${editingSlot.id}`, data);
                message.success('Parking slot updated successfully');
            } else {
                await api.post('/parking-slots', data);
                message.success('Parking slot created successfully');
            }
            setModalVisible(false);
            form.resetFields();
            await fetchAllData();
        } catch (error: any) {
            const errorMsg =
                error.response?.data?.message ||
                error.response?.data?.error ||
                'Failed to save parking slot';
            message.error(errorMsg);
            await fetchAllData();
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Computed Values ────────────────────────────────────────────────────────

    const realOccupiedCount = slots.filter(
        (s) => getRealStatus(s) === 'occupied',
    ).length;
    const realAvailableCount = slots.filter(
        (s) => getRealStatus(s) === 'available',
    ).length;
    const maintenanceCount = slots.filter(
        (s) => s.status === 'maintenance',
    ).length;
    const totalSlots = slots.length;
    const realOccupancyRate =
        totalSlots > 0 ? (realOccupiedCount / totalSlots) * 100 : 0;

    // ─── Table Columns ──────────────────────────────────────────────────────────

    const columns = [
        {
            title: 'Slot Number',
            dataIndex: 'slot_number',
            key: 'slot_number',
            width: 160,
            render: (text: string, record: ParkingSlot) => {
                const realStatus = getRealStatus(record);
                const cfg = STATUS_CONFIG[realStatus];
                return (
                    <Space>
                        <EnvironmentOutlined
                            style={{
                                color: `var(--${cfg?.color})`,
                                fontSize: 18,
                            }}
                        />
                        <span
                            style={{
                                fontWeight: 600,
                                fontSize: 15,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {text}
                        </span>
                    </Space>
                );
            },
        },
        {
            title: "Today's Status",
            key: 'today_status',
            width: 180,
            render: (_: any, record: ParkingSlot) => {
                const realStatus = getRealStatus(record);
                const storedStatus = record.status;

                const isMismatch =
                    realStatus !== storedStatus &&
                    storedStatus !== 'maintenance';

                return (
                    <Space>
                        {getStatusTag(record.status, realStatus)}
                        {isMismatch && (
                            <Tooltip
                                title={`Stored status is "${storedStatus}" but today it's "${realStatus}" based on bookings`}
                            >
                                <Badge
                                    count="!"
                                    style={{
                                        backgroundColor: 'var(--warning)',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        boxShadow:
                                            '0 2px 4px rgba(245, 158, 11, 0.3)',
                                    }}
                                />
                            </Tooltip>
                        )}
                        {record.status === 'maintenance' && (
                            <Tooltip title="This slot is permanently marked as maintenance">
                                <ExclamationCircleOutlined
                                    style={{
                                        color: 'var(--danger)',
                                        fontSize: 14,
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Space>
                );
            },
            filters: [
                { text: ' Available', value: 'available' },
                { text: ' Occupied', value: 'occupied' },
                { text: ' Maintenance', value: 'maintenance' },
            ],
            onFilter: (value: any, record: ParkingSlot) => {
                const realStatus = getRealStatus(record);
                return realStatus === value;
            },
        },
        {
            title: 'Stored Status',
            dataIndex: 'status',
            key: 'stored_status',
            width: 140,
            render: (status: string, record: ParkingSlot) => {
                const realStatus = getRealStatus(record);
                const isMismatch =
                    realStatus !== status && status !== 'maintenance';
                return (
                    <Space>
                        <Tag
                            color={
                                status === 'maintenance' ? 'error' : 'default'
                            }
                            style={{ fontSize: 12 }}
                        >
                            {status === 'maintenance'
                                ? '🔧 Maintenance'
                                : status}
                        </Tag>
                        {isMismatch && (
                            <Tooltip title="Out of sync with today's bookings. Click 'Sync Status' to fix.">
                                <SyncOutlined
                                    style={{
                                        color: 'var(--warning)',
                                        fontSize: 12,
                                    }}
                                    spin
                                />
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Nightly Rate',
            dataIndex: 'nightly_rate',
            key: 'nightly_rate',
            width: 160,
            align: 'right' as const,
            render: (rate: number) => (
                <Space>
                    <DollarOutlined style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                        {formatCurrency(rate)}
                    </span>
                </Space>
            ),
            sorter: (a: ParkingSlot, b: ParkingSlot) =>
                a.nightly_rate - b.nightly_rate,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 280,
            render: (_: any, record: ParkingSlot) => {
                const realStatus = getRealStatus(record);
                const canBook = realStatus === 'available';

                return (
                    <Space size="small">
                        <Tooltip title="View bookings & details">
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openSlotDetails(record);
                                }}
                                style={{
                                    color: 'var(--primary)',
                                    border: 'none',
                                    background: 'transparent',
                                    boxShadow: 'none',
                                }}
                                className="action-btn"
                            />
                        </Tooltip>

                        <Tooltip
                            title={
                                realStatus === 'maintenance'
                                    ? 'Under maintenance — cannot book'
                                    : realStatus === 'occupied'
                                      ? 'Occupied — choose another slot'
                                      : `Book Slot ${record.slot_number} now`
                            }
                        >
                            <Button
                                type="primary"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleBookNow(record);
                                }}
                                disabled={!canBook}
                                style={{
                                    borderRadius: 6,
                                    background: canBook
                                        ? 'var(--success)'
                                        : undefined,
                                    borderColor: canBook
                                        ? 'var(--success)'
                                        : undefined,
                                    fontWeight: 600,
                                }}
                            >
                                Book Now
                            </Button>
                        </Tooltip>

                        {isAdmin && (
                            <>
                                <Tooltip title="Edit Slot">
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<EditOutlined />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(record);
                                        }}
                                        style={{
                                            color: 'var(--primary)',
                                            border: 'none',
                                            background: 'transparent',
                                            boxShadow: 'none',
                                        }}
                                        className="action-btn"
                                    />
                                </Tooltip>
                                <Tooltip
                                    title={
                                        record.status === 'occupied'
                                            ? 'Cannot delete occupied slot'
                                            : 'Delete Slot'
                                    }
                                >
                                    <Button
                                        type="text"
                                        size="small"
                                        loading={deletingId === record.id}
                                        icon={<CloseCircleOutlined />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(record.id);
                                        }}
                                        disabled={
                                            record.status === 'occupied'
                                        }
                                        style={{
                                            color:
                                                record.status === 'occupied'
                                                    ? 'var(--text-tertiary)'
                                                    : 'var(--danger)',
                                            border: 'none',
                                            background: 'transparent',
                                            boxShadow: 'none',
                                        }}
                                        className="action-btn"
                                    />
                                </Tooltip>
                            </>
                        )}
                    </Space>
                );
            },
        },
    ];

    // ─── Render ──────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading parking slots..." />
            </div>
        );
    }

    const statCardBodyStyle: React.CSSProperties = {
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '16px 20px',
    };

    return (
        <div>
            {/* ─── HEADER ─────────────────────────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <CarOutlined
                            style={{ color: 'var(--primary)', marginRight: 10 }}
                        />
                        Parking Slots
                    </h1>
                    <p className="page-description">
                        Monitor parking slot availability.{' '}
                        <strong>Today's status</strong> shows real occupancy
                        from bookings.
                    </p>
                </div>
                <Space>
                    <Button.Group>
                        <Button
                            type={viewMode === 'table' ? 'primary' : 'default'}
                            icon={<UnorderedListOutlined />}
                            onClick={() => setViewMode('table')}
                            style={{ borderRadius: '6px 0 0 6px' }}
                        >
                            Table
                        </Button>
                        <Button
                            type={viewMode === '3d' ? 'primary' : 'default'}
                            icon={<ApiOutlined />}
                            onClick={() => setViewMode('3d')}
                            style={{ borderRadius: '0 6px 6px 0' }}
                        >
                            3D Map
                        </Button>
                    </Button.Group>
                    {isAdmin && (
                        <Tooltip title="Update slot statuses based on today's bookings">
                            <Button
                                icon={<SyncOutlined spin={syncing} />}
                                onClick={syncSlotStatuses}
                                loading={syncing}
                                style={{ color: 'var(--primary)' }}
                            >
                                Sync Status
                            </Button>
                        </Tooltip>
                    )}
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchAllData}
                        loading={loading}
                    />
                    {isAdmin && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAdd}
                        >
                            Add Slot
                        </Button>
                    )}
                </Space>
            </div>

            {/* ─── ALERTS ──────────────────────────────────────────────────────── */}
            {maintenanceCount > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<ToolOutlined />}
                    style={{ marginBottom: 12, borderRadius: 8 }}
                    message={
                        <span>
                            <strong>
                                {maintenanceCount} slot(s) under maintenance
                            </strong>
                            <span
                                style={{
                                    marginLeft: 12,
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                These slots are temporarily unavailable
                            </span>
                        </span>
                    }
                />
            )}

            {slots.some((s) => {
                const real = getRealStatus(s);
                return real !== s.status && s.status !== 'maintenance';
            }) &&
                isAdmin && (
                    <Alert
                        type="info"
                        showIcon
                        icon={<SyncOutlined />}
                        style={{ marginBottom: 12, borderRadius: 8 }}
                        message={
                            <span>
                                <strong>📌 Status Mismatch Detected</strong>
                                <span
                                    style={{
                                        marginLeft: 12,
                                        fontSize: 12,
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    Some slots show different statuses than
                                    today's actual occupancy. Click{' '}
                                    <strong>"Sync Status"</strong> to update.
                                </span>
                            </span>
                        }
                    />
                )}

            {/* ─── STAT CARDS ────────────────────────────────────────────────── */}
            <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-primary"
                        bodyStyle={statCardBodyStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Slots
                                </div>
                                <div
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {totalSlots}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    Registered parking slots
                                </div>
                            </div>
                            <EnvironmentOutlined
                                style={{
                                    color: 'var(--primary)',
                                    fontSize: 28,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-success"
                        bodyStyle={statCardBodyStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Available Today
                                </div>
                                <div
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: 'var(--success)',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {realAvailableCount}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    Based on today's bookings
                                </div>
                            </div>
                            <CheckCircleOutlined
                                style={{
                                    color: 'var(--success)',
                                    fontSize: 28,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-warning"
                        bodyStyle={statCardBodyStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Occupied Today
                                </div>
                                <div
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: 'var(--warning)',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {realOccupiedCount}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    Currently parked or booked
                                </div>
                            </div>
                            <CarOutlined
                                style={{
                                    color: 'var(--warning)',
                                    fontSize: 28,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        className="stat-card stat-card-danger"
                        bodyStyle={statCardBodyStyle}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Maintenance
                                </div>
                                <div
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: 'var(--danger)',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {maintenanceCount}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 12,
                                        marginTop: 4,
                                    }}
                                >
                                    Temporarily unavailable
                                </div>
                            </div>
                            <ToolOutlined
                                style={{
                                    color: 'var(--danger)',
                                    fontSize: 28,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* ─── OCCUPANCY RATE ────────────────────────────────────────────── */}
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    <span
                        style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: 14,
                        }}
                    >
                        <CarOutlined
                            style={{ marginRight: 8, color: 'var(--primary)' }}
                        />
                        Today's Occupancy Rate
                    </span>
                    <span
                        style={{
                            fontWeight: 700,
                            fontSize: 18,
                            color:
                                realOccupancyRate > 80
                                    ? 'var(--danger)'
                                    : realOccupancyRate > 50
                                      ? 'var(--warning)'
                                      : 'var(--success)',
                        }}
                    >
                        {Math.round(realOccupancyRate)}%
                    </span>
                </div>
                <Progress
                    percent={realOccupancyRate}
                    size="default"
                    strokeColor={
                        realOccupancyRate > 80
                            ? 'var(--danger)'
                            : realOccupancyRate > 50
                              ? 'var(--warning)'
                              : 'var(--success)'
                    }
                    showInfo={false}
                    trailColor="var(--border-color)"
                />
                <div
                    style={{
                        display: 'flex',
                        gap: 20,
                        marginTop: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <span
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                        <span
                            style={{ color: 'var(--success)', fontWeight: 600 }}
                        >
                            ●
                        </span>{' '}
                        Available: {realAvailableCount}
                    </span>
                    <span
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                        <span
                            style={{ color: 'var(--warning)', fontWeight: 600 }}
                        >
                            ●
                        </span>{' '}
                        Occupied: {realOccupiedCount}
                    </span>
                    <span
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                        <span
                            style={{ color: 'var(--danger)', fontWeight: 600 }}
                        >
                            ●
                        </span>{' '}
                        Maintenance: {maintenanceCount}
                    </span>
                    {totalSlots > 0 && (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <InfoCircleOutlined style={{ marginRight: 4 }} />
                            {realAvailableCount > 0
                                ? `${realAvailableCount} slot(s) available today`
                                : 'Fully occupied today'}
                        </span>
                    )}
                </div>
            </Card>

            {/* ─── MAIN CONTENT ────────────────────────────────────────────────── */}
            <Card
                title={
                    <Space>
                        {viewMode === 'table' ? (
                            <UnorderedListOutlined
                                style={{ color: 'var(--primary)' }}
                            />
                        ) : (
                            <ApiOutlined style={{ color: 'var(--primary)' }} />
                        )}
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {viewMode === 'table'
                                ? 'Parking Slots'
                                : '3D Parking Map'}
                        </span>
                        <Tag color="blue" style={{ fontSize: 12 }}>
                            {totalSlots} Total
                        </Tag>
                        {slots.some((s) => {
                            const real = getRealStatus(s);
                            return (
                                real !== s.status && s.status !== 'maintenance'
                            );
                        }) && (
                            <Badge
                                count="!"
                                style={{
                                    backgroundColor: 'var(--warning)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                }}
                                title="Some slots are out of sync with today's bookings"
                            />
                        )}
                    </Space>
                }
                style={{ borderRadius: 12 }}
                bodyStyle={{ padding: viewMode === '3d' ? 0 : '16px' }}
            >
                {viewMode === 'table' ? (
                    <Table
                        columns={columns}
                        dataSource={slots}
                        loading={loading}
                        rowKey="id"
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showTotal: (total) => `Total ${total} slots`,
                            size: 'small',
                        }}
                        locale={{
                            emptyText: (
                                <div style={{ padding: '30px 0' }}>
                                    <EnvironmentOutlined
                                        style={{
                                            fontSize: 40,
                                            color: 'var(--text-tertiary)',
                                        }}
                                    />
                                    <div
                                        style={{
                                            marginTop: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        No parking slots found.
                                        {isAdmin &&
                                            ' Click "Add Slot" to create one.'}
                                    </div>
                                </div>
                            ),
                        }}
                        rowClassName={(record) => {
                            const realStatus = getRealStatus(record);
                            if (realStatus === 'maintenance')
                                return 'row-maintenance';
                            if (realStatus === 'occupied')
                                return 'row-occupied';
                            return '';
                        }}
                        size="middle"
                        onRow={(record) => ({
                            onClick: (e) => {
                                if (
                                    (e.target as HTMLElement).closest('button')
                                )
                                    return;
                                openSlotDetails(record);
                            },
                            style: { cursor: 'pointer' },
                        })}
                    />
                ) : (
                    <div style={{ padding: '4px' }}>
                        {/* ✅ key={mapKey} forces a remount whenever slot data
                               changes, so new slots appear immediately and
                               existing slots keep their positions. */}
                        <ParkingMap3D
                            key={mapKey}
                            slots={slots.map((s) => ({
                                ...s,
                                status: getRealStatus(s),
                            }))}
                            onSelectSlot={openSlotDetails}
                        />
                        <div
                            style={{
                                padding: '8px 16px',
                                textAlign: 'center',
                                color: 'var(--text-tertiary)',
                                fontSize: 12,
                                background: 'var(--bg-surface-hover)',
                                borderTop: '1px solid var(--border-color)',
                            }}
                        >
                            <InfoCircleOutlined style={{ marginRight: 4 }} />
                            Click a slot to view its details & bookings
                        </div>
                    </div>
                )}
            </Card>

            {/* ─── ADD/EDIT MODAL ──────────────────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        {editingSlot ? (
                            <EditOutlined style={{ color: 'var(--primary)' }} />
                        ) : (
                            <PlusOutlined style={{ color: 'var(--success)' }} />
                        )}
                        <span
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {editingSlot
                                ? 'Edit Parking Slot'
                                : 'Add New Parking Slot'}
                        </span>
                    </Space>
                }
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={520}
                maskClosable={false}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{ status: 'available', nightly_rate: 250 }}
                >
                    <Form.Item
                        name="slot_number"
                        label="Slot Number"
                        rules={[
                            {
                                required: true,
                                message: 'Please enter slot number',
                            },
                            {
                                pattern: /^[AB]-\d{1,3}$/i,
                                message: 'Use the format A-01 or B-01',
                            },
                            { max: 10, message: 'Cannot exceed 10 characters' },
                        ]}
                        tooltip="Use A-* for left column, B-* for right column. Example: A-01, B-12"
                    >
                        <Input
                            placeholder="e.g., A-01, B-12"
                            size="large"
                            prefix={
                                <EnvironmentOutlined
                                    style={{ color: 'var(--text-tertiary)' }}
                                />
                            }
                            autoFocus
                            style={{
                                borderRadius: 8,
                                textTransform: 'uppercase',
                            }}
                            onChange={(e) => {
                                form.setFieldValue(
                                    'slot_number',
                                    e.target.value.toUpperCase(),
                                );
                            }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="nightly_rate"
                        label="Nightly Rate (₱)"
                        rules={[
                            {
                                required: true,
                                message: 'Please enter nightly rate',
                            },
                            {
                                validator: (_, value) => {
                                    const num = Number(value);
                                    if (
                                        value === '' ||
                                        value === undefined ||
                                        value === null
                                    ) {
                                        return Promise.reject('Required');
                                    }
                                    if (isNaN(num)) {
                                        return Promise.reject(
                                            'Must be a valid number',
                                        );
                                    }
                                    if (num < 0) {
                                        return Promise.reject('Must be ≥ 0');
                                    }
                                    if (num > 10000) {
                                        return Promise.reject(
                                            'Cannot exceed ₱10,000',
                                        );
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                        tooltip="Standard rate per night for this slot"
                    >
                        <Input
                            type="number"
                            placeholder="250"
                            size="large"
                            prefix={
                                <DollarOutlined
                                    style={{ color: 'var(--text-tertiary)' }}
                                />
                            }
                            addonAfter="PHP"
                            step="50"
                            min="0"
                            max="10000"
                            style={{ borderRadius: 8 }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="status"
                        label="Base Status"
                        rules={[
                            { required: true, message: 'Please select status' },
                        ]}
                        tooltip="Available: bookable | Occupied: in use | Maintenance: permanently unavailable"
                        extra={
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                <InfoCircleOutlined /> This is the base
                                status. Today's actual status will be
                                determined by bookings.
                            </span>
                        }
                    >
                        <Select
                            size="large"
                            placeholder="Select status"
                            style={{ borderRadius: 8 }}
                        >
                            <Option value="available">
                                <Space>
                                    <CheckCircleOutlined
                                        style={{ color: 'var(--success)' }}
                                    />
                                    Available — Ready for check-in
                                </Space>
                            </Option>
                            <Option value="occupied">
                                <Space>
                                    <CarOutlined
                                        style={{ color: 'var(--warning)' }}
                                    />
                                    Occupied — Currently in use
                                </Space>
                            </Option>
                            <Option value="maintenance">
                                <Space>
                                    <ToolOutlined
                                        style={{ color: 'var(--danger)' }}
                                    />
                                    Maintenance — Permanently unavailable
                                </Space>
                            </Option>
                        </Select>
                    </Form.Item>

                    {editingSlot && editingSlot.status === 'occupied' && (
                        <Alert
                            type="warning"
                            showIcon
                            icon={<CarOutlined />}
                            style={{ marginBottom: 16, borderRadius: 8 }}
                            message="This slot is currently marked as occupied. Changing status will affect the system."
                        />
                    )}

                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Button
                            onClick={() => {
                                setModalVisible(false);
                                form.resetFields();
                            }}
                            style={{ marginRight: 8, borderRadius: 8 }}
                            size="large"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={submitting}
                            icon={<SaveOutlined />}
                            size="large"
                            style={{ borderRadius: 8 }}
                        >
                            {editingSlot ? 'Update Slot' : 'Create Slot'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* ─── SLOT DETAILS MODAL ──────────────────────────────────────────── */}
            <Modal
                open={!!detailsSlot}
                onCancel={() => setDetailsSlot(null)}
                title={
                    <Space>
                        <EnvironmentOutlined
                            style={{ color: 'var(--primary)' }}
                        />
                        <span>
                            Slot {detailsSlot?.slot_number} — Details
                        </span>
                    </Space>
                }
                footer={[
                    isAdmin && detailsSlot ? (
                        <Button
                            key="edit"
                            icon={<EditOutlined />}
                            onClick={() => {
                                const s = detailsSlot;
                                setDetailsSlot(null);
                                handleEdit(s);
                            }}
                        >
                            Edit Slot
                        </Button>
                    ) : null,
                    <Button
                        key="close"
                        type="primary"
                        onClick={() => setDetailsSlot(null)}
                    >
                        Close
                    </Button>,
                ]}
                width={600}
                destroyOnClose
            >
                {detailsLoading ? (
                    <div style={{ textAlign: 'center', padding: 30 }}>
                        <Spin />
                    </div>
                ) : slotBookings.length === 0 ? (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: 24,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        No booking or active parking for this slot.
                    </div>
                ) : (
                    slotBookings.map((b) => (
                        <Card
                            key={b.booking_id}
                            size="small"
                            style={{ marginBottom: 12 }}
                            title={
                                <Space>
                                    <Tag
                                        color={
                                            b.booking_type === 'online'
                                                ? 'blue'
                                                : 'green'
                                        }
                                    >
                                        {b.booking_type === 'online'
                                            ? '🌐 ONLINE'
                                            : '🚶 WALK-IN'}
                                    </Tag>
                                    {b.is_checked_in ? (
                                        <Tag
                                            color="warning"
                                            icon={<CarOutlined />}
                                        >
                                            Currently Parked
                                        </Tag>
                                    ) : (
                                        <Tag
                                            color={
                                                b.status === 'approved'
                                                    ? 'processing'
                                                    : 'orange'
                                            }
                                        >
                                            {b.status.toUpperCase()}
                                        </Tag>
                                    )}
                                </Space>
                            }
                        >
                            <Descriptions size="small" column={2} bordered>
                                <Descriptions.Item
                                    label="Customer"
                                    span={2}
                                >
                                    {b.customer?.name ?? '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Phone">
                                    {b.customer?.phone ?? '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Email">
                                    {b.customer?.email ?? '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Vehicle">
                                    {b.vehicle?.vehicle_model ?? '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Plate">
                                    {b.vehicle?.plate_number ?? '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Check In">
                                    {dayjs(b.check_in_date).format(
                                        'MMM DD, YYYY h:mm A',
                                    )}
                                </Descriptions.Item>
                                <Descriptions.Item label="Check Out">
                                    {dayjs(b.check_out_date).format(
                                        'MMM DD, YYYY h:mm A',
                                    )}
                                </Descriptions.Item>
                                {b.booking_type === 'walk_in' && (
                                    <Descriptions.Item
                                        label="Checked in by"
                                        span={2}
                                    >
                                        {b.checked_in_by ?? '—'}
                                    </Descriptions.Item>
                                )}
                                {b.booking_type === 'online' && (
                                    <Descriptions.Item
                                        label="Approved by"
                                        span={2}
                                    >
                                        {b.approved_by ?? 'Awaiting approval'}
                                    </Descriptions.Item>
                                )}
                            </Descriptions>
                        </Card>
                    ))
                )}
            </Modal>

            <style>{`
                .action-btn.ant-btn-text {
                    border: none !important;
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 4px 8px !important;
                }

                .action-btn.ant-btn-text:hover {
                    background: var(--bg-surface-hover) !important;
                    border-radius: 4px;
                }

                .row-maintenance td {
                    background: var(--danger-bg) !important;
                    opacity: 0.7;
                }

                .row-maintenance:hover td {
                    background: var(--danger-bg) !important;
                }

                .row-occupied td {
                    background: var(--warning-bg) !important;
                }

                .row-occupied:hover td {
                    background: var(--warning-bg) !important;
                }

                [data-theme="dark"] .row-maintenance td {
                    background: rgba(239, 68, 68, 0.15) !important;
                }

                [data-theme="dark"] .row-occupied td {
                    background: rgba(245, 158, 11, 0.15) !important;
                }

                .ant-modal-content {
                    background: var(--bg-card) !important;
                }

                .ant-modal-header {
                    background: var(--bg-card) !important;
                    border-bottom-color: var(--border-color) !important;
                }

                .ant-modal-title {
                    color: var(--text-primary) !important;
                }

                .ant-modal-close {
                    color: var(--text-secondary) !important;
                }

                .ant-modal-close:hover {
                    color: var(--text-primary) !important;
                }
            `}</style>
        </div>
    );
};

export default ParkingSlots;