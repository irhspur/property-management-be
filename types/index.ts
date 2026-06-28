import { Pool, PoolClient } from 'pg';

export type DbClient = Pool | PoolClient;

export interface User {
  user_id: number;
  email: string;
  password: string;
  user_type_id: number;
  is_verified: boolean;
  is_active: boolean;
  password_last_changed: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserDetails {
  user_details_id: number;
  user_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender_id?: number;
  dob?: Date;
  country_id?: number;
  birth_province_id?: number;
  birth_district_id?: number;
  father_full_name?: string;
  nin_number?: string;
  mobile_number: string;
  citizenship_number?: string;
  citizenship_issue_district_id?: number;
  citizenship_issue_date?: Date;
  bank_account_number?: string;
  bank_name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Address {
  address_id: number;
  user_id: number;
  country_id?: number;
  province_id?: number;
  district_id?: number;
  municipality_id?: number;
  ward_number: number;
  street_name: string;
  house_number?: string;
  contact_number_1: string;
  contact_number_2?: string;
  contact_address: string;
  created_at: Date;
  updated_at: Date;
}

export interface FileRecord {
  file_id: number;
  user_id: number;
  property_id?: number;
  file_category_id?: number;
  property_file_category_id?: number;
  original_name: string;
  mimetype: string;
  file_size: number;
  file_name: string;
  file_path: string;
  upload_date: Date;
  updated_at: Date;
}

export interface Property {
  property_id: number;
  user_id: number;
  country_id?: number;
  province_id?: number;
  district_id?: number;
  municipality_id?: number;
  ward_number: number;
  street_name: string;
  house_number?: string;
  property_type_id?: number;
  property_name: string;
  property_description?: string;
  property_value?: number;
  is_vacant: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserDetailsFields {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender_id?: number;
  dob?: Date;
  country_id?: number;
  birth_province_id?: number;
  birth_district_id?: number;
  father_full_name?: string;
  nin_number?: string;
  mobile_number?: string;
  citizenship_number?: string;
  citizenship_issue_district_id?: number;
  citizenship_issue_date?: Date;
  bank_account_number?: string;
  bank_name?: string;
}

export interface AddressFields {
  country_id?: number;
  province_id?: number;
  district_id?: number;
  municipality_id?: number;
  ward_number?: number;
  street_name?: string;
  house_number?: string;
  contact_number_1?: string;
  contact_number_2?: string;
  contact_address?: string;
}

export interface PropertyFields {
  country_id?: number;
  province_id?: number;
  district_id?: number;
  municipality_id?: number;
  ward_number?: number;
  street_name?: string;
  house_number?: string;
  property_type_id?: number;
  property_name?: string;
  property_description?: string;
  property_value?: number;
  is_vacant?: boolean;
}

export interface FileFields {
  user_id: number;
  file_category_id?: number;
  property_id?: number;
  property_file_category_id?: number;
  original_name: string;
  mimetype: string;
  file_size: number;
  file_name: string;
  file_path: string;
}

export interface UpdateFileFields {
  original_name: string;
  mimetype: string;
  file_size: number;
  file_name: string;
  file_path: string;
}

export interface UserMobile {
  user_id: number;
  mobile_number: string;
}

export interface SessionData {
  is_verified: boolean;
  is_active: boolean;
  userType: string;
}

export interface UserData {
  firstName: string;
  mobileNumber: string;
}

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer: Buffer;
}
