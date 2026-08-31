import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Role } from "@/shared/types/auth";

type AuthState = {
    isAuthed: boolean;
    userId: string | null;
    role: Role | null;
    name: string | null;
    username: string | null;
    email: string | null;
};

type SessionPayload = {
    userId: string;
    role: Role;
    name?: string;
    username?: string;
    email?: string;
};

const e2eSession =
    import.meta.env.DEV && import.meta.env.VITE_E2E_SESSION === "true"
        ? (window as Window & { __EDUGUARD_E2E_SESSION__?: SessionPayload })
              .__EDUGUARD_E2E_SESSION__ ?? null
        : null;

const initialState: AuthState = {
    isAuthed: Boolean(e2eSession?.userId && e2eSession?.role),
    userId: e2eSession?.userId ?? null,
    role: e2eSession?.role ?? null,
    name: e2eSession?.name ?? null,
    username: e2eSession?.username ?? null,
    email: e2eSession?.email ?? null,
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setSession(state, action: PayloadAction<SessionPayload>) {
            state.userId = action.payload.userId;
            state.role = action.payload.role;
            state.name = action.payload.name ?? null;
            state.username = action.payload.username ?? null;
            state.email = action.payload.email ?? null;
            state.isAuthed = true;
        },
        clearSession() {
            return {
                isAuthed: false,
                userId: null,
                role: null,
                name: null,
                username: null,
                email: null,
            };
        },
    },
});

export const { setSession, clearSession } = authSlice.actions;
export default authSlice.reducer;
