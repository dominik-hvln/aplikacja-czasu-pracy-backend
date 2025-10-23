import { Test, TestingModule } from '@nestjs/testing';
import { TaskAssignmentsController } from './task-assignments.controller';

describe('TaskAssignmentsController', () => {
  let controller: TaskAssignmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskAssignmentsController],
    }).compile();

    controller = module.get<TaskAssignmentsController>(TaskAssignmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
