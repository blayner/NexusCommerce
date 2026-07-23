import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Public } from '../../../shared/auth';
import { unwrap } from '../../../shared/domain';
import { AccessToken, IdentityService } from '../application/identity.service';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(8, 72) // bcrypt only uses the first 72 bytes
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain letters and numbers' })
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 72)
  password!: string;
}

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AccessToken> {
    return unwrap(await this.identity.register(dto));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AccessToken> {
    return unwrap(await this.identity.login(dto.email, dto.password));
  }
}
