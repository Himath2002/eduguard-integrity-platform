import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Role } from "@/shared/types/auth";
import { clearPersistedSession, loadPersistedSession, persistSession } from "@/shared/lib/authSession";

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

const persisted = typeof window !== "undefined" ? loadPersistedSession() : null;

const initialState: AuthState = {
    isAuthed: Boolean(persisted?.userId && persisted?.role),
    userId: persisted?.userId ?? null,
    role: persisted?.role ?? null,
    name: persisted?.name ?? null,
    username: persisted?.username ?? null,
    email: persisted?.email ?? null,
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
            persistSession({
                userId: action.payload.userId,
                role: action.payload.role,
                name: action.payload.name ?? null,
                username: action.payload.username ?? null,
                email: action.payload.email ?? null,
            });
        },
        clearSession() {
            clearPersistedSession();
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
