import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';

export const AUTH_TOKEN_KEY = 'auth_token';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: 15_000,
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token is invalid/expired — clear it so the app can redirect to login.
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    }
    return Promise.reject(error);
  },
);
