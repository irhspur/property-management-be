export const UserDetailsSchema: Record<string, object> = {
  birth_country_id: { type: 'int', optional: true },
  birth_province_id: { type: 'int', optional: true },
  birth_district_id: { type: 'int', optional: true },
  gender_id: { type: 'int', optional: true },
  citizenship_issue_district_id: { type: 'int', optional: true },
  first_name: { type: 'string', maxLen: 50, regex: /^[A-Za-z\s\-]+$/ },
  middle_name: { type: 'string', maxLen: 50, regex: /^[A-Za-z\s\-]+$/, optional: true },
  last_name: { type: 'string', maxLen: 50 },
  dob: { type: 'date', before: 'today' },
  father_full_name: { type: 'string', maxLen: 100, regex: /^[A-Za-z\s\-]+$/ },
  nin_number: { type: 'string', maxLen: 10, regex: /^[0-9A-Za-z]+$/ },
  mobile_number: { type: 'digits', min: 10, max: 15 },
  citizenship_number: { type: 'string', maxLen: 20, regex: /^[a-zA-Z0-9\s\-\/]+$/ },
  citizenship_issue_date: { type: 'date', before: 'today' },
  bank_account_number: { type: 'string', maxLen: 20, regex: /^[a-zA-Z0-9\s\-\/]+$/ },
  bank_name: { type: 'string', maxLen: 100, regex: /^[A-Za-z\s\-]+$/ },
};

export const AddressSchema: Record<string, object> = {
  country_id: { type: 'int', optional: true },
  province_id: { type: 'int', optional: true },
  district_id: { type: 'int', optional: true },
  municipality_id: { type: 'int', optional: true },
  ward_number: { type: 'int' },
  street_name: { type: 'string', minLen: 3, maxLen: 100 },
  house_number: { type: 'string', maxLen: 10, regex: /^[A-Za-z0-9\s\-]+$/, optional: true },
  contact_number_1: { type: 'digits', min: 5, max: 15 },
  contact_number_2: { type: 'digits', min: 5, max: 15, optional: true },
  contact_address: { type: 'string', minLen: 5, maxLen: 200 },
};

export const PropertySchema: Record<string, object> = {
  country_id: { type: 'int', optional: true },
  province_id: { type: 'int', optional: true },
  district_id: { type: 'int', optional: true },
  municipality_id: { type: 'int', optional: true },
  property_type_id: { type: 'int', optional: true },
  ward_number: { type: 'int' },
  street_name: { type: 'string', minLen: 3, maxLen: 100 },
  house_number: { type: 'string', maxLen: 10, regex: /^[A-Za-z0-9\s\-]+$/, optional: true },
  property_name: { type: 'string', minLen: 3, maxLen: 100 },
  property_description: { type: 'string', maxLen: 500, optional: true },
  property_value: { type: 'decimal', maxLen: 15, optional: true },
  is_vacant: { type: 'boolean', optional: true },
};

export function pickFields(
  body: Record<string, any>,
  schema: Record<string, object>,
  aliases: Record<string, string> = {}
): Record<string, any> {
  const reverseAliases = Object.fromEntries(
    Object.entries(aliases).map(([reqField, dbCol]) => [dbCol, reqField])
  );
  const result: Record<string, any> = {};
  for (const dbCol of Object.keys(schema)) {
    const reqField = reverseAliases[dbCol] ?? dbCol;
    if (body[reqField] !== undefined) {
      result[dbCol] = body[reqField];
    }
  }
  return result;
}
