import { Test, TestingModule } from '@nestjs/testing';
import { CompanySettingsController } from './company-settings.controller';

describe('CompanySettingsController', () => {
  let controller: CompanySettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanySettingsController],
    }).compile();

    controller = module.get<CompanySettingsController>(CompanySettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
