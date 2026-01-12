import { IsString, IsUUID } from 'class-validator';

export class AssignPlanDto {
    @IsString() // could be UUID but plan_id usually UUID
    planId: string;
}
