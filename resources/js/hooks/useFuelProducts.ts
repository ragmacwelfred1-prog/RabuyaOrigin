// hooks/useFuelProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

// GET all fuel products
export const useFuelProducts = () => {
    return useQuery({
        queryKey: ['fuel-products'],
        queryFn: async () => {
            const response = await api.get('/fuel-products');
            return response.data;
        },
    });
};

// CREATE fuel product
export const useCreateFuelProduct = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (data: any) => {
            const response = await api.post('/fuel-products', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fuel-products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};

// UPDATE fuel product
export const useUpdateFuelProduct = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: any }) => {
            const response = await api.put(`/fuel-products/${id}`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fuel-products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};

// DELETE fuel product
export const useDeleteFuelProduct = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (id: number) => {
            const response = await api.delete(`/fuel-products/${id}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fuel-products'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
    });
};