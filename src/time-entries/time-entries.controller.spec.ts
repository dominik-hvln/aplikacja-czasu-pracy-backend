import { Test, TestingModule } from '@nestjs/testing';
import { TimeEntriesService } from './time-entries.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('TimeEntriesService', () => {
    let service: TimeEntriesService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TimeEntriesService,
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn(() => ({
                            from: jest.fn(() => ({
                                select: jest.fn().mockReturnThis(),
                                eq: jest.fn().mockReturnThis(),
                                is: jest.fn().mockReturnThis(),
                                single: jest.fn().mockResolvedValue({ data: {}, error: null }),
                                update: jest.fn().mockReturnThis(),
                                insert: jest.fn().mockReturnThis(),
                            })),
                        })),
                    },
                },
            ],
        }).compile();

        service = module.get<TimeEntriesService>(TimeEntriesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});