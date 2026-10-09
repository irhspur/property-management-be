// CONTEXT.md "Ownership": may this Property Owner act on this record? Each
// lookup returns the record, or throws 404 — never 403, so ids can't be
// probed (ADR-0009). A malformed id is a 404 too. Lists and summaries aren't
// lookups: they scope by owner in their own SQL.
import * as propertyModel from '../models/property';
import * as fileModel from '../models/file';
import { isUuid } from '../utils/validators';

const notFound = (what: string): Error => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

// A Property is owned by the user who created it.
export const property = async (ownerId: string, propertyId: string): Promise<Record<string, any>> => {
  const found = isUuid(propertyId) ? await propertyModel.findById(propertyId) : null;
  if (!found || found.user_id !== ownerId) throw notFound('Property');
  return found;
};

// Where a Document hangs. `property` with no id means "any of the owner's
// Properties", for routes that address a property Document by its own id.
export type DocumentParent = { property: string | null };

// A Document is owned through its parent: the owner must own the parent, and
// the Document must be attached to it.
export const document = async (
  ownerId: string,
  fileId: string,
  parent: DocumentParent
): Promise<Record<string, any>> => {
  const found = isUuid(fileId) ? await fileModel.findPropertyDocument(fileId) : null;
  if (
    !found ||
    found.property_owner_id !== ownerId ||
    (parent.property !== null && found.property_id !== parent.property)
  ) {
    throw notFound('File');
  }
  const { property_owner_id, ...file } = found;
  return file;
};
