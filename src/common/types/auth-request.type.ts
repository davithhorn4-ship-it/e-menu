import { Request } from 'express';
import type { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role?: Role;
  };
}
