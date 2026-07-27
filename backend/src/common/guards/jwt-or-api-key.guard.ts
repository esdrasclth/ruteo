import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiKeyGuard, API_KEY_HEADER } from './api-key.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

// Accepts either a Bearer JWT (users) or an `x-api-key` header (merchant
// integrations). If the API-key header is present, only that path is tried.
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context.switchToHttp().getRequest();
    if (request.headers[API_KEY_HEADER]) {
      return this.apiKeyGuard.canActivate(context);
    }
    return this.jwtGuard.canActivate(context) as Promise<boolean> | boolean;
  }
}
