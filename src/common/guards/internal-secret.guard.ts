import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';

function timingSafeEqualStr(a?: string, b?: string) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = a.trim();
  const bb = b.trim();
  const ba = Buffer.from(aa);
  const bbuff = Buffer.from(bb);
  if (ba.length !== bbuff.length) return false;
  return crypto.timingSafeEqual(ba, bbuff);
}

@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[]> }>();
    const gotHeader = req.headers['x-internal-secret'];
    const got = Array.isArray(gotHeader) ? gotHeader[0] : gotHeader; // на випадок дубльованих заголовків
    const expected = process.env.INTERNAL_SECRET;

    

    if (!timingSafeEqualStr(got, expected)) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    return true;
  }
}
