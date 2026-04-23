import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Passes through regardless — but when a valid `Authorization: Bearer <token>`
 * header is present, attaches the decoded payload as `req.user`.
 * Used by public chat endpoints that benefit from knowing the user when logged in.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader) return true;

    const token = authHeader.split(' ')[1];
    if (!token) return true;

    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secretKey',
      });
      req.user = decoded;
    } catch {
      // Ignore invalid/expired tokens — behave as guest
    }
    return true;
  }
}
