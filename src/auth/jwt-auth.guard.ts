import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException();
    
    const token = authHeader.split(' ')[1];
    if (!token) throw new UnauthorizedException();
    
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secretKey',
      });
      
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub }
      });
      
      if (!user) {
        throw new UnauthorizedException();
      }
      
      request.user = decoded;
      return true;
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
