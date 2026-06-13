import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class ProviderWebhookDto {
  @IsString()
  @Length(4, 128)
  providerReference!: string;

  @IsIn(['APPROVED', 'DECLINED'])
  status!: 'APPROVED' | 'DECLINED';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
