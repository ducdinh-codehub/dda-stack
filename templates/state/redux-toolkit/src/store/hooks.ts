import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

// Use these instead of plain useDispatch/useSelector so state and dispatch are typed.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
