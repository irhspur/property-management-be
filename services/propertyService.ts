import * as fileModel from '../models/file';
import * as fileStore from './fileStore';
import * as propertyModel from '../models/property';
import * as ownership from './ownership';
import * as paymentModel from '../models/payment';
import * as activityModel from '../models/activityEvent';
import { withTransaction } from '../utils/transaction';
import { pickFields, PropertySchema } from '../schemas/index';
import { Property } from '../types';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

export const createProperty = async (userId: string, body: Record<string, any>): Promise<Property> => {
  const f = pickFields(body, PropertySchema);
  const exists = await propertyModel.findByUserAndName(userId, f.property_name);
  if (exists) throw err('Property with this name already exists for this user', 400);
  return withTransaction(async (client) => {
    const property = await propertyModel.create(userId, f, client);
    await activityModel.record(
      {
        ownerId: userId,
        type: 'property.created',
        subjectKind: 'property',
        subjectId: property.property_id,
        context: { property_name: property.property_name },
      },
      client
    );
    return property;
  });
};

export const getProperties = async (userId: string): Promise<Record<string, any>[]> =>
  propertyModel.findByUserId(userId);

export const getById = async (ownerId: string, id: string): Promise<Record<string, any>> =>
  ownership.property(ownerId, id);

export const updateProperty = async (id: string, userId: string, body: Record<string, any>): Promise<Property> => {
  const f = pickFields(body, PropertySchema);
  // Clearing the area clears the unit it was entered in; otherwise the stored
  // unit would outlive its value and trip properties_area_unit_pair.
  if (f.land_area_sqft === null && f.land_area_unit === undefined) f.land_area_unit = null;
  const updated = await propertyModel.update(id, userId, f);
  if (!updated) throw err('Property not found', 404);
  return updated;
};

export const deleteProperty = async (id: string, userId: string): Promise<Property> => {
  const property = await ownership.property(userId, id);
  if (!property.is_vacant) throw err('Property is not vacant', 400);

  // is_vacant only reflects active Agreements (ADR-0004) — a property whose
  // tenancies have all ended reads as vacant but can still carry Payment
  // history that a cascade delete would destroy. Grill session 2026-08-22.
  const hasPayments = await paymentModel.existsForProperty(id);
  if (hasPayments) throw err('Property has recorded payments and cannot be deleted', 400);

  // The cascade takes the Property's Documents and its ended Agreements'
  // documents; their files go once it commits.
  const { deleted, paths } = await withTransaction(async (client) => {
    const paths = await fileModel.findPathsCascadingFromProperty(id, client);
    const deleted = await propertyModel.deleteById(id, userId, client);
    if (!deleted) throw err('Property not found or unauthorized', 404);
    await activityModel.record(
      {
        ownerId: userId,
        type: 'property.deleted',
        subjectKind: 'property',
        subjectId: id,
        context: { property_name: deleted.property_name },
      },
      client
    );
    return { deleted, paths };
  });
  fileStore.discard(paths);
  return deleted;
};
