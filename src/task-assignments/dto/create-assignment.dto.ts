import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    // W przyszłości możemy tu dodać `assigned_date`
}