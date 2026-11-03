// hooks/useParking.ts (para sa parking operations)
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export const useActiveParking = () => {
    return useQuery({
        queryKey: ['active-parking'],
        queryFn: async () => {
            // ✅ TAMA - gamitin ang staff prefix
            const response = await api.get('/staff/parking/active');
            return response.data;
        },
    });
};

export const useParkingHistory = () => {
    return useQuery({
        queryKey: ['parking-history'],
        queryFn: async () => {
            // ✅ TAMA
            const response = await api.get('/staff/parking/history');
            return response.data;
        },
    });
};

export const useTodayCheckins = () => {
    return useQuery({
        queryKey: ['today-checkins'],
        queryFn: async () => {
            // ✅ TAMA
            const response = await api.get('/staff/parking/today-checkins');
            return response.data;
        },
    });
};

export const useAvailableSlots = () => {
    return useQuery({
        queryKey: ['available-slots'],
        queryFn: async () => {
            // ✅ TAMA
            const response = await api.get('/customer/slots/available');
            return response.data;
        },
    });
};