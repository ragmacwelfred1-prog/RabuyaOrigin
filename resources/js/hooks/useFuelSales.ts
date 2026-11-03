import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export const useTodaySales = () => {
    return useQuery({
        queryKey: ['fuel-sales-today'],
        queryFn: async () => {
            const response = await api.get('/fuel/sales/today');
            return response.data;
        },
    });
};