import { IsBoolean } from 'class-validator';
export class PinDto { @IsBoolean() pin: boolean; }
