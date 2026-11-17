import { API_BASE_URL } from '@env';

export const ENV = {
  API_BASE_URL: API_BASE_URL || 'https://api.example.com',
} as const;
