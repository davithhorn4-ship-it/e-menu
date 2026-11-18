// src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
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
  clearAuthCookies,
  setAuthCookies,
} from 'src/common/http/cookie-options';
import { getCookie } from 'src/common/http/request-cookies';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { UsersService } from 'src/modules/users/users.service';

import { AuthErrors } from './auth.errors';
import { type AuthTokens, AuthService } from './auth.service';
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
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
  @HttpCode(HttpStatus.OK)
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
    const tokens = await this.auth.login(body.email, body.password);
    return this.sendTokens(res, tokens);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiBody({ type: RefreshTokenDto, required: false })
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully and auth cookies are updated',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse(loginUnauthorizedResponse)
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.refresh(refreshTokenOf(body, req));
    return this.sendTokens(res, tokens);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiBody({ type: RefreshTokenDto, required: false })
  @ApiOperation({
    summary: 'Sign out and clear auth cookies',
    description:
      'Idempotent logout. Ends the session of the refresh token sent in the body or the refreshToken cookie, clears both cookies, and returns success even if the token is missing, invalid, or already expired.',
  })
  @ApiOkResponse({
    description:
      'Logout successful. This endpoint always returns success and clears auth cookies even when no valid refresh token is present.',
    type: EmptySuccessResponseDto,
  })
  async logout(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = refreshTokenOf(body, req);
    if (refreshToken) await this.auth.logoutByRefreshToken(refreshToken);

    clearAuthCookies(res);
    return { success: true, data: null };
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
    if (!uid) throw AuthErrors.accessTokenRequired();

    const user = await this.users.findSafeById(uid);
    return { success: true, data: { user } };
  }

  /** Sets the auth cookies and returns the tokens in the body too. */
  private sendTokens(res: Response, tokens: AuthTokens) {
    setAuthCookies(res, tokens);
    return { success: true, data: tokens };
  }
}

/** Refresh token from the body (clients without cookies) or the cookie. */
const refreshTokenOf = (body: RefreshTokenDto | undefined, req: Request) =>
  body?.refreshToken ?? getCookie(req, 'refreshToken');
