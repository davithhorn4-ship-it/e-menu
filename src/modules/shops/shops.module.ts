import { Module } from '@nestjs/common';

import { LocalFileStorage } from 'src/common/storage/local-file-storage';
import { ShopContextService } from './shop-context.service';
import { ShopProfileController } from './shop-profile.controller';
import { ShopProfileService } from './shop-profile.service';

@Module({
  providers: [ShopContextService, ShopProfileService, LocalFileStorage],
  exports: [ShopContextService],
  controllers: [ShopProfileController],
})
export class ShopsModule {}
