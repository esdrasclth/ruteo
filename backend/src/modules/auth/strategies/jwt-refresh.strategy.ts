import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt.strategy';
import { REFRESH_COOKIE, cookieDe } from '../auth-cookies';

export interface RefreshPayload extends JwtPayload {
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => cookieDe(req, REFRESH_COOKIE),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshPayload {
    const header = req.get('authorization') ?? '';
    const refreshToken =
      header.replace(/^Bearer\s+/i, '').trim() ||
      cookieDe(req, REFRESH_COOKIE) ||
      '';
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    return { ...payload, refreshToken };
  }
}
