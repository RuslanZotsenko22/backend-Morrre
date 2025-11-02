import { IsString } from 'class-validator';
export class ReadDto { @IsString() lastMessageId: string; }
