import * as fileModel from '../models/file';
import * as fileStore from './fileStore';
import * as userModel from '../models/user';
import * as userDetailsModel from '../models/userDetails';
import * as addressModel from '../models/address';
import { withTransaction } from '../utils/transaction';
import { pickFields, UserDetailsSchema, AddressSchema } from '../schemas/index';
import { UserDetails, Address, UserMobile } from '../types';
import { appError } from '../utils/appError';

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
  if (!user) throw appError('No user found.', 404);
  return user;
};

export const getUserProfile = async (userId: string): Promise<Record<string, any>> => {
  const profile = await userModel.findProfileById(userId);
  if (!profile) throw appError('No user found.', 404);
  return profile;
};

export const getAddress = async (userId: string): Promise<Record<string, any>> => {
  const address = await addressModel.findWithJoinsByUserId(userId);
  if (!address) throw appError('No address found.', 404);
  return address;
};

export const updateDetails = async (userId: string, body: Record<string, any>): Promise<UserDetails> => {
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: 'country_id' });
  const existing = await userDetailsModel.findByUserId(userId);
  if (!existing) throw appError('User details not found', 404);
  if (existing.mobile_number !== d.mobile_number) throw appError('You are not allowed to update mobile number', 400);
  return userDetailsModel.update(userId, d);
};

export const updateAddress = async (userId: string, body: Record<string, any>): Promise<Address> => {
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(userId);
  if (!existing) throw appError('Address not found', 404);
  return addressModel.update(userId, a);
};

// The cascade takes the user's Documents, photo, Properties, and every
// Agreement on those Properties or with them as Tenant; their files go once
// it commits.
export const deleteUser = async (userId: string): Promise<void> => {
  const row = await userModel.findMobileById(userId);
  if (!row) throw appError('User not found', 404);
  const paths = await withTransaction(async (client) => {
    const paths = await fileModel.findPathsCascadingFromUser(userId, client);
    await userModel.deleteById(userId, client);
    return paths;
  });
  fileStore.discard(paths);
};
