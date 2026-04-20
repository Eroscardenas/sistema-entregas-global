export class AppError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function throwIfError(error: any) {
  if (!error) return;
  const msg = String(error?.message ?? 'Error');
  const code = String(error?.code ?? 'SUPABASE_ERROR');

  if (msg.toLowerCase().includes('permission')) {
    throw new AppError('FORBIDDEN', 'No autorizado', 403, error);
  }
  throw new AppError(code, msg, 400, error);
}
