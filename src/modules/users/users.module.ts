import { Module } from '@nestjs/common';

import { LocalFileStorage } from 'src/common/storage/local-file-storage';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService, LocalFileStorage],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
