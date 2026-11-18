import { getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';

export const loginBadRequestResponse = {
  description: 'Login request body is invalid.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
  examples: {
    validationFailed: {
      summary: 'Body validation failed',
      value: {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message:
            'email must be an email; password must be longer than or equal to 8 characters',
          type: 'Bad Request',
        },
      },
    },
  },
};

export const loginUnauthorizedResponse = {
  description: 'Email or password is incorrect.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
  examples: {
    invalidCredentials: {
      summary: 'Invalid credentials',
      value: {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
          type: 'UnauthorizedException',
        },
      },
    },
  },
};

export const loginForbiddenResponse = {
  description: 'Login is blocked because the account is disabled.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
  examples: {
    accountDisabled: {
      summary: 'Account disabled',
      value: {
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account is disabled',
          type: 'ForbiddenException',
        },
      },
    },
  },
};

export const meBadRequestResponse = {
  description: 'The authenticated user id is invalid or unavailable.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
};

export const meUnauthorizedResponse = {
  description: 'Access token is missing, invalid, or expired.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
};

export const meForbiddenResponse = {
  description: 'The authenticated account is not allowed to access this route.',
  schema: { $ref: getSchemaPath(ErrorResponseDto) },
};
