import { IsString, IsBoolean } from 'class-validator';

export class ToggleModuleDto {
    @IsString()
    moduleCode: string;

    @IsBoolean()
    isEnabled: boolean;
}
