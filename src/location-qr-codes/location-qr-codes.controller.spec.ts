import { Test, TestingModule } from '@nestjs/testing';
import { LocationQrCodesController } from './location-qr-codes.controller';

describe('LocationQrCodesController', () => {
  let controller: LocationQrCodesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationQrCodesController],
    }).compile();

    controller = module.get<LocationQrCodesController>(LocationQrCodesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
