import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
} from "class-validator";

export class RegisterCarPullerDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsPhoneNumber()
  phone: string;
}
