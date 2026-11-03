// hooks/useDashboardStats.ts
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export const useDashboardStats = () => {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            // ✅ TAMA - gamitin ang tamang backend route
            const response = await api.get('/admin/dashboard/stats');
            return response.data;
        },
    });
};