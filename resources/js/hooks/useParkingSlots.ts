// hooks/useParkingSlots.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

// GET all parking slots (for Parking Slots page)
export const useParkingSlots = () => {
    return useQuery({
        queryKey: ['parking-slots'],
        queryFn: async () => {
            // ✅ TAMA - gamitin ang /parking-slots (walang admin)
            const response = await api.get('/parking-slots');
            return response.data;
        },
    });
};

// CREATE parking slot
export const useCreateParkingSlot = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (data: any) => {
            // ✅ TAMA - gamitin ang /parking-slots (walang admin)
            const response = await api.post('/parking-slots', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parking-slots'] });
            // ✅ I-invalidate din ang dashboard stats
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};

// UPDATE parking slot
export const useUpdateParkingSlot = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: any }) => {
            // ✅ TAMA - gamitin ang /parking-slots (walang admin)
            const response = await api.put(`/parking-slots/${id}`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parking-slots'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};

// DELETE parking slot
export const useDeleteParkingSlot = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (id: number) => {
            // ✅ TAMA - gamitin ang /parking-slots (walang admin)
            const response = await api.delete(`/parking-slots/${id}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parking-slots'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};