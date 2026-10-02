const { body } = require('express-validator');

/**
 * Derive an express-validator chain array from a schema object.
 * @param {object} schema - one of the *Schema exports from schemas/index.js
 * @param {object} aliases - { reqBodyField: dbColumn } — same map passed to pickFields
 * @returns {import('express-validator').ValidationChain[]}
 */
function buildValidationRules(schema, aliases = {}) {
  const reverseAliases = Object.fromEntries(
    Object.entries(aliases).map(([reqField, dbCol]) => [dbCol, reqField])
  );

  return Object.entries(schema).map(([dbCol, def]) => {
    const field = reverseAliases[dbCol] ?? dbCol;
    let rule = body(field).trim();

    if (def.optional) {
      // A field left blank by an HTML form arrives as "", never undefined, and
      // must be skipped rather than validated. Normalise it to null first, then
      // skip on null — do NOT use optional({ values: 'falsy' }), which also
      // skips 0 and lets a bogus `birth_province_id: 0` through to the FK
      // column as a 500 instead of a 400. pickFields() turns the null into a
      // SQL NULL before it reaches the INSERT.
      rule = rule
        .customSanitizer((v) => (typeof v === 'string' && v.trim() === '' ? null : v))
        .optional({ values: 'null' });
    } else {
      rule = rule.notEmpty().withMessage(`${field} is required`);
    }

    switch (def.type) {
      case 'string':
        if (def.minLen)
          rule = rule.isLength({ min: def.minLen })
            .withMessage(`${field} must be at least ${def.minLen} characters`);
        if (def.maxLen)
          rule = rule.isLength({ max: def.maxLen })
            .withMessage(`${field} must be at most ${def.maxLen} characters`);
        if (def.regex)
          rule = rule.matches(def.regex)
            .withMessage(`${field} contains invalid characters`);
        break;

      case 'int':
        if (def.max === undefined) {
          rule = rule.isInt({ min: 1 }).withMessage(`${field} must be a positive integer`);
          break;
        }
        // `max` may be a function for a bound that moves with the calendar
        // (e.g. the current BS year), resolved per request.
        rule = rule.custom(async (v) => {
          const min = def.min ?? 1;
          const max = typeof def.max === 'function' ? await def.max() : def.max;
          if (!/^-?\d+$/.test(String(v)) || Number(v) < min || Number(v) > max)
            throw new Error(`${field} must be an integer between ${min} and ${max}`);
          return true;
        });
        break;

      case 'float':
        rule = rule.isFloat().withMessage(`${field} must be a number`).bail();
        if (def.gt !== undefined)
          rule = rule.isFloat({ gt: def.gt })
            .withMessage(`${field} must be greater than ${def.gt}`);
        if (def.min !== undefined)
          rule = rule.isFloat({ min: def.min, max: def.max })
            .withMessage(`${field} must be between ${def.min} and ${def.max}`);
        else if (def.max !== undefined)
          rule = rule.isFloat({ max: def.max })
            .withMessage(`${field} must be at most ${def.max}`);
        break;

      case 'enum':
        rule = rule.isIn(def.values)
          .withMessage(`${field} must be one of: ${def.values.join(', ')}`);
        break;

      case 'digits':
        rule = rule
          .isNumeric().withMessage(`${field} must be numeric`)
          .isLength({ min: def.min, max: def.max })
            .withMessage(`${field} must be between ${def.min} and ${def.max} digits`)
          .matches(/^[0-9]+$/).withMessage(`${field} must contain only digits`);
        break;

      case 'date':
        rule = rule.isDate().withMessage(`${field} must be a valid date`);
        if (def.before === 'today')
          rule = rule.isBefore().withMessage(`${field} must be before today`);
        break;

      case 'decimal':
        rule = rule.isNumeric().withMessage(`${field} must be a number`);
        if (def.maxLen)
          rule = rule.isLength({ max: def.maxLen })
            .withMessage(`${field} must be at most ${def.maxLen} digits`);
        break;

      case 'boolean':
        rule = rule.isBoolean().withMessage(`${field} must be true or false`);
        break;
    }

    return rule;
  });
}

module.exports = { buildValidationRules };
