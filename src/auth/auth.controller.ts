import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConnectionsService } from '../connections/connections.service';
import { AuthService } from './auth.service';
import type { AuthResult, SafeUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MeEntity } from './me.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create an account and receive a JWT.' })
  signup(@Body() dto: SignupDto): Promise<AuthResult> {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email + password and receive a JWT.' })
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Return the current user along with their integrations.',
  })
  @ApiOkResponse({ type: MeEntity })
  async me(@CurrentUser() user: SafeUser): Promise<MeEntity> {
    const integrations = await this.connectionsService.findAll(user.id);
    return { ...user, integrations };
  }
}
