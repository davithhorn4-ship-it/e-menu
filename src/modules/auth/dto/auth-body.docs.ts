import { LoginDto } from './login.dto';

// Placeholder values only: never put a real account here.
export const loginApiBody = {
  type: LoginDto,
  examples: {
    default: {
      value: {
        email: 'admin@example.com',
        password: 'change-me-please',
      },
    },
  },
};
