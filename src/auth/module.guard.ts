import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULES_KEY } from './modules.decorator';
import { SubscriptionService } from '../subscription/subscription.service';
import { Role } from './roles.decorator';

@Injectable()
export class ModuleGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private subscriptionService: SubscriptionService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredModules = this.reflector.getAllAndOverride<string[]>(MODULES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredModules || requiredModules.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) return false;

        // Super Admin bypass
        if (user.role === Role.SuperAdmin) return true;

        const companyId = user.company_id;
        if (!companyId) return false;

        // Check if ALL required modules are enabled
        for (const moduleCode of requiredModules) {
            const isEnabled = await this.subscriptionService.isModuleEnabled(companyId, moduleCode);
            if (!isEnabled) {
                throw new ForbiddenException(`Moduł ${moduleCode} nie jest aktywny w Twoim planie.`);
            }
        }

        return true;
    }
}
