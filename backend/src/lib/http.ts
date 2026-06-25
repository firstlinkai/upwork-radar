import type { Response } from 'express';
import type { ApiSuccess, ApiError } from '../types';

// Helpers to enforce the `{ success, data }` / `{ success, error }` envelope
// (PRD §18) consistently across all routes.

export function ok<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(status).json(body);
}

export function fail(res: Response, error: string, status = 400): Response {
  const body: ApiError = { success: false, error };
  return res.status(status).json(body);
}
