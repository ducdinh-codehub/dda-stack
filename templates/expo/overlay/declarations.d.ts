declare module '@env' {
  export const API_BASE_URL: string;
}

declare module '*.png' {
  const value: number;
  export default value;
}
