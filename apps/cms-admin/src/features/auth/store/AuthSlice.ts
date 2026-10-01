import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type userRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  displayName: string;
}

export interface AuthState {
  user: User | null;
  role: userRole;
  basePermissions: string[];
  dynamicPermissions: string[];
}

const initialState: AuthState = {
  user: null,
  role: 'viewer',
  basePermissions: [],
  dynamicPermissions: [],
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthState: (state: AuthState, action: PayloadAction<AuthState>) => {
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.basePermissions = action.payload.basePermissions;
      state.dynamicPermissions = action.payload.dynamicPermissions;
    },
    grantDynamicPermission: (state: AuthState, action: PayloadAction<string>) => {
      if (!state.dynamicPermissions.includes(action.payload)) {
        state.dynamicPermissions.push(action.payload);
      }
    },
    revokeDynamicPermission: (state: AuthState, action: PayloadAction<string>) => {
      state.dynamicPermissions = state.dynamicPermissions.filter(
        (permission) => permission !== action.payload,
      );
    },
  },
});

export const { setAuthState, grantDynamicPermission, revokeDynamicPermission } = authSlice.actions;
export default authSlice.reducer;
