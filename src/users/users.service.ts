import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    try {
      return await this.prisma.user.create({ data: dto });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A user with email "${dto.email}" already exists.`,
        );
      }
      throw error;
    }
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Create a user with a pre-hashed password (used by the auth/signup flow). */
  async createWithCredentials(data: {
    email: string;
    name?: string;
    passwordHash: string;
  }): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A user with email "${data.email}" already exists.`,
        );
      }
      throw error;
    }
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User "${id}" not found.`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data: dto });
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException(`User "${id}" not found.`);
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `A user with email "${dto.email}" already exists.`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<User> {
    try {
      return await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException(`User "${id}" not found.`);
      }
      throw error;
    }
  }

  /** Prisma "unique constraint failed". */
  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  /** Prisma "record to update/delete not found". */
  private isNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
