// The tenant portal (/tenant): a Tenant reading their own records. Every
// record is resolved with ownership.byTenant, then handed to the same payload
// builder the owner routes use, so the two can't drift (spec decision 11).
import * as agreementModel from '../models/agreement';
import * as agreementService from './agreementService';

export const getAgreements = async (tenantId: string, baseUrl: string): Promise<Record<string, any>[]> =>
  agreementService.toListRows(await agreementModel.findByTenant(tenantId), baseUrl);
