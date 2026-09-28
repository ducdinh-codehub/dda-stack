import { createSlice } from '@reduxjs/toolkit';

// Example slice — copy this shape for your own state, then add the reducer
// to the store in src/store/index.ts.
interface CounterState {
  count: number;
}

const initialState: CounterState = { count: 0 };

const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment: state => {
      state.count += 1;
    },
    decrement: state => {
      state.count -= 1;
    },
    reset: () => initialState,
  },
});

export const { increment, decrement, reset } = counterSlice.actions;
export default counterSlice.reducer;
