import { Test, TestingModule } from '@nestjs/testing';
import { TaskAssignmentsService } from './task-assignments.service';

describe('TaskAssignmentsService', () => {
  let service: TaskAssignmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskAssignmentsService],
    }).compile();

    service = module.get<TaskAssignmentsService>(TaskAssignmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
