import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles) {
            return true; // Jeśli endpoint nie wymaga żadnej roli, przepuść
        }
        const { user } = context.switchToHttp().getRequest();
        // Sprawdzamy, czy rola użytkownika znajduje się na liście wymaganych ról
        return requiredRoles.some((role) => user.role?.includes(role));
    }
}