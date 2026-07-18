import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUserRecord = Prisma.UserGetPayload<{
  select: typeof safeUserSelect;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<SafeUserRecord> {
    const user = await this.createUserWithWorkspace(dto);
    return this.toSafeUser(user);
  }

  findByEmailWithCredentials(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createWithCredentials(data: {
    email: string;
    name?: string;
    passwordHash: string;
  }): Promise<User> {
    return this.createUserWithWorkspace(data);
  }

  async findOne(id: string): Promise<SafeUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
    if (!user) {
      throw new NotFoundException(`User "${id}" not found.`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUserRecord> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
        select: safeUserSelect,
      });
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException(`User "${id}" not found.`);
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('That email address is already in use.');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException(`User "${id}" not found.`);
      }
      throw error;
    }
  }

  private async createUserWithWorkspace(data: {
    email: string;
    name?: string;
    passwordHash?: string;
  }): Promise<User> {
    const displayName = data.name?.trim() || data.email.split('@')[0];
    const slugBase = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    try {
      return await this.prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          memberships: {
            create: {
              role: MembershipRole.OWNER,
              organization: {
                create: {
                  name: `${displayName}'s Workspace`,
                  slug: `${slugBase || 'workspace'}-${randomUUID().slice(0, 8)}`,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A user with email "${data.email}" already exists.`,
        );
      }
      throw error;
    }
  }

  private toSafeUser(user: User): SafeUserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
