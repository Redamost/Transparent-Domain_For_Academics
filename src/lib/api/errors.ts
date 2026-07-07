import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiError(statusCode: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, details } },
    { status: statusCode }
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function notFound(entity = 'Resource') {
  return apiError(404, 'NOT_FOUND', `${entity} not found`);
}

export function unauthorized(message = 'Authentication required') {
  return apiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Insufficient permissions') {
  return apiError(403, 'FORBIDDEN', message);
}

export function validationError(message: string, details?: unknown) {
  return apiError(400, 'VALIDATION_ERROR', message, details);
}

export function conflict(message: string) {
  return apiError(409, 'CONFLICT', message);
}

export function rateLimited(message = 'Too many requests. Please try again later.') {
  return apiError(429, 'RATE_LIMITED', message);
}
