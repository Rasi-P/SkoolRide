import { api } from "./client";
import type { PublicConfig, User } from "@/types";

export interface LoginResponse {
  access: string;
  user: User;
}

export const authApi = {
  login: (email: string, password: string) => api.post<LoginResponse>("/auth/login/", { email, password }).then((r) => r.data),
  logout: () => api.post("/auth/logout/"),
  me: () => api.get<User>("/auth/me/").then((r) => r.data),
  updateMe: (data: Partial<Pick<User, "first_name" | "last_name" | "phone">>) => api.patch<User>("/auth/me/", data).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) => api.post("/auth/change-password/", { current_password, new_password }),
  requestReset: (email: string) => api.post("/auth/password-reset/", { email }),
  confirmReset: (uid: string, token: string, new_password: string) => api.post("/auth/password-reset/confirm/", { uid, token, new_password }),
  invitation: (token: string) =>
    api
      .get<{ email: string; first_name: string; last_name: string; role: string; school_name: string; expires_at: string; existing_account: boolean }>(
        `/auth/invitations/${token}/`,
      )
      .then((r) => r.data),
  acceptInvitation: (data: { token: string; first_name?: string; last_name?: string; phone?: string; password?: string; current_password?: string }) =>
    api.post<LoginResponse>("/auth/invitations/accept/", data).then((r) => r.data),
  publicConfig: () => api.get<PublicConfig>("/public/config/").then((r) => r.data),
};
