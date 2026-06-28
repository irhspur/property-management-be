import fs from 'fs';
import * as propertyModel from '../models/property';
import * as userModel from '../models/user';
import { withTransaction } from '../utils/transaction';
import { pickFields, PropertySchema } from '../schemas/index';
import { Property } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const createProperty = async (userId: string, body: Record<string, any>): Promise<Property> => {
  const f = pickFields(body, PropertySchema);
  const exists = await propertyModel.findByUserAndName(userId, f.property_name);
  if (exists) throw err('Property with this name already exists for this user', 400);
  return propertyModel.create(userId, f);
};

export const getProperties = async (userId: string): Promise<Record<string, any>[]> =>
  propertyModel.findByUserId(userId);

export const getById = async (id: string): Promise<Record<string, any>> => {
  const property = await propertyModel.findById(id);
  if (!property) throw err('Property not found', 404);
  return property;
};

export const getByMobileNumber = async (mobile: string): Promise<Record<string, any>[]> =>
  propertyModel.findByMobileNumber(mobile);

export const updateProperty = async (id: string, userId: string, body: Record<string, any>): Promise<Property> => {
  const f = pickFields(body, PropertySchema);
  const updated = await propertyModel.update(id, userId, f);
  if (!updated) throw err('Property not found', 404);
  return updated;
};

export const deleteProperty = async (id: string, userId: string): Promise<Property> => {
  const vacancy = await propertyModel.checkVacancy(id, userId);
  if (!vacancy) throw err('Property not found or unauthorized', 404);
  if (!vacancy.is_vacant) throw err('Property is not vacant', 400);

  const user = await userModel.findMobileById(userId);
  if (!user) throw err('User not found', 404);

  const propertyName = await propertyModel.findNameById(id);
  if (!propertyName) throw err('Property not found', 404);

  const propertyDir = `uploads/${user.mobile_number}/${propertyName}`;

  return withTransaction(async (client) => {
    const deleted = await propertyModel.deleteById(id, userId, client);
    if (!deleted) throw err('Property not found or unauthorized', 404);
    if (fs.existsSync(propertyDir)) fs.rmSync(propertyDir, { recursive: true });
    return deleted;
  });
};
