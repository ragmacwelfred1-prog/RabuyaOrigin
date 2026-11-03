import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface Customer {
    id: number;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address: string;
    check_in_date: string;
    check_in_time: string;
    expected_checkout_date: string;
    parking_slot_id: number;
    status: string;
}

export const useCustomers = () => {
    return useQuery({
        queryKey: ['customers'],
        queryFn: async () => {
            const response = await api.get('/customers');
            return response.data as Customer[];
        },
    });
};

export const useCreateCustomer = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (data: any) => {
            const response = await api.post('/customers', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['slots-available'] });
        },
    });
};

export const useCheckoutCustomer = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: any }) => {
            const response = await api.post(`/customers/${id}/checkout`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['slots-available'] });
        },
    });
};