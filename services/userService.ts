import fs from 'fs';
import * as userModel from '../models/user';
import * as userDetailsModel from '../models/userDetails';
import * as addressModel from '../models/address';
import { withTransaction } from '../utils/transaction';
import { pickFields, UserDetailsSchema, AddressSchema } from '../schemas/index';
import { UserDetails, Address, UserMobile } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const upsertProfile = async (
  userId: string,
  body: Record<string, any>
): Promise<{ userDetails: UserDetails; address: Address }> => {
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: 'country_id' });
  const a = pickFields(body, AddressSchema, { address_country_id: 'country_id' });

  return withTransaction(async (client) => {
    const details = await userDetailsModel.upsert(userId, d, client);
    const address = await addressModel.upsert(userId, a, client);
    return { userDetails: details, address };
  });
};

export const getUser = async (userId: string): Promise<Record<string, any>> => {
  const user = await userModel.findSummaryById(userId);
  if (!user) throw err('No user found.', 404);
  return user;
};

export const getUserProfile = async (userId: string): Promise<Record<string, any>> => {
  const profile = await userModel.findProfileById(userId);
  if (!profile) throw err('No user found.', 404);
  return profile;
};

export const getAddress = async (userId: string): Promise<Record<string, any>> => {
  const address = await addressModel.findWithJoinsByUserId(userId);
  if (!address) throw err('No address found.', 404);
  return address;
};

export const updateDetails = async (userId: string, body: Record<string, any>): Promise<UserDetails> => {
  const d = pickFields(body, UserDetailsSchema);
  const existing = await userDetailsModel.findByUserId(userId);
  if (!existing) throw err('User details not found', 404);
  if (existing.mobile_number !== d.mobile_number) throw err('You are not allowed to update mobile number', 400);
  return userDetailsModel.update(userId, d);
};

export const updateAddress = async (userId: string, body: Record<string, any>): Promise<Address> => {
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(userId);
  if (!existing) throw err('Address not found', 404);
  return addressModel.update(userId, a);
};

export const deleteUser = async (userId: string): Promise<void> => {
  const row = await userModel.findMobileById(userId);
  if (!row) throw err('User not found', 404);
  await userModel.deleteById(userId);
  const userDir = `uploads/${row.mobile_number}`;
  if (fs.existsSync(userDir)) fs.rmSync(userDir, { recursive: true });
};

export const getByMobileNumber = async (mobile: string): Promise<UserDetails> => {
  const details = await userDetailsModel.findByMobileNumber(mobile);
  if (!details) throw err('User details not found', 404);
  return details;
};
