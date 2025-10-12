import { SetMetadata } from '@nestjs/common';

export enum Role {
    Employee = 'employee', // Poprawiłem nazwę z 'User' dla spójności
    Admin = 'admin',
    SuperAdmin = 'super_admin',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);