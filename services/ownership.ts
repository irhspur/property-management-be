// GLOSSARY.md "Ownership": may this Property Owner act on this record? Each
// lookup returns the record, or throws 404 — never 403, so ids can't be
// probed (ADR-0009). A malformed id is a 404 too. Lists and summaries aren't
// lookups: they scope by owner in their own SQL.
import * as propertyModel from '../models/property';
import * as agreementModel from '../models/agreement';
import * as paymentModel from '../models/payment';
import * as ownerTenantModel from '../models/ownerTenant';
import * as fileModel from '../models/file';
import { isUuid } from '../utils/validators';

const notFound = (what: string): Error => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

// A Tenant is owned through an Ownership Link.
export const tenant = async (ownerId: string, tenantId: string): Promise<Record<string, any>> => {
  const found = isUuid(tenantId) ? await ownerTenantModel.findLinkedTenant(ownerId, tenantId) : null;
  if (!found) throw notFound('Tenant');
  return found;
};

// A Property is owned by the user who created it.
export const property = async (ownerId: string, propertyId: string): Promise<Record<string, any>> => {
  const found = isUuid(propertyId) ? await propertyModel.findById(propertyId) : null;
  if (!found || found.user_id !== ownerId) throw notFound('Property');
  return found;
};

// An Agreement is owned through its Property. No Ownership Link check: the
// link outlives every Agreement on it. `tenant`, when a route names one, must
// be the Agreement's Tenant.
export const agreement = async (
  ownerId: string,
  agreementId: string,
  opts: { tenant?: string } = {}
): Promise<Record<string, any>> => {
  const found = isUuid(agreementId) ? await agreementModel.findById(agreementId) : null;
  if (!found || found.property_owner_id !== ownerId || (opts.tenant !== undefined && found.tenant_id !== opts.tenant)) {
    throw notFound('Agreement');
  }
  return found;
};

// A Payment is owned through its Agreement, and must be on it. Returns both,
// since every caller needs the Agreement's terms too.
export const payment = async (
  ownerId: string,
  paymentId: string,
  parent: { agreement: string; tenant?: string }
): Promise<{ agreement: Record<string, any>; payment: Record<string, any> }> => {
  const owned = await agreement(ownerId, parent.agreement, { tenant: parent.tenant });
  const found = isUuid(paymentId) ? await paymentModel.findById(paymentId) : null;
  if (!found || found.agreement_id !== owned.agreement_id) throw notFound('Payment');
  return { agreement: owned, payment: found };
};

// Where a Document hangs, as the route names it.
//   self      the caller's own personal Documents (/user/file)
//   tenant    a linked Tenant's personal Documents
//   property  a Property's Documents; null means any of the owner's Properties,
//             for routes that address a property Document by its own id
//   agreement an Agreement's Documents
//   payment   a Payment's receipts
// Personal Documents are the ones with a file category. An Agreement document
// or receipt is also stored under the Tenant's user_id, but is reached only
// through its own parent.
export type DocumentParent =
  | { self: true }
  | { tenant: string }
  | { property: string | null }
  | { agreement: string; tenant?: string }
  | { payment: string; agreement: string; tenant?: string };

// A Document is owned through its parent: the owner must own the parent, and
// the Document must be attached to it.
export const document = async (
  ownerId: string,
  fileId: string,
  parent: DocumentParent
): Promise<Record<string, any>> => {
  if (!isUuid(fileId)) throw notFound('File');
  let found: Record<string, any> | null;

  if ('self' in parent) {
    found = await fileModel.findPersonalDocument(fileId);
    if (found && found.user_id !== ownerId) found = null;
  } else if ('payment' in parent) {
    await payment(ownerId, parent.payment, { agreement: parent.agreement, tenant: parent.tenant });
    found = await fileModel.findPaymentReceiptById(fileId, parent.payment);
  } else if ('agreement' in parent) {
    await agreement(ownerId, parent.agreement, { tenant: parent.tenant });
    found = await fileModel.findAgreementFileById(fileId, parent.agreement);
  } else if ('tenant' in parent) {
    await tenant(ownerId, parent.tenant);
    found = await fileModel.findPersonalDocument(fileId);
    if (found && found.user_id !== parent.tenant) found = null;
  } else {
    const row = await fileModel.findPropertyDocument(fileId);
    found = null;
    if (row && row.property_owner_id === ownerId && (parent.property === null || row.property_id === parent.property)) {
      const { property_owner_id, ...file } = row;
      found = file;
    }
  }

  if (!found) throw notFound('File');
  return found;
};

// Tenant side (tenant portal): may this Tenant read this record? A Tenant owns
// the Agreements they are the Tenant on, and what hangs off them. Same rules
// as above: the record, or 404. No Ownership Link check, so an ended
// Agreement stays visible.
const tenantAgreement = async (tenantId: string, agreementId: string): Promise<Record<string, any>> => {
  const found = isUuid(agreementId) ? await agreementModel.findById(agreementId) : null;
  if (!found || found.tenant_id !== tenantId) throw notFound('Agreement');
  return found;
};

const tenantPayment = async (
  tenantId: string,
  paymentId: string,
  parent: { agreement: string }
): Promise<{ agreement: Record<string, any>; payment: Record<string, any> }> => {
  const owned = await tenantAgreement(tenantId, parent.agreement);
  const found = isUuid(paymentId) ? await paymentModel.findById(paymentId) : null;
  if (!found || found.agreement_id !== owned.agreement_id) throw notFound('Payment');
  return { agreement: owned, payment: found };
};

// Where a Document hangs, as a /tenant route names it: the Tenant's own
// personal Documents, or an Agreement's Documents, or a Payment's receipts.
export type TenantDocumentParent =
  | { self: true }
  | { agreement: string }
  | { payment: string; agreement: string };

const tenantDocument = async (
  tenantId: string,
  fileId: string,
  parent: TenantDocumentParent
): Promise<Record<string, any>> => {
  if ('self' in parent) return document(tenantId, fileId, parent);
  if (!isUuid(fileId)) throw notFound('File');
  let found: Record<string, any> | null;
  if ('payment' in parent) {
    await tenantPayment(tenantId, parent.payment, { agreement: parent.agreement });
    found = await fileModel.findPaymentReceiptById(fileId, parent.payment);
  } else {
    await tenantAgreement(tenantId, parent.agreement);
    found = await fileModel.findAgreementFileById(fileId, parent.agreement);
  }
  if (!found) throw notFound('File');
  return found;
};

export const byTenant = {
  agreement: tenantAgreement,
  payment: tenantPayment,
  document: tenantDocument,
};
