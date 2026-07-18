import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects a route: requires a valid `Authorization: Bearer <token>` header. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Keep the 401 status but return a specific reason so the frontend can react
   * (e.g. refresh/re-login on expiry vs. hard error on a bad token).
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      throw new UnauthorizedException(this.reasonFrom(info, err));
    }
    return user;
  }

  private reasonFrom(info: unknown, err: unknown): string {
    const name = (info as Error | undefined)?.name;
    const message = (info as Error | undefined)?.message;

    if (name === 'TokenExpiredError') {
      return 'Access token has expired.';
    }
    if (name === 'JsonWebTokenError') {
      return 'Invalid access token.';
    }
    // passport-jwt reports a missing header as "No auth token".
    if (message === 'No auth token') {
      return 'Authentication token is missing.';
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return 'Unauthorized.';
  }
}
