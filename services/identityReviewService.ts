import * as reviewModel from '../models/identityReview';
import * as fileModel from '../models/file';
import { appError } from '../utils/appError';
import { isUuid } from '../utils/validators';

const NOT_FOUND = 'Property Owner not found';

// A malformed id is 404 too (ADR-0009).
const findOwnerOr404 = async (userId: string) => {
  const owner = isUuid(userId) ? await reviewModel.findOwner(userId) : null;
  if (!owner) throw appError(NOT_FOUND, 404);
  return owner;
};

export const listOwners = () => reviewModel.findOwners();

// What the reviewer reads: the owner, their details and address, their
// personal Documents (no stored paths) and the current review.
export const getOwnerReview = async (userId: string) => {
  const owner = await findOwnerOr404(userId);
  const [details, files, review] = await Promise.all([
    reviewModel.findDetails(userId),
    fileModel.findTenantFiles(userId), // any user's personal Documents, despite the name
    reviewModel.findReview(userId),
  ]);
  const documents = files.map(({ file_id, file_category_name, original_name, mimetype, file_size, upload_date }) => ({
    file_id,
    file_category_name,
    original_name,
    mimetype,
    file_size,
    upload_date,
  }));
  return { owner: { ...owner, details }, documents, review };
};

// Records the reviewer's verdict, replacing any earlier one. A reason goes
// with a rejection only. An owner with no profile has nothing to verify.
export const reviewOwner = async (
  userId: string,
  fields: { status: 'verified' | 'rejected'; rejection_reason?: string },
  reviewedBy: string
): Promise<reviewModel.IdentityReview> => {
  const owner = await findOwnerOr404(userId);
  if (fields.status === 'verified' && !owner.has_profile) {
    throw appError("This owner hasn't filled in their profile yet, so there's nothing to verify", 400, 'PROFILE_INCOMPLETE');
  }
  await reviewModel.upsert({
    userId,
    status: fields.status,
    rejectionReason: fields.status === 'rejected' ? (fields.rejection_reason as string) : null,
    reviewedBy,
  });
  return reviewModel.findReview(userId);
};

// One of the owner's personal Documents, for a Signed View URL.
export const getOwnerDocument = async (userId: string, fileId: string) => {
  await findOwnerOr404(userId);
  const file = isUuid(fileId) ? await fileModel.findPersonalDocument(fileId) : null;
  if (!file || file.user_id !== userId) throw appError('Document not found', 404);
  return file;
};
