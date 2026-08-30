import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyService } from './idempotency.service';

const HEADER = 'idempotency-key';

// Makes a mutating endpoint idempotent when the client sends an `Idempotency-Key`
// header: the first request runs and its response is stored; retries with the same
// key replay the stored response instead of re-executing.
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyService) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const rawKey = req.headers[HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const tenantId = req.user?.tenantId;

    if (!key || !tenantId) {
      return next.handle();
    }

    const endpoint = `${req.method} ${req.path}`;
    const begin = await this.store.begin(tenantId, key, endpoint);

    if (begin.state === 'replay') {
      res.status(begin.status);
      return of(begin.body);
    }
    if (begin.state === 'in_progress') {
      throw new ConflictException(
        'Ya hay una petición en curso con este Idempotency-Key',
      );
    }
    if (begin.state === 'conflict') {
      throw new ConflictException(
        'Este Idempotency-Key ya se usó para otra operación',
      );
    }

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        await this.store.complete(tenantId, key, res.statusCode, body);
        return body;
      }),
      catchError((err: unknown) =>
        from(this.store.release(tenantId, key)).pipe(
          concatMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}
