// resources/js/services/api.ts
import axios from "axios";

const baseURL =
    (import.meta as any).env?.VITE_API_URL || "/api";

const api = axios.create({
    baseURL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

export default api;