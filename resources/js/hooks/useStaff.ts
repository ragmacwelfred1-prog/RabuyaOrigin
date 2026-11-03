import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

interface Staff {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    employee_id: string;
    is_active: boolean;
}

export const useStaff = () => {
    return useQuery({
        queryKey: ['staff'],
        queryFn: async () => {
            const response = await api.get('/staff');
            return response.data as Staff[];
        },
    });
};

export const useCreateStaff = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (data: Omit<Staff, 'id'> & { password: string }) => {
            const response = await api.post('/staff', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
    });
};

export const useUpdateStaff = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async ({ id, ...data }: Staff & { password?: string }) => {
            const response = await api.put(`/staff/${id}`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
    });
};

export const useDeleteStaff = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/staff/${id}`);
            return id;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
    });
};