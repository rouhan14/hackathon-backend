import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { JwtPayload, SafeUser } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Runs after the signature/expiry are verified; return value becomes req.user. */
  async validate(payload: JwtPayload): Promise<SafeUser> {
    const user = await this.users.findOne(payload.sub).catch(() => null);
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
