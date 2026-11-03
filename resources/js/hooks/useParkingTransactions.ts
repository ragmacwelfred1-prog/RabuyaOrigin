// hooks/useParkingTransactions.ts
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export const useParkingTransactions = () => {
    return useQuery({
        queryKey: ['parking-transactions'],
        queryFn: async () => {
            try {
                const response = await api.get('/staff/parking/history');
                // Ensure na array ang return value
                if (Array.isArray(response.data)) {
                    return response.data;
                }
                // Kung ang response ay object na may data property
                if (response.data && Array.isArray(response.data.data)) {
                    return response.data.data;
                }
                return [];
            } catch (error) {
                console.error('Error fetching parking transactions:', error);
                return [];
            }
        },
    });
};