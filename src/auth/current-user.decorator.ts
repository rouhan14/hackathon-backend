import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SafeUser } from './auth.service';

/** Pulls the authenticated user (set by JwtStrategy) off the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SafeUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as SafeUser;
  },
);
