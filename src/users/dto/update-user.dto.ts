import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/** All fields from CreateUserDto, but every one optional. */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
