// src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { SkipCsrf } from 'src/common/decorators/skip-csrf.decorator';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { EmptySuccessResponseDto } from 'src/common/dto/success-response.dto';
import {
  accessTokenCookieOptions,
  clearAccessTokenCookieOptions,
  clearRefreshTokenCookieOptions,
  refreshTokenCookieOptions,
} from 'src/common/http/cookie-options';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { UsersService } from 'src/modules/users/users.service';

import { AuthService } from './auth.service';
import { loginApiBody } from './dto/auth-body.docs';
import {
  loginBadRequestResponse,
  loginForbiddenResponse,
  loginUnauthorizedResponse,
  meBadRequestResponse,
  meForbiddenResponse,
  meUnauthorizedResponse,
} from './dto/auth-response.docs';
import { LoginResponseDto, MeResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiExtraModels(ErrorResponseDto)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody(loginApiBody)
  @ApiOkResponse({
    description: 'Login successful and auth cookies are set',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse(loginBadRequestResponse)
  @ApiUnauthorizedResponse(loginUnauthorizedResponse)
  @ApiForbiddenResponse(loginForbiddenResponse)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.login(
      body.email,
      body.password,
    );

    res.cookie('accessToken', accessToken, accessTokenCookieOptions());
    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions());

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @ApiCookieAuth('refreshToken')
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully and auth cookies are updated',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse(loginUnauthorizedResponse)
  async refresh(
    @Body() body: { refreshToken?: string } | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = body?.refreshToken ?? req.cookies?.refreshToken;
    const { accessToken, refreshToken: nextRefreshToken } =
      await this.auth.refresh(refreshToken);

    res.cookie('accessToken', accessToken, accessTokenCookieOptions());
    res.cookie('refreshToken', nextRefreshToken, refreshTokenCookieOptions());

    return {
      success: true,
      data: {
        accessToken,
        refreshToken: nextRefreshToken,
      },
    };
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @ApiCookieAuth('refreshToken')
  @ApiOperation({
    summary: 'Sign out and clear auth cookies',
    description:
      'Idempotent logout. Clears access and refresh cookies and returns success even if the refresh token cookie is missing, invalid, or already expired.',
  })
  @ApiOkResponse({
    description:
      'Logout successful. This endpoint always returns success and clears auth cookies even when no valid refresh token is present.',
    type: EmptySuccessResponseDto,
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.auth.logoutByRefreshToken(refreshToken);
    }

    res.clearCookie('accessToken', clearAccessTokenCookieOptions());
    res.clearCookie('refreshToken', clearRefreshTokenCookieOptions());

    return {
      success: true,
      data: null,
    };
  }

  @Get('me')
  @ApiExtraModels(ErrorResponseDto)
  @ApiBearerAuth('bearer')
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({
    description: 'Authenticated user returned successfully',
    type: MeResponseDto,
  })
  @ApiBadRequestResponse(meBadRequestResponse)
  @ApiUnauthorizedResponse(meUnauthorizedResponse)
  @ApiForbiddenResponse(meForbiddenResponse)
  async me(@Req() req: AuthRequest) {
    const uid = req.user?.userId;
    if (!uid) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token is required',
      });
    }

    const user = await this.users.findSafeById(uid);

    return {
      success: true,
      data: { user },
    };
  }
}
