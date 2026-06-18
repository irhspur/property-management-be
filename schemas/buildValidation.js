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
      rule = rule.optional({ nullable: true });
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
        rule = rule.isInt({ min: 1 }).withMessage(`${field} must be a positive integer`);
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
