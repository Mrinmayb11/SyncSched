import axios from 'axios';
import supabase from './supabase/SupabaseClient.js'; // Adjust path if needed

// Create a reusable Axios instance
const axiosInstance = axios.create({
  // baseURL handled by Vite proxy
  timeout: 60000, // Default 60 seconds timeout (can be overridden per request)
});

// Request Interceptor
axiosInstance.interceptors.request.use(
  async (config) => {
    // Get Supabase session before the request is sent
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Axios Interceptor: Supabase session error:', sessionError);
      // Optionally handle error, e.g., redirect to login
    } else if (session) {
      // If session exists, add the Authorization header
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }

    // Ensure Content-Type is set for relevant methods if needed
    if (config.method === 'post' || config.method === 'put' || config.method === 'patch') {
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }

    return config; // Return the modified config
  },
  (error) => {
    // Handle request error (e.g., network error before request is sent)
    console.error('Axios Interceptor: Request error:', error);
    return Promise.reject(error);
  }
);

// Optional: Response interceptor (for handling global errors like 401, etc.)
axiosInstance.interceptors.response.use(
  (response) => {
    // Any status code within 2xx range cause this function to trigger
    return response;
  },
  (error) => {
    // Any status codes outside 2xx range cause this function to trigger
    console.error('Axios Interceptor: Response error:', error.response?.status, error.response?.data);
    // Global error handling can be added here if needed
    return Promise.reject(error);
  }
);

export default axiosInstance; 