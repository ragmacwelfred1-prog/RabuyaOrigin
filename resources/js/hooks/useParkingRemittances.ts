// Mobile/src/hooks/useParkingRemittances.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface ParkingRemittance {
    id: number;
    staff_id: number;
    remittance_date: string;
    remitted_amount: number;
    actual_sales_amount: number;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Check if staff already remitted today ────────────────────────────────────

export function useCheckParkingRemittanceToday() {
    return useQuery({
        queryKey: ['parking-remittance', 'check'],
        queryFn: async () => {
            const res = await api.get('/staff/parking-remittances/check');
            return res.data as { exists: boolean; remittance?: ParkingRemittance };
        },
    });
}

// ─── Get today's actual walk-in parking collections ──────────────────────────

export function useTodayParkingSalesTotal() {
    return useQuery({
        queryKey: ['parking-remittance', 'today-sales'],
        queryFn: async () => {
            const res = await api.get('/staff/parking-remittances/today-sales');
            return res.data as { actual_sales_amount: number };
        },
    });
}

// ─── Submit a parking remittance ─────────────────────────────────────────────

export function useSubmitParkingRemittance() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (remittedAmount: number) => {
            const res = await api.post('/staff/parking-remittances', {
                remitted_amount: remittedAmount,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parking-remittance'] });
        },
    });
}