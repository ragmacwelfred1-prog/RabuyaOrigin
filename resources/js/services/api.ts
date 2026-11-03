// resources/js/services/api.ts
import axios from "axios";

const baseURL = "https://darkgray-bear-137683.hostingersite.com/api";

const api = axios.create({
    baseURL,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

export default api;