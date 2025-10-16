import { Test, TestingModule } from '@nestjs/testing';
import { LocationQrCodesService } from './location-qr-codes.service';

describe('LocationQrCodesService', () => {
  let service: LocationQrCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocationQrCodesService],
    }).compile();

    service = module.get<LocationQrCodesService>(LocationQrCodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
