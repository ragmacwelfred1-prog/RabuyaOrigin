// resources/js/components/3DParkingMap.tsx
import React, {
    useState,
    useMemo,
    useRef,
    useEffect,
    useCallback,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Text,
    Box,
    Plane,
    Cylinder,
    Cone,
    Sphere,
    Billboard,
    Html,
    Stars,
} from '@react-three/drei';
import {
    Button,
    Modal,
    message,
    Tag,
    Space,
    Form,
    Input,
    Select,
    DatePicker,
    TimePicker,
    Row,
    Col,
    Alert,
    Tooltip,
} from 'antd';
import {
    ThunderboltOutlined,
    CheckCircleOutlined,
    CarOutlined,
    DollarOutlined,
    LoginOutlined,
    UserOutlined,
    SearchOutlined,
    AimOutlined,
    EyeOutlined,
    VideoCameraOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

const { Option } = Select;

// ─── Interfaces ─────────────────────────────────────────────────────────────

type SlotStatus = 'available' | 'occupied' | 'maintenance';

interface ParkingSlot {
    id: number;
    slot_number: string;
    status: SlotStatus;
    nightly_rate: number;
}

interface Customer {
    id: number;
    first_name: string;
    middle_name?: string;
    last_name: string;
    phone_number: string;
    email?: string;
    address?: string;
    plate_number?: string;
    vehicle_model?: string;
}

interface Props {
    slots: ParkingSlot[];
    onSelectSlot?: (slot: ParkingSlot) => void;
    onCheckInSuccess?: () => void;
}

interface CameraView {
    position: [number, number, number];
    target: [number, number, number];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const getSlotNumber = (slot: ParkingSlot): number => {
    const match = slot.slot_number.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
};

const isLeftSlot = (slot: ParkingSlot): boolean => {
    return slot.slot_number.toUpperCase().startsWith('A');
};

const calculateNights = (checkIn: string, checkOut: string): number => {
    return Math.max(
        1,
        dayjs(checkOut)
            .startOf('day')
            .diff(dayjs(checkIn).startOf('day'), 'day'),
    );
};

const fmtPHP = (n?: number | null): string => {
    if (n === undefined || n === null) return '₱0.00';
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(n);
};

const STATUS_COLOR: Record<SlotStatus, string> = {
    available: '#10B981',
    occupied: '#F59E0B',
    maintenance: '#EF4444',
};

const STATUS_LABEL: Record<SlotStatus, string> = {
    available: 'Available',
    occupied: 'Occupied',
    maintenance: 'Maintenance',
};

const CAR_COLORS = [
    '#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED',
    '#DB2777', '#0891B2', '#EA580C', '#64748B', '#E5E7EB',
];

const pickCarColor = (id: number): string =>
    CAR_COLORS[Math.abs(id) % CAR_COLORS.length];

// Deterministic pseudo-random in [0,1) so cars look natural but never "jump"
const seeded = (id: number, salt = 1): number => {
    const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

// Geometry constants shared by layout + scene
const SLOT_W = 1.6;
const SLOT_L = 2.8;
const AISLE_W = 2.4;
const SLOT_MARGIN = 0.4;
const ROW_SPACING = 3.0;

// Lazily-built hazard-stripe texture for maintenance bays (client only)
let hazardTexture: THREE.CanvasTexture | null = null;
const getHazardTexture = (): THREE.CanvasTexture | null => {
    if (hazardTexture) return hazardTexture;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#7F1D1D';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#FCA5A5';
    g.lineWidth = 14;
    for (let i = -128; i < 256; i += 32) {
        g.beginPath();
        g.moveTo(i, 128);
        g.lineTo(i + 128, 0);
        g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.5, 2.5);
    t.anisotropy = 4;
    hazardTexture = t;
    return t;
};

// ─── 3D Car ─────────────────────────────────────────────────────────────────

type CarKind = 'sedan' | 'suv' | 'hatch';

const CAR_SPECS: Record<
    CarKind,
    { len: number; h: number; cabLen: number; cabH: number; cabZ: number }
> = {
    sedan: { len: 2.35, h: 0.5, cabLen: 1.2, cabH: 0.42, cabZ: -0.1 },
    suv: { len: 2.25, h: 0.62, cabLen: 1.55, cabH: 0.5, cabZ: -0.12 },
    hatch: { len: 1.95, h: 0.5, cabLen: 1.15, cabH: 0.46, cabZ: -0.18 },
};

const Car: React.FC<{
    color?: string;
    kind?: CarKind;
    rotationY?: number;
    position?: [number, number, number];
    opacity?: number;
}> = ({
    color = '#DC2626',
    kind = 'sedan',
    rotationY = 0,
    position = [0, 0, 0],
    opacity = 1,
}) => {
    const spec = CAR_SPECS[kind];
    const bodyWidth = 1.0;
    const bodyY = 0.22 + spec.h / 2;
    const cabinW = 0.86;
    const cabinY = bodyY + spec.h / 2 + spec.cabH / 2 - 0.02;

    const wheelR = 0.19;
    const wheelW = 0.14;
    const wheelZ = spec.len / 2 - 0.45;
    const wheelX = bodyWidth / 2 - 0.02;

    const transparent = opacity < 1;

    const paint = (
        <meshStandardMaterial
            color={color}
            roughness={0.28}
            metalness={0.6}
            transparent={transparent}
            opacity={opacity}
        />
    );
    const glass = (
        <meshStandardMaterial
            color="#0B1220"
            roughness={0.08}
            metalness={0.9}
            transparent={transparent}
            opacity={opacity}
        />
    );
    const trim = (
        <meshStandardMaterial
            color="#111827"
            roughness={0.7}
            metalness={0.2}
            transparent={transparent}
            opacity={opacity}
        />
    );

    return (
        <group position={position} rotation={[0, rotationY, 0]}>
            {/* Lower body */}
            <Box
                args={[bodyWidth, spec.h, spec.len]}
                position={[0, bodyY, 0]}
                castShadow
            >
                {paint}
            </Box>

            {/* Bumpers */}
            <Box
                args={[bodyWidth + 0.04, 0.16, 0.1]}
                position={[0, 0.3, spec.len / 2 + 0.03]}
            >
                {trim}
            </Box>
            <Box
                args={[bodyWidth + 0.04, 0.16, 0.1]}
                position={[0, 0.3, -spec.len / 2 - 0.03]}
            >
                {trim}
            </Box>

            {/* Hood grille */}
            <Box
                args={[0.5, 0.1, 0.03]}
                position={[0, bodyY - 0.05, spec.len / 2 + 0.01]}
            >
                {trim}
            </Box>

            {/* Glass greenhouse */}
            <Box
                args={[cabinW, spec.cabH, spec.cabLen]}
                position={[0, cabinY, spec.cabZ]}
                castShadow
            >
                {glass}
            </Box>

            {/* Roof slab */}
            <Box
                args={[cabinW + 0.02, 0.05, spec.cabLen + 0.04]}
                position={[0, cabinY + spec.cabH / 2 + 0.02, spec.cabZ]}
                castShadow
            >
                {paint}
            </Box>

            {/* Pillars */}
            {[-1, 1].flatMap((sx) =>
                [-1, 1].map((sz) => (
                    <Box
                        key={`pillar-${sx}-${sz}`}
                        args={[0.05, spec.cabH, 0.06]}
                        position={[
                            sx * (cabinW / 2),
                            cabinY,
                            spec.cabZ + sz * (spec.cabLen / 2),
                        ]}
                    >
                        {paint}
                    </Box>
                )),
            )}

            {/* Side mirrors */}
            {[-1, 1].map((s) => (
                <Box
                    key={`mirror-${s}`}
                    args={[0.1, 0.07, 0.1]}
                    position={[
                        s * (bodyWidth / 2 + 0.06),
                        cabinY - 0.12,
                        spec.cabZ + spec.cabLen / 2 - 0.05,
                    ]}
                >
                    {paint}
                </Box>
            ))}

            {/* Wheels */}
            {[
                [-wheelX, wheelZ],
                [wheelX, wheelZ],
                [-wheelX, -wheelZ],
                [wheelX, -wheelZ],
            ].map(([x, z], i) => (
                <group key={`wheel-${i}`} position={[x, wheelR, z]}>
                    <Cylinder
                        args={[wheelR, wheelR, wheelW, 18]}
                        rotation={[0, 0, Math.PI / 2]}
                        castShadow
                    >
                        <meshStandardMaterial
                            color="#0B0F19"
                            roughness={0.95}
                            transparent={transparent}
                            opacity={opacity}
                        />
                    </Cylinder>
                    <Cylinder
                        args={[wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 12]}
                        rotation={[0, 0, Math.PI / 2]}
                    >
                        <meshStandardMaterial
                            color="#CBD5E1"
                            roughness={0.3}
                            metalness={0.85}
                            transparent={transparent}
                            opacity={opacity}
                        />
                    </Cylinder>
                </group>
            ))}

            {/* Headlights */}
            {[-1, 1].map((s) => (
                <Box
                    key={`hl-${s}`}
                    args={[0.22, 0.09, 0.04]}
                    position={[
                        s * (bodyWidth / 2 - 0.2),
                        bodyY + 0.06,
                        spec.len / 2 + 0.015,
                    ]}
                >
                    <meshStandardMaterial
                        color="#FEF9C3"
                        emissive="#FEF3C7"
                        emissiveIntensity={0.9}
                        transparent={transparent}
                        opacity={opacity}
                    />
                </Box>
            ))}

            {/* Tail lights */}
            {[-1, 1].map((s) => (
                <Box
                    key={`tl-${s}`}
                    args={[0.2, 0.08, 0.04]}
                    position={[
                        s * (bodyWidth / 2 - 0.2),
                        bodyY + 0.06,
                        -spec.len / 2 - 0.015,
                    ]}
                >
                    <meshStandardMaterial
                        color="#EF4444"
                        emissive="#DC2626"
                        emissiveIntensity={0.7}
                        transparent={transparent}
                        opacity={opacity}
                    />
                </Box>
            ))}

            {/* Rear plate */}
            <Box
                args={[0.34, 0.12, 0.02]}
                position={[0, 0.34, -spec.len / 2 - 0.09]}
            >
                <meshStandardMaterial
                    color="#F8FAFC"
                    roughness={0.5}
                    transparent={transparent}
                    opacity={opacity}
                />
            </Box>

            {/* Soft contact shadow under the car */}
            <Plane
                args={[bodyWidth + 0.5, spec.len + 0.5]}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
            >
                <meshBasicMaterial
                    color="#000000"
                    transparent
                    opacity={0.35 * opacity}
                    depthWrite={false}
                />
            </Plane>
        </group>
    );
};

// ─── Traffic cone (maintenance) ─────────────────────────────────────────────

const TrafficCone: React.FC<{ position: [number, number, number] }> = ({
    position,
}) => (
    <group position={position}>
        <Box args={[0.3, 0.03, 0.3]} position={[0, 0.015, 0]}>
            <meshStandardMaterial color="#111827" />
        </Box>
        <Cone args={[0.12, 0.5, 16]} position={[0, 0.28, 0]} castShadow>
            <meshStandardMaterial color="#F97316" roughness={0.6} />
        </Cone>
        <Cylinder args={[0.075, 0.095, 0.07, 16]} position={[0, 0.3, 0]}>
            <meshStandardMaterial color="#F8FAFC" roughness={0.6} />
        </Cylinder>
    </group>
);

// ─── Selection marker (bouncing arrow + pulsing outline) ───────────────────

const SelectionMarker: React.FC = () => {
    const arrow = useRef<THREE.Group>(null);
    const ring = useRef<THREE.Group>(null);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (arrow.current) arrow.current.position.y = 2.6 + Math.sin(t * 3) * 0.2;
        if (ring.current) {
            const s = 1 + Math.sin(t * 3) * 0.02;
            ring.current.scale.set(s, 1, s);
        }
    });

    const w = SLOT_W + 0.14;
    const l = SLOT_L + 0.14;
    const th = 0.1;

    return (
        <>
            <group ref={ring}>
                {[
                    [w, th, 0, l / 2],
                    [w, th, 0, -l / 2],
                    [th, l, w / 2, 0],
                    [th, l, -w / 2, 0],
                ].map(([sx, sz, x, z], i) => (
                    <Box
                        key={i}
                        args={[sx, 0.12, sz]}
                        position={[x, 0.08, z]}
                    >
                        <meshBasicMaterial color="#FFFFFF" />
                    </Box>
                ))}
            </group>
            <group ref={arrow} position={[0, 2.6, 0]}>
                <Cone
                    args={[0.28, 0.5, 4]}
                    rotation={[Math.PI, Math.PI / 4, 0]}
                >
                    <meshBasicMaterial color="#38BDF8" />
                </Cone>
            </group>
        </>
    );
};

// ─── Parking Slot ──────────────────────────────────────────────────────────

const ParkingSlotBox: React.FC<{
    slot: ParkingSlot;
    position: [number, number, number];
    side: 'left' | 'right';
    dimmed: boolean;
    selected: boolean;
    onClick: () => void;
}> = ({ slot, position, side, dimmed, selected, onClick }) => {
    const [hovered, setHovered] = useState(false);
    const matRef = useRef<THREE.MeshStandardMaterial>(null);

    const lineThickness = 0.07;
    const tint = STATUS_COLOR[slot.status];
    const carColor = pickCarColor(slot.id);

    const kind: CarKind = (['sedan', 'suv', 'hatch'] as CarKind[])[
        Math.floor(seeded(slot.id, 3) * 3)
    ];
    const yaw = (seeded(slot.id, 5) - 0.5) * 0.1;
    const offsetX = (seeded(slot.id, 7) - 0.5) * 0.25;

    // Pulse "available" bays so free spots pop out on a busy lot
    useFrame(({ clock }) => {
        const m = matRef.current;
        if (!m) return;
        const base = hovered ? 0.5 : 0.14;
        if (slot.status === 'available' && !dimmed) {
            m.emissiveIntensity =
                base + (Math.sin(clock.getElapsedTime() * 2.2 + slot.id) + 1) * 0.07;
        } else {
            m.emissiveIntensity = base;
        }
    });

    // Never leave the pointer stuck on "pointer" if the slot unmounts
    useEffect(
        () => () => {
            document.body.style.cursor = 'default';
        },
        [],
    );

    const labelY = slot.status === 'occupied' ? 1.55 : 0.55;
    const opacity = dimmed ? 0.25 : 1;
    const hazard = slot.status === 'maintenance' ? getHazardTexture() : null;

    return (
        <group position={[position[0], 0, position[2]]}>
            {/* Interactive floor pad */}
            <Box
                args={[SLOT_W, 0.06, SLOT_L]}
                position={[0, 0.03, 0]}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                }}
                onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(true);
                    document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                    setHovered(false);
                    document.body.style.cursor = 'default';
                }}
                receiveShadow
            >
                <meshStandardMaterial
                    ref={matRef}
                    color={tint}
                    roughness={0.85}
                    metalness={0.05}
                    emissive={tint}
                    emissiveIntensity={0.14}
                    transparent
                    opacity={dimmed ? 0.2 : hovered ? 0.95 : 0.78}
                />
            </Box>

            {/* Hazard stripes for maintenance */}
            {hazard && (
                <Plane
                    args={[SLOT_W - 0.25, SLOT_L - 0.25]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, 0.07, 0]}
                >
                    <meshBasicMaterial
                        map={hazard}
                        transparent
                        opacity={dimmed ? 0.2 : 0.75}
                    />
                </Plane>
            )}

            {/* Painted bay lines (open toward the aisle, like a real bay) */}
            {[
                [SLOT_W, lineThickness, 0, SLOT_L / 2 - lineThickness / 2],
                [SLOT_W, lineThickness, 0, -SLOT_L / 2 + lineThickness / 2],
                [
                    lineThickness,
                    SLOT_L,
                    -SLOT_W / 2 + lineThickness / 2,
                    0,
                ],
                [
                    lineThickness,
                    SLOT_L,
                    SLOT_W / 2 - lineThickness / 2,
                    0,
                ],
            ].map(([sx, sz, x, z], i) => (
                <Box
                    key={i}
                    args={[sx, 0.02, sz]}
                    position={[x, 0.07, z]}
                >
                    <meshBasicMaterial
                        color="#F1F5F9"
                        transparent
                        opacity={dimmed ? 0.25 : 1}
                    />
                </Box>
            ))}

            {/* Label (always faces the camera) */}
            {!dimmed && (
                <Billboard position={[0, labelY, 0]} follow>
                    <Text
                        fontSize={0.46}
                        color="#FFFFFF"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="bold"
                        outlineWidth={0.04}
                        outlineColor="#0F172A"
                    >
                        {slot.slot_number}
                    </Text>
                </Billboard>
            )}

            {slot.status === 'occupied' && (
                <Car
                    color={carColor}
                    kind={kind}
                    rotationY={yaw}
                    position={[offsetX, 0.06, 0]}
                    opacity={opacity}
                />
            )}

            {slot.status === 'maintenance' && !dimmed && (
                <>
                    <TrafficCone position={[-0.5, 0.06, 1.0]} />
                    <TrafficCone position={[0.5, 0.06, 1.0]} />
                    <TrafficCone position={[-0.5, 0.06, -1.0]} />
                    <TrafficCone position={[0.5, 0.06, -1.0]} />
                </>
            )}

            {selected && <SelectionMarker />}

            {/* Hover tooltip */}
            {hovered && (
                <Html
                    position={[0, labelY + 0.9, 0]}
                    center
                    zIndexRange={[30, 0]}
                    style={{ pointerEvents: 'none' }}
                >
                    <div
                        style={{
                            background: 'rgba(15,23,42,0.95)',
                            border: `1px solid ${tint}`,
                            borderRadius: 10,
                            padding: '8px 12px',
                            color: '#E2E8F0',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                            minWidth: 130,
                            transform: 'translateY(-4px)',
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 700,
                                fontSize: 14,
                                marginBottom: 4,
                                color: '#fff',
                            }}
                        >
                            Slot {slot.slot_number}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: tint,
                                    display: 'inline-block',
                                }}
                            />
                            {STATUS_LABEL[slot.status]}
                        </div>
                        <div style={{ marginTop: 2, color: '#94A3B8' }}>
                            {fmtPHP(slot.nightly_rate)} / night
                        </div>
                        <div
                            style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: '#64748B',
                            }}
                        >
                            {side === 'left' ? 'Left' : 'Right'} row ·{' '}
                            {slot.status === 'available'
                                ? 'click to book'
                                : 'click for details'}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
};

// ─── Environment pieces ─────────────────────────────────────────────────────

const LampPost: React.FC<{
    position: [number, number, number];
    flip?: boolean;
    night?: boolean;
}> = ({ position, flip, night = true }) => (
    <group position={position}>
        <Cylinder args={[0.07, 0.09, 4.2, 8]} position={[0, 2.1, 0]} castShadow>
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
        </Cylinder>
        <Box args={[0.9, 0.06, 0.06]} position={[flip ? 0.4 : -0.4, 4.2, 0]}>
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
        </Box>
        <Box args={[0.35, 0.08, 0.2]} position={[flip ? 0.8 : -0.8, 4.15, 0]}>
            <meshStandardMaterial
                color="#FEF3C7"
                emissive="#FDE68A"
                emissiveIntensity={night ? 1.4 : 0.05}
            />
        </Box>
        {/* Warm light pool on the ground */}
        <Plane
            args={[4, 4]}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[flip ? 0.8 : -0.8, 0.045, 0]}
        >
            <meshBasicMaterial
                color="#FDE68A"
                transparent
                opacity={night ? 0.06 : 0}
                depthWrite={false}
            />
        </Plane>
    </group>
);

// Fence run along local Z (rotate the group to run it along X)
const FenceRun: React.FC<{
    length: number;
    position: [number, number, number];
    rotationY?: number;
}> = ({ length, position, rotationY = 0 }) => {
    const height = 1.5;
    const postCount = Math.max(2, Math.round(length / 2.5) + 1);
    const step = length / (postCount - 1);

    return (
        <group position={position} rotation={[0, rotationY, 0]}>
            {Array.from({ length: postCount }).map((_, i) => (
                <Box
                    key={`fp-${i}`}
                    args={[0.12, height, 0.12]}
                    position={[0, height / 2, -length / 2 + i * step]}
                    castShadow
                >
                    <meshStandardMaterial
                        color="#64748B"
                        metalness={0.5}
                        roughness={0.5}
                    />
                </Box>
            ))}
            {[0.2, height - 0.08].map((y) => (
                <Box
                    key={`rail-${y}`}
                    args={[0.07, 0.07, length]}
                    position={[0, y, 0]}
                >
                    <meshStandardMaterial
                        color="#94A3B8"
                        metalness={0.6}
                        roughness={0.4}
                    />
                </Box>
            ))}
            {/* Wire-mesh panel */}
            <Box
                args={[0.02, height - 0.3, length]}
                position={[0, height / 2 + 0.02, 0]}
            >
                <meshStandardMaterial
                    color="#CBD5E1"
                    transparent
                    opacity={0.16}
                    metalness={0.4}
                    roughness={0.6}
                    depthWrite={false}
                />
            </Box>
        </group>
    );
};

// ─── Entrance / Exit Gate ───────────────────────────────────────────────────

const BoomBarrier: React.FC<{
    pivot: [number, number, number];
    dir: 1 | -1;
    phase: number;
}> = ({ pivot, dir, phase }) => {
    const arm = useRef<THREE.Group>(null);

    // Idle animation: the boom lifts briefly every few seconds
    useFrame(({ clock }) => {
        if (!arm.current) return;
        const t = clock.getElapsedTime() * 0.45 + phase;
        const lift = Math.pow(Math.max(0, Math.sin(t)), 6);
        arm.current.rotation.z = dir * lift * 1.15;
    });

    return (
        <group position={pivot}>
            <Box args={[0.4, 1.0, 0.4]} position={[0, 0.5, 0]} castShadow>
                <meshStandardMaterial color="#E2E8F0" roughness={0.6} />
            </Box>
            <group ref={arm} position={[0, 0.95, 0]}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Box
                        key={i}
                        args={[0.45, 0.09, 0.09]}
                        position={[dir * (0.3 + i * 0.45), 0, 0]}
                    >
                        <meshStandardMaterial
                            color={i % 2 === 0 ? '#DC2626' : '#F8FAFC'}
                            roughness={0.5}
                        />
                    </Box>
                ))}
            </group>
        </group>
    );
};

const EntranceExitGate: React.FC<{
    frontZ: number;
    backZ: number;
}> = ({ frontZ, backZ }) => {
    const roadHalf = 2.8;
    const roadLen = frontZ - backZ;
    const roadCz = (frontZ + backZ) / 2;
    const gateZ = frontZ - 2.2;

    return (
        <group>
            {/* Entry funnel road */}
            <Box
                args={[roadHalf * 2, 0.04, roadLen]}
                position={[0, 0.02, roadCz]}
                receiveShadow
            >
                <meshStandardMaterial color="#27303d" roughness={0.9} />
            </Box>

            {/* Center divider between IN and OUT lanes */}
            {Array.from({ length: Math.floor(roadLen / 1.2) }).map((_, i) => (
                <Box
                    key={`dash-${i}`}
                    args={[0.09, 0.02, 0.6]}
                    position={[0, 0.05, frontZ - 0.8 - i * 1.2]}
                >
                    <meshStandardMaterial
                        color="#FCD34D"
                        emissive="#FCD34D"
                        emissiveIntensity={0.2}
                    />
                </Box>
            ))}

            {/* IN / OUT ground labels — right-hand traffic: IN on the right, OUT on the left */}
            <Text
                position={[1.4, 0.07, gateZ - 2.2]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.5}
                color="#10B981"
                anchorX="center"
                anchorY="middle"
                fontWeight="bold"
                outlineWidth={0.01}
                outlineColor="#000"
            >
                IN
            </Text>
            <Text
                position={[-1.4, 0.07, gateZ - 2.2]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.5}
                color="#EF4444"
                anchorX="center"
                anchorY="middle"
                fontWeight="bold"
                outlineWidth={0.01}
                outlineColor="#000"
            >
                OUT
            </Text>

            {/* Lane arrows: IN points into the lot (−Z), OUT points to the street (+Z) */}
            <Cone
                args={[0.3, 0.6, 3]}
                position={[1.4, 0.07, gateZ - 1.2]}
                rotation={[0, Math.PI, 0]}
                scale={[1, 0.02, 1]}
            >
                <meshBasicMaterial color="#10B981" />
            </Cone>
            <Cone
                args={[0.3, 0.6, 3]}
                position={[-1.4, 0.07, gateZ - 1.2]}
                rotation={[0, 0, 0]}
                scale={[1, 0.02, 1]}
            >
                <meshBasicMaterial color="#EF4444" />
            </Cone>

            {/* Gantry posts */}
            {[-roadHalf - 0.15, roadHalf + 0.15].map((x, i) => (
                <group key={`post-${i}`} position={[x, 0, gateZ]}>
                    <Box args={[0.6, 0.06, 0.6]} position={[0, 0.03, 0]}>
                        <meshStandardMaterial color="#CBD5E1" roughness={0.8} />
                    </Box>
                    <Box args={[0.22, 3.4, 0.22]} position={[0, 1.7, 0]} castShadow>
                        <meshStandardMaterial
                            color="#94A3B8"
                            roughness={0.5}
                            metalness={0.4}
                        />
                    </Box>
                </group>
            ))}

            {/* Signboard */}
            <Box
                args={[roadHalf * 2 + 0.7, 0.95, 0.18]}
                position={[0, 3.35, gateZ]}
                castShadow
            >
                <meshStandardMaterial
                    color="#0F172A"
                    roughness={0.5}
                    metalness={0.2}
                />
            </Box>
            {[2.85, 3.85].map((y) => (
                <Box
                    key={y}
                    args={[roadHalf * 2 + 0.7, 0.04, 0.22]}
                    position={[0, y, gateZ]}
                >
                    <meshStandardMaterial
                        color="#FBBF24"
                        emissive="#FBBF24"
                        emissiveIntensity={0.5}
                    />
                </Box>
            ))}
            <Text
                position={[0, 3.35, gateZ + 0.11]}
                fontSize={0.3}
                color="#FBBF24"
                anchorX="center"
                anchorY="middle"
                fontWeight="bold"
            >
                ENTRANCE · EXIT
            </Text>

            {/* Boom barriers: OUT lane left, IN lane right (arms reach across their lane) */}
            <BoomBarrier pivot={[-roadHalf, 0, gateZ + 0.5]} dir={1} phase={2.4} />
            <BoomBarrier pivot={[roadHalf, 0, gateZ + 0.5]} dir={-1} phase={0} />
        </group>
    );
};

// ─── Camera rig (smooth fly-to, never fights the user) ─────────────────────

const CameraRig: React.FC<{ view: CameraView | null }> = ({ view }) => {
    const { camera, controls } = useThree() as any;
    const anim = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(
        null,
    );

    useEffect(() => {
        if (!view) return;
        anim.current = {
            pos: new THREE.Vector3(...view.position),
            target: new THREE.Vector3(...view.target),
        };
    }, [view]);

    // Stop animating as soon as the user grabs the controls
    useEffect(() => {
        if (!controls) return;
        const cancel = () => {
            anim.current = null;
        };
        controls.addEventListener('start', cancel);
        return () => controls.removeEventListener('start', cancel);
    }, [controls]);

    useFrame((_, dt) => {
        const a = anim.current;
        if (!a || !controls) return;
        const k = 1 - Math.exp(-dt * 4.5);
        camera.position.lerp(a.pos, k);
        controls.target.lerp(a.target, k);
        controls.update();
        if (
            camera.position.distanceTo(a.pos) < 0.05 &&
            controls.target.distanceTo(a.target) < 0.05
        ) {
            anim.current = null;
        }
    });

    return null;
};

// ─── Key light (sun by day, moon by night) with shadows fitted to the lot ───

const SceneLight: React.FC<{
    centerZ: number;
    extent: number;
    night: boolean;
}> = ({ centerZ, extent, night }) => {
    const ref = useRef<THREE.DirectionalLight>(null);
    const { scene } = useThree();

    useEffect(() => {
        const light = ref.current;
        if (!light) return;
        light.target.position.set(0, 0, centerZ);
        scene.add(light.target);
        light.target.updateMatrixWorld();
        return () => {
            scene.remove(light.target);
        };
    }, [centerZ, scene]);

    return (
        <directionalLight
            ref={ref}
            position={[night ? -14 : 14, 30, centerZ + 12]}
            color={night ? '#A5B4FC' : '#FFF1D6'}
            intensity={night ? 0.45 : 1.5}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-extent}
            shadow-camera-right={extent}
            shadow-camera-top={extent}
            shadow-camera-bottom={-extent}
            shadow-camera-near={1}
            shadow-camera-far={extent * 4}
            shadow-bias={-0.0004}
        />
    );
};

// ─── Visible sun (day) ──────────────────────────────────────────────────────

const SkySun: React.FC<{ position: [number, number, number] }> = ({
    position,
}) => {
    const rays = useRef<THREE.Group>(null);
    useFrame((_, dt) => {
        if (rays.current) rays.current.rotation.z += dt * 0.08;
    });

    return (
        <group position={position}>
            <Sphere args={[3.4, 32, 32]}>
                <meshBasicMaterial color="#FFE066" fog={false} />
            </Sphere>
            <Sphere args={[4.8, 32, 32]}>
                <meshBasicMaterial
                    color="#FFD54A"
                    transparent
                    opacity={0.25}
                    depthWrite={false}
                    fog={false}
                />
            </Sphere>
            <Sphere args={[7.5, 32, 32]}>
                <meshBasicMaterial
                    color="#FFE9A8"
                    transparent
                    opacity={0.1}
                    depthWrite={false}
                    fog={false}
                />
            </Sphere>
            {/* Slowly rotating rays, always facing the camera */}
            <Billboard follow>
                <group ref={rays}>
                    {Array.from({ length: 14 }).map((_, i) => {
                        const a = (i / 14) * Math.PI * 2;
                        return (
                            <Box
                                key={i}
                                args={[0.35, i % 2 ? 1.6 : 2.4, 0.05]}
                                position={[
                                    Math.cos(a) * 6.2,
                                    Math.sin(a) * 6.2,
                                    0,
                                ]}
                                rotation={[0, 0, a - Math.PI / 2]}
                            >
                                <meshBasicMaterial
                                    color="#FFD54A"
                                    transparent
                                    opacity={0.7}
                                    fog={false}
                                />
                            </Box>
                        );
                    })}
                </group>
            </Billboard>
        </group>
    );
};

// ─── Visible moon (night) ───────────────────────────────────────────────────

const SkyMoon: React.FC<{ position: [number, number, number] }> = ({
    position,
}) => {
    const r = 2.8;
    // Craters sit on the face that looks toward the lot (+Z)
    const craters: [number, number, number][] = [
        [-0.9, 0.7, 0.5],
        [0.8, 0.2, 0.55],
        [-0.2, -1.0, 0.45],
        [1.0, -0.9, 0.3],
        [-1.2, -0.3, 0.4],
    ];

    return (
        <group position={position}>
            <Sphere args={[r, 32, 32]}>
                <meshBasicMaterial color="#E5E7EB" fog={false} />
            </Sphere>
            {craters.map(([x, y, z], i) => {
                const n = new THREE.Vector3(x, y, z).normalize();
                const size = 0.35 + (i % 3) * 0.12;
                return (
                    <Sphere
                        key={i}
                        args={[size, 12, 12]}
                        position={[n.x * r * 0.98, n.y * r * 0.98, n.z * r * 0.98]}
                        scale={[1, 1, 0.25]}
                    >
                        <meshBasicMaterial color="#CBD5E1" fog={false} />
                    </Sphere>
                );
            })}
            <Sphere args={[3.9, 32, 32]}>
                <meshBasicMaterial
                    color="#BFDBFE"
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    fog={false}
                />
            </Sphere>
            <Sphere args={[6.2, 32, 32]}>
                <meshBasicMaterial
                    color="#93C5FD"
                    transparent
                    opacity={0.07}
                    depthWrite={false}
                    fog={false}
                />
            </Sphere>
        </group>
    );
};

// ─── App theme detection (follows the site's light / dark mode) ─────────────

const readAppDark = (): boolean => {
    if (typeof document === 'undefined') return true;
    const root = document.documentElement;
    const body = document.body;
    const attr =
        root.getAttribute('data-theme') ?? body?.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    if (root.classList.contains('dark') || body?.classList.contains('dark'))
        return true;
    if (root.classList.contains('light') || body?.classList.contains('light'))
        return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
};

// ─── Overlay chip style ─────────────────────────────────────────────────────

const glass: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.82)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: 10,
    color: '#E2E8F0',
};

// ─── Main Component ─────────────────────────────────────────────────────────

type StatusFilter = 'all' | SlotStatus;

export const ParkingMap3D: React.FC<Props> = ({
    slots,
    onSelectSlot,
    onCheckInSuccess,
}) => {
    const [bookModalVisible, setBookModalVisible] = useState(false);
    const [preselectedSlot, setPreselectedSlot] = useState<ParkingSlot | null>(
        null,
    );
    const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);

    const [checkinModal, setCheckinModal] = useState(false);
    const [checkinForm] = Form.useForm();
    const [checkingIn, setCheckingIn] = useState(false);
    const [prefillSlot, setPrefillSlot] = useState<ParkingSlot | null>(null);

    const [searchCustModal, setSearchCustModal] = useState(false);
    const [searchKW, setSearchKW] = useState('');
    const [searchResults, setSearchResults] = useState<Customer[]>([]);
    const [searching, setSearching] = useState(false);

    // Map UI state
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [focusedSlotId, setFocusedSlotId] = useState<number | null>(null);
    const [slotQuery, setSlotQuery] = useState('');
    const [autoRotate, setAutoRotate] = useState(false);
    const [camView, setCamView] = useState<CameraView | null>(null);

    // Day / night: follows the app theme, with a manual override button
    const [appDark, setAppDark] = useState<boolean>(readAppDark);
    const [manualNight, setManualNight] = useState<boolean | null>(null);
    const isNight = manualNight ?? appDark;

    useEffect(() => {
        const update = () => {
            const next = readAppDark();
            setAppDark((prev) => {
                if (prev !== next) setManualNight(null); // theme changed → follow it again
                return next;
            });
        };
        const obs = new MutationObserver(update);
        const opts = { attributes: true, attributeFilter: ['data-theme', 'class'] };
        obs.observe(document.documentElement, opts);
        if (document.body) obs.observe(document.body, opts);
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        mq?.addEventListener?.('change', update);
        return () => {
            obs.disconnect();
            mq?.removeEventListener?.('change', update);
        };
    }, []);

    const sky = isNight
        ? { bg: '#0b1224', ground: '#14301f', asphalt: '#1f2937', aisle: '#374151' }
        : { bg: '#9AD0FF', ground: '#3f7d3a', asphalt: '#374151', aisle: '#4B5563' };

    // ─── Split + order slots (DYNAMIC, no fixed cap) ────────────────────────
    // Rows are ordered by creation (id ascending), NOT by slot number, so a
    // newly added slot always lands at the far end of its row, away from the
    // entrance, even if its number is lower than existing ones.
    const { finalLeft, finalRight } = useMemo(() => {
        const byCreation = (a: ParkingSlot, b: ParkingSlot) =>
            a.id - b.id || getSlotNumber(a) - getSlotNumber(b);
        return {
            finalLeft: slots.filter(isLeftSlot).sort(byCreation),
            finalRight: slots.filter((s) => !isLeftSlot(s)).sort(byCreation),
        };
    }, [slots]);

    // Layout
    const slotWidth = SLOT_W;
    const slotLength = SLOT_L;
    const walkwayWidth = AISLE_W;
    const margin = SLOT_MARGIN;
    const spacingZ = ROW_SPACING;

    const leftStartX = -(walkwayWidth / 2 + margin + slotWidth / 2);
    const rightStartX = walkwayWidth / 2 + margin + slotWidth / 2;

    // Entrance sits at the FRONT of the lot; slots grow away from it (−Z).
    const gateFrontZ = 2.5;
    const gateBackZ = -6.6;
    const startZ = -8.5;

    const totalRows = Math.max(finalLeft.length, finalRight.length, 1);
    const endZ = startZ - (totalRows - 1) * spacingZ;
    const centerZ = (startZ + endZ) / 2;
    const rowsSpan = Math.abs(startZ - endZ);

    const lotFront = gateFrontZ;
    const lotBack = endZ - slotLength / 2 - 1.5;
    const lotLen = lotFront - lotBack;
    const lotCenterZ = (lotFront + lotBack) / 2;
    const lotHalfW = rightStartX + slotWidth / 2 + 1.0;

    // Sun / moon hang low over the horizon behind the lot so they are
    // visible from the default overview camera.
    const skyBodyPos: [number, number, number] = [
        isNight ? 24 : -26,
        4.5 + 0.13 * rowsSpan,
        lotBack - 30,
    ];

    const groundW = lotHalfW * 2 + 60;
    const groundL = lotLen + 60;

    // id → [x, z] so search / focus can fly the camera to any slot
    const slotPositions = useMemo(() => {
        const m = new Map<number, [number, number]>();
        finalLeft.forEach((s, i) => m.set(s.id, [leftStartX, startZ - i * spacingZ]));
        finalRight.forEach((s, i) =>
            m.set(s.id, [rightStartX, startZ - i * spacingZ]),
        );
        return m;
    }, [finalLeft, finalRight, leftStartX, rightStartX, startZ, spacingZ]);

    // Camera presets scale with lot size
    const views = useMemo(
        () => ({
            overview: {
                position: [0, 16 + rowsSpan * 0.35, centerZ + 24 + rowsSpan * 0.55],
                target: [0, 0, centerZ],
            } as CameraView,
            top: {
                position: [0, 24 + rowsSpan * 0.95, centerZ + 0.01],
                target: [0, 0, centerZ],
            } as CameraView,
            gate: {
                position: [0, 4.5, gateFrontZ + 12],
                target: [0, 1.5, gateBackZ - 8],
            } as CameraView,
        }),
        [rowsSpan, centerZ, gateFrontZ, gateBackZ],
    );

    const flyToView = (v: CameraView) => setCamView({ ...v });

    const flyToSlot = useCallback(
        (slot: ParkingSlot) => {
            const p = slotPositions.get(slot.id);
            if (!p) return;
            const [x, z] = p;
            setFocusedSlotId(slot.id);
            setCamView({
                position: [x * 0.35, 8, z + 9],
                target: [x, 0, z],
            });
        },
        [slotPositions],
    );

    const handleSlotSearch = () => {
        const q = slotQuery.trim().toLowerCase();
        if (!q) {
            setFocusedSlotId(null);
            return;
        }
        const hit =
            slots.find((s) => s.slot_number.toLowerCase() === q) ??
            slots.find((s) => s.slot_number.toLowerCase().includes(q));
        if (!hit) {
            message.warning(`No slot matching "${slotQuery}".`);
            return;
        }
        flyToSlot(hit);
    };

    // Counts + occupancy for the HUD
    const counts = useMemo(() => {
        const c = { available: 0, occupied: 0, maintenance: 0 };
        slots.forEach((s) => {
            c[s.status] += 1;
        });
        return c;
    }, [slots]);
    const occupancyPct = slots.length
        ? Math.round((counts.occupied / slots.length) * 100)
        : 0;

    const bookableSlots = slots.filter((s) => s.status === 'available');
    const availSlots = bookableSlots;

    const handleSlotClick = (slot: ParkingSlot) => {
        setFocusedSlotId(slot.id);

        if (slot.status === 'available') {
            // ✅ Go straight to booking
            openCheckinForSlot(slot);
            return;
        }

        if (onSelectSlot) {
            onSelectSlot(slot);
            return;
        }

        if (slot.status === 'maintenance') {
            message.warning(
                `Slot ${slot.slot_number} is under maintenance and cannot be booked.`,
            );
        } else {
            message.warning(
                `Slot ${slot.slot_number} is currently occupied. Please choose another slot.`,
            );
        }
    };
    // ─── Check-in helpers ───────────────────────────────────────────────────
    const openCheckinForSlot = (slot: ParkingSlot) => {
        if (slot.status !== 'available') {
            message.warning(`Slot ${slot.slot_number} is not available.`);
            return;
        }
        checkinForm.resetFields();
        checkinForm.setFieldsValue({
            check_in_date: dayjs(),
            check_in_time: dayjs('14:00', 'HH:mm'),
            expected_checkout_date: dayjs().add(1, 'day'),
            expected_checkout_time: dayjs('12:00', 'HH:mm'),
            parking_slot_id: slot.id,
        });
        setPrefillSlot(slot);
        setCheckinModal(true);
    };

    const resetCheckinForm = () => {
        setPrefillSlot(null);
        checkinForm.resetFields();
        checkinForm.setFieldsValue({
            check_in_date: dayjs(),
            check_in_time: dayjs('14:00', 'HH:mm'),
            expected_checkout_date: dayjs().add(1, 'day'),
            expected_checkout_time: dayjs('12:00', 'HH:mm'),
        });
    };

    const handleProceed = () => {
        if (!preselectedSlot) return;
        if (preselectedSlot.status !== 'available') {
            message.warning('This slot is not available.');
            return;
        }
        setBookModalVisible(false);
        openCheckinForSlot(preselectedSlot);
    };

    const handleCheckin = async (values: any) => {
        setCheckingIn(true);
        try {
            const ci = dayjs(
                `${values.check_in_date.format('YYYY-MM-DD')} ${values.check_in_time.format('HH:mm:ss')}`,
            );
            const co = dayjs(
                `${values.expected_checkout_date.format('YYYY-MM-DD')} ${values.expected_checkout_time.format('HH:mm:ss')}`,
            );
            const n = calculateNights(
                ci.format('YYYY-MM-DD'),
                co.format('YYYY-MM-DD'),
            );
            const rate =
                slots.find((s) => s.id === values.parking_slot_id)
                    ?.nightly_rate ?? 200;

            const r = await api.post('/staff/parking/checkin', {
                first_name: values.first_name,
                middle_name: values.middle_name ?? '',
                last_name: values.last_name,
                phone_number: values.phone_number,
                email: values.email ?? '',
                address: values.address ?? '',
                plate_number: values.plate_number,
                vehicle_model: values.vehicle_model,
                parking_slot_id: values.parking_slot_id,
                check_in_date: values.check_in_date.format('YYYY-MM-DD'),
                check_in_time: values.check_in_time.format('HH:mm:ss'),
                expected_checkout_date:
                    values.expected_checkout_date.format('YYYY-MM-DD'),
                expected_checkout_time:
                    values.expected_checkout_time.format('HH:mm:ss'),
                expected_nights: n,
                expected_amount: n * rate,
            });

            if (r.data.success) {
                message.success(
                    `Check-in successful! (${n} night${n !== 1 ? 's' : ''})`,
                );
                setCheckinModal(false);
                resetCheckinForm();
                onCheckInSuccess?.();
            } else {
                message.error(r.data?.message ?? 'Check-in failed.');
            }
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Check-in failed.');
        } finally {
            setCheckingIn(false);
        }
    };

    const searchCustomers = async () => {
        if (!searchKW.trim()) {
            message.warning('Enter a keyword.');
            return;
        }
        setSearching(true);
        try {
            const r = await api.get('/customers/search', {
                params: { keyword: searchKW },
            });
            setSearchResults(Array.isArray(r.data) ? r.data : []);
        } catch {
            message.error('Search failed.');
        } finally {
            setSearching(false);
        }
    };

    const selectCustomer = (c: Customer) => {
        const currentSlotId = checkinForm.getFieldValue('parking_slot_id');
        checkinForm.setFieldsValue({
            first_name: c.first_name,
            middle_name: c.middle_name,
            last_name: c.last_name,
            phone_number: c.phone_number,
            email: c.email,
            address: c.address,
            plate_number: c.plate_number,
            vehicle_model: c.vehicle_model,
            parking_slot_id: currentSlotId,
        });
        setSearchCustModal(false);
    };

    const chip = (
        key: StatusFilter,
        label: string,
        color: string | null,
        count: number,
    ) => {
        const active = statusFilter === key;
        return (
            <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(active && key !== 'all' ? 'all' : key)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: active ? '#fff' : '#CBD5E1',
                    background: active
                        ? 'rgba(255,255,255,0.14)'
                        : 'transparent',
                    border: `1px solid ${active ? (color ?? '#94A3B8') : 'rgba(148,163,184,0.25)'}`,
                    outline: 'none',
                    transition: 'all .15s',
                }}
            >
                {color && (
                    <span
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: 2,
                            background: color,
                        }}
                    />
                )}
                {label}
                <strong style={{ color: '#fff' }}>{count}</strong>
            </button>
        );
    };

    const viewBtnStyle: React.CSSProperties = {
        background: 'transparent',
        border: 'none',
        color: '#E2E8F0',
        boxShadow: 'none',
    };

    return (
        <>
            <div
                style={{
                    width: '100%',
                    height: '650px',
                    background: sky.bg,
                    borderRadius: 12,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* Top-left: camera presets + slot finder */}
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        maxWidth: 'calc(100% - 190px)',
                    }}
                >
                    <div
                        style={{
                            ...glass,
                            display: 'flex',
                            padding: 3,
                            gap: 2,
                            flexWrap: 'wrap',
                        }}
                    >
                        <Tooltip title="Angled overview">
                            <Button
                                size="small"
                                icon={<EyeOutlined />}
                                style={viewBtnStyle}
                                onClick={() => flyToView(views.overview)}
                            >
                                Overview
                            </Button>
                        </Tooltip>
                        <Tooltip title="Bird's-eye view">
                            <Button
                                size="small"
                                icon={<AimOutlined />}
                                style={viewBtnStyle}
                                onClick={() => flyToView(views.top)}
                            >
                                Top
                            </Button>
                        </Tooltip>
                        <Tooltip title="Look in from the gate">
                            <Button
                                size="small"
                                icon={<VideoCameraOutlined />}
                                style={viewBtnStyle}
                                onClick={() => flyToView(views.gate)}
                            >
                                Gate
                            </Button>
                        </Tooltip>
                        <Tooltip
                            title={
                                isNight
                                    ? 'Night mode (click for day)'
                                    : 'Day mode (click for night)'
                            }
                        >
                            <Button
                                size="small"
                                style={viewBtnStyle}
                                onClick={() => setManualNight(!isNight)}
                            >
                                {isNight ? '🌙 Night' : '☀️ Day'}
                            </Button>
                        </Tooltip>
                        <Tooltip title="Slowly rotate around the lot">
                            <Button
                                size="small"
                                icon={<SyncOutlined spin={autoRotate} />}
                                style={{
                                    ...viewBtnStyle,
                                    color: autoRotate ? '#34D399' : '#E2E8F0',
                                }}
                                onClick={() => setAutoRotate((v) => !v)}
                            >
                                Rotate
                            </Button>
                        </Tooltip>
                    </div>

                    <Input
                        allowClear
                        size="small"
                        placeholder="Find slot (e.g. A-03)"
                        prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
                        value={slotQuery}
                        onChange={(e) => {
                            setSlotQuery(e.target.value);
                            if (!e.target.value) setFocusedSlotId(null);
                        }}
                        onPressEnter={handleSlotSearch}
                        style={{
                            width: 190,
                            ...glass,
                            padding: '4px 10px',
                        }}
                    />
                </div>

                {/* Top-right: book + occupancy */}
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 8,
                    }}
                >
                    <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={() => {
                            setPreselectedSlot(null);
                            setSelectedSlotId(null);
                            setBookModalVisible(true);
                        }}
                        style={{
                            background: '#10B981',
                            borderColor: '#10B981',
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.4)',
                            borderRadius: 8,
                            height: 40,
                        }}
                    >
                        Book a Slot
                    </Button>
                    <div style={{ ...glass, padding: '6px 10px', width: 150 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 11,
                                color: '#94A3B8',
                                marginBottom: 4,
                            }}
                        >
                            <span>Occupancy</span>
                            <strong
                                style={{
                                    color:
                                        occupancyPct > 80
                                            ? '#F87171'
                                            : occupancyPct > 50
                                              ? '#FBBF24'
                                              : '#34D399',
                                }}
                            >
                                {occupancyPct}%
                            </strong>
                        </div>
                        <div
                            style={{
                                height: 5,
                                borderRadius: 3,
                                background: 'rgba(148,163,184,0.25)',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${occupancyPct}%`,
                                    height: '100%',
                                    background:
                                        occupancyPct > 80
                                            ? '#EF4444'
                                            : occupancyPct > 50
                                              ? '#F59E0B'
                                              : '#10B981',
                                    transition: 'width .4s',
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom-left: legend doubles as filter */}
                <div
                    style={{
                        ...glass,
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        zIndex: 10,
                        padding: 6,
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        maxWidth: 'calc(100% - 24px)',
                    }}
                >
                    {chip('all', 'All', null, slots.length)}
                    {chip('available', 'Available', STATUS_COLOR.available, counts.available)}
                    {chip('occupied', 'Occupied', STATUS_COLOR.occupied, counts.occupied)}
                    {chip('maintenance', 'Maintenance', STATUS_COLOR.maintenance, counts.maintenance)}
                </div>

                {/* Bottom-right: controls hint */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 14,
                        right: 14,
                        zIndex: 10,
                        fontSize: 11,
                        color: 'rgba(203,213,225,0.7)',
                        pointerEvents: 'none',
                        textAlign: 'right',
                    }}
                >
                    Drag: rotate · Right-drag: pan · Scroll: zoom
                </div>

                {slots.length === 0 && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#94A3B8',
                            pointerEvents: 'none',
                        }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <CarOutlined style={{ fontSize: 36, marginBottom: 8 }} />
                            <div>No parking slots to display yet.</div>
                        </div>
                    </div>
                )}

                <Canvas
                    camera={{
                        position: views.overview.position,
                        fov: 45,
                        near: 0.1,
                        far: 400,
                    }}
                    shadows
                    dpr={[1, 2]}
                    onPointerMissed={() => setFocusedSlotId(null)}
                >
                    {/* Dusk-sky look */}
                    <color attach="background" args={[sky.bg]} />
                    <fog
                        attach="fog"
                        args={[sky.bg, 60 + rowsSpan * 0.5, 130 + rowsSpan]}
                    />

                    <hemisphereLight
                        args={
                            isNight
                                ? ['#93C5FD', '#1f2937', 0.55]
                                : ['#DBEAFE', '#5B7F45', 0.95]
                        }
                    />
                    <ambientLight intensity={isNight ? 0.25 : 0.35} />
                    <SceneLight
                        centerZ={centerZ}
                        extent={Math.max(30, lotLen / 2 + 10)}
                        night={isNight}
                    />

                    {isNight ? (
                        <>
                            <SkyMoon position={skyBodyPos} />
                            <Stars
                                radius={160}
                                depth={50}
                                count={2500}
                                factor={5}
                                fade
                                speed={0.6}
                            />
                        </>
                    ) : (
                        <SkySun position={skyBodyPos} />
                    )}

                    <OrbitControls
                        makeDefault
                        enablePan
                        enableZoom
                        enableRotate
                        enableDamping
                        dampingFactor={0.08}
                        target={[0, 0, centerZ]}
                        minDistance={5}
                        maxDistance={60 + rowsSpan * 1.2}
                        maxPolarAngle={Math.PI / 2.1}
                        autoRotate={autoRotate}
                        autoRotateSpeed={0.7}
                    />
                    <CameraRig view={camView} />

                    {/* Grass / outer ground */}
                    <Plane
                        args={[groundW, groundL]}
                        position={[0, -0.15, lotCenterZ]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        receiveShadow
                    >
                        <meshStandardMaterial color={sky.ground} roughness={1} />
                    </Plane>

                    {/* Asphalt lot */}
                    <Box
                        args={[lotHalfW * 2, 0.1, lotLen]}
                        position={[0, -0.05, lotCenterZ]}
                        receiveShadow
                    >
                        <meshStandardMaterial color={sky.asphalt} roughness={0.95} />
                    </Box>

                    {/* Curbs */}
                    {[-1, 1].map((s) => (
                        <Box
                            key={`curb-${s}`}
                            args={[0.3, 0.2, lotLen]}
                            position={[s * (lotHalfW + 0.15), 0.0, lotCenterZ]}
                            receiveShadow
                        >
                            <meshStandardMaterial color="#9CA3AF" roughness={0.8} />
                        </Box>
                    ))}
                    <Box
                        args={[lotHalfW * 2 + 0.6, 0.2, 0.3]}
                        position={[0, 0.0, lotBack - 0.15]}
                        receiveShadow
                    >
                        <meshStandardMaterial color="#9CA3AF" roughness={0.8} />
                    </Box>

                    {/* Drive aisle */}
                    <Box
                        args={[walkwayWidth, 0.02, lotLen - 3.5]}
                        position={[0, 0.01, (gateBackZ + lotBack) / 2]}
                        receiveShadow
                    >
                        <meshStandardMaterial color={sky.aisle} roughness={0.85} />
                    </Box>

                    {/* Aisle edge lines */}
                    {[-1, 1].map((s) => (
                        <Box
                            key={`edge-${s}`}
                            args={[0.08, 0.02, lotLen - 3.5]}
                            position={[
                                s * (walkwayWidth / 2),
                                0.025,
                                (gateBackZ + lotBack) / 2,
                            ]}
                        >
                            <meshBasicMaterial color="#E5E7EB" />
                        </Box>
                    ))}

                    {/* Aisle centre dashes */}
                    {Array.from({
                        length: Math.max(0, Math.floor((gateBackZ - lotBack) / 1.4)),
                    }).map((_, i) => (
                        <Box
                            key={`cdash-${i}`}
                            args={[0.07, 0.02, 0.6]}
                            position={[0, 0.03, gateBackZ - 0.6 - i * 1.4]}
                        >
                            <meshBasicMaterial color="#FCD34D" />
                        </Box>
                    ))}

                    {/* Entrance / Exit gate */}
                    <EntranceExitGate frontZ={gateFrontZ} backZ={gateBackZ} />

                    {/* Perimeter: lamp posts */}
                    {Array.from({ length: Math.floor(lotLen / 6) + 1 }).map((_, i) => {
                        const z = lotFront - 3 - i * 6;
                        if (z < lotBack) return null;
                        return (
                            <React.Fragment key={`env-${i}`}>
                                <LampPost position={[-(lotHalfW + 0.9), 0, z]} flip night={isNight} />
                                <LampPost position={[lotHalfW + 0.9, 0, z - 3]} night={isNight} />
                            </React.Fragment>
                        );
                    })}

                    {/* Perimeter fence: both sides + back (front stays open for the gate) */}
                    {[-1, 1].map((sx) => (
                        <FenceRun
                            key={`fence-${sx}`}
                            length={lotLen}
                            position={[sx * (lotHalfW + 1.8), 0, lotCenterZ]}
                        />
                    ))}
                    <FenceRun
                        length={(lotHalfW + 1.8) * 2}
                        position={[0, 0, lotBack - 0.4]}
                        rotationY={Math.PI / 2}
                    />

                    {/* Left column */}
                    {finalLeft.map((slot, idx) => (
                        <ParkingSlotBox
                            key={slot.id}
                            slot={slot}
                            side="left"
                            position={[leftStartX, 0, startZ - idx * spacingZ]}
                            dimmed={statusFilter !== 'all' && slot.status !== statusFilter}
                            selected={focusedSlotId === slot.id}
                            onClick={() => handleSlotClick(slot)}
                        />
                    ))}

                    {/* Right column */}
                    {finalRight.map((slot, idx) => (
                        <ParkingSlotBox
                            key={slot.id}
                            slot={slot}
                            side="right"
                            position={[rightStartX, 0, startZ - idx * spacingZ]}
                            dimmed={statusFilter !== 'all' && slot.status !== statusFilter}
                            selected={focusedSlotId === slot.id}
                            onClick={() => handleSlotClick(slot)}
                        />
                    ))}
                </Canvas>
            </div>

            {/* PICKER MODAL */}
            <Modal
                title={
                    <Space>
                        <ThunderboltOutlined
                            style={{ color: '#10B981', fontSize: 18 }}
                        />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Book a Parking Slot
                        </span>
                    </Space>
                }
                open={bookModalVisible}
                onCancel={() => {
                    setBookModalVisible(false);
                    setPreselectedSlot(null);
                    setSelectedSlotId(null);
                }}
                onOk={handleProceed}
                okText="Book now"
                okButtonProps={{
                    disabled:
                        !preselectedSlot ||
                        preselectedSlot.status !== 'available',
                    style: {
                        background: '#10B981',
                        borderColor: '#10B981',
                        fontWeight: 600,
                    },
                }}
                cancelText="Cancel"
                width={560}
                destroyOnClose
            >
                {preselectedSlot ? (
                    <>
                        <p
                            style={{
                                color: 'var(--text-secondary)',
                                marginBottom: 12,
                            }}
                        >
                            You selected{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>
                                Slot {preselectedSlot.slot_number}
                            </strong>
                            . Click below to proceed to the check-in form.
                        </p>

                        <div
                            style={{
                                padding: 16,
                                background: 'var(--bg-surface-hover)',
                                borderRadius: 10,
                                border: '1px solid var(--border-color)',
                                marginBottom: 16,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 18,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    Slot {preselectedSlot.slot_number}
                                </span>
                                <Tag
                                    color="success"
                                    style={{ fontSize: 12, margin: 0 }}
                                >
                                    ✅ Available
                                </Tag>
                            </div>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <DollarOutlined
                                    style={{ color: 'var(--success)' }}
                                />
                                Nightly Rate:{' '}
                                <strong style={{ color: 'var(--success)' }}>
                                    {fmtPHP(preselectedSlot.nightly_rate)}
                                </strong>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <p
                            style={{
                                color: 'var(--text-secondary)',
                                marginBottom: 12,
                            }}
                        >
                            Choose an available slot below to start a booking.
                        </p>

                        {bookableSlots.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: 24,
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                <CarOutlined
                                    style={{ fontSize: 32, marginBottom: 8 }}
                                />
                                <div>No available slots right now.</div>
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                        'repeat(auto-fill, minmax(110px, 1fr))',
                                    gap: 10,
                                    maxHeight: 320,
                                    overflowY: 'auto',
                                    padding: 4,
                                }}
                            >
                                {bookableSlots.map((s) => {
                                    const isSelected =
                                        selectedSlotId === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => {
                                                setPreselectedSlot(s);
                                                setSelectedSlotId(s.id);
                                            }}
                                            style={{
                                                padding: '12px 8px',
                                                borderRadius: 8,
                                                border: isSelected
                                                    ? '2px solid #10B981'
                                                    : '1px solid var(--border-color)',
                                                background: isSelected
                                                    ? 'rgba(16,185,129,0.12)'
                                                    : 'var(--bg-surface-hover)',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                transition: 'all 0.15s',
                                                outline: 'none',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: 700,
                                                    fontSize: 15,
                                                    color: isSelected
                                                        ? '#10B981'
                                                        : 'var(--text-primary)',
                                                    marginBottom: 4,
                                                }}
                                            >
                                                {s.slot_number}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: 'var(--text-secondary)',
                                                }}
                                            >
                                                {fmtPHP(s.nightly_rate)}/night
                                            </div>
                                            {isSelected && (
                                                <CheckCircleOutlined
                                                    style={{
                                                        color: '#10B981',
                                                        fontSize: 14,
                                                        marginTop: 4,
                                                    }}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </Modal>

            {/* CHECK-IN MODAL */}
            <Modal
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        {prefillSlot
                            ? `Check In — Slot ${prefillSlot.slot_number}`
                            : 'Walk-in Check In'}
                    </span>
                }
                open={checkinModal}
                onCancel={() => {
                    setCheckinModal(false);
                    resetCheckinForm();
                }}
                footer={null}
                width={640}
                destroyOnClose
                style={{ background: 'var(--bg-card)' }}
            >
                {prefillSlot && (
                    <Alert
                        message={`Selected slot: ${prefillSlot.slot_number} — ${fmtPHP(prefillSlot.nightly_rate)}/night`}
                        type="success"
                        showIcon
                        icon={<CheckCircleOutlined />}
                        style={{ marginBottom: 16 }}
                        action={
                            <Button
                                size="small"
                                onClick={() => setSearchCustModal(true)}
                            >
                                Search Existing
                            </Button>
                        }
                    />
                )}

                <Form
                    form={checkinForm}
                    layout="vertical"
                    onFinish={handleCheckin}
                    initialValues={{
                        check_in_date: dayjs(),
                        check_in_time: dayjs('14:00', 'HH:mm'),
                        expected_checkout_date: dayjs().add(1, 'day'),
                        expected_checkout_time: dayjs('12:00', 'HH:mm'),
                    }}
                >
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item
                                name="first_name"
                                label="First Name"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="middle_name" label="Middle Name">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="last_name"
                                label="Last Name"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="phone_number"
                                label="Phone"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="email" label="Email">
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="address" label="Address">
                        <Input />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="vehicle_model"
                                label="Vehicle Model"
                                rules={[{ required: true }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="plate_number"
                                label="Plate Number"
                                rules={[{ required: true }]}
                            >
                                <Input
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        name="parking_slot_id"
                        label="Parking Slot"
                        rules={[{ required: true }]}
                    >
                        <Select placeholder="Select available slot">
                            {availSlots.map((s) => (
                                <Option key={s.id} value={s.id}>
                                    {s.slot_number} — {fmtPHP(s.nightly_rate)}
                                    /night
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="check_in_date"
                                label="Check-in Date"
                                rules={[{ required: true }]}
                            >
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="check_in_time"
                                label="Check-in Time"
                                rules={[{ required: true }]}
                            >
                                <TimePicker
                                    style={{ width: '100%' }}
                                    format="HH:mm"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="expected_checkout_date"
                                label="Expected Check-out Date"
                                rules={[{ required: true }]}
                            >
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="expected_checkout_time"
                                label="Expected Check-out Time"
                                rules={[{ required: true }]}
                            >
                                <TimePicker
                                    style={{ width: '100%' }}
                                    format="HH:mm"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
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
                                setCheckinModal(false);
                                resetCheckinForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={checkingIn}
                            icon={<LoginOutlined />}
                            style={{
                                background: '#10B981',
                                borderColor: '#10B981',
                                fontWeight: 600,
                            }}
                        >
                            Confirm Check In
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* CUSTOMER SEARCH MODAL */}
            <Modal
                title={
                    <Space>
                        <UserOutlined style={{ color: '#10B981' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Search Customer
                        </span>
                    </Space>
                }
                open={searchCustModal}
                onCancel={() => {
                    setSearchCustModal(false);
                    setSearchKW('');
                    setSearchResults([]);
                }}
                footer={null}
                width={560}
                destroyOnClose
            >
                <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                    <Input
                        placeholder="Name, phone, or email…"
                        value={searchKW}
                        onChange={(e) => setSearchKW(e.target.value)}
                        onPressEnter={searchCustomers}
                    />
                    <Button
                        type="primary"
                        loading={searching}
                        onClick={searchCustomers}
                    >
                        Search
                    </Button>
                </Space.Compact>

                {searchResults.length > 0 && (
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {searchResults.map((c) => (
                            <div
                                key={c.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 12px',
                                    marginBottom: 6,
                                    borderRadius: 8,
                                    background: 'var(--bg-surface-hover)',
                                    border: '1px solid var(--border-color)',
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {c.first_name} {c.last_name}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {c.phone_number}
                                        {c.email ? ` · ${c.email}` : ''}
                                    </div>
                                </div>
                                <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => selectCustomer(c)}
                                >
                                    Use
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {searchResults.length === 0 && searchKW && !searching && (
                    <div
                        style={{
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                            padding: 16,
                        }}
                    >
                        No customers found.
                    </div>
                )}
            </Modal>
        </>
    );
};