import type { RequestHandler } from 'express';

export type Identity = { subject: string; email: string | null };
export type LocalUser = { id: string; email: string | null; subject: string };
export type FuelSettings = { gallonsPerFillup: string; fillupsPerWeek: string; currencyCode: string; timezone: string };
export interface AuthProvider {
  verify(token: string): Promise<string>;
  getIdentity(subject: string): Promise<Identity>;
}
export interface UserStore {
  sync(identity: Identity): Promise<LocalUser>;
  getSettings(userId: string): Promise<FuelSettings | null>;
  close(): Promise<void>;
}
export type AuthServices = { provider: AuthProvider; store: UserStore };
export type AuthContext = { localUser: LocalUser };
export type AuthenticatedHandler = RequestHandler;
