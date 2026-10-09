// One router per lookup table (ADR-0011), built from its
// description in services/lookupTables.ts. Reads are open to every role,
// writes are admin-only. PUT takes the id in the path (preferred) or as
// ?id= — the admin app uses both — and validation rules come from the
// description, so every table answers in the same shapes.
const express = require("express");
const { body } = require("express-validator");
const authorize = require("../middleware/authorization");
const validate = require("../middleware/validate");
const lookupTables = require("../services/lookupTables");
const { CATEGORY_CODE_PATTERN, CATEGORY_CODE_FORMAT_MESSAGE } = require("../config/categoryCodes");

const READ = ["admin", "property_owner", "tenant"];
const WRITE = ["admin"];

const fieldRule = (field) => {
  let chain = body(field.name);
  if (!field.required) chain = chain.optional({ values: "falsy" });
  if (field.kind === "number") {
    if (field.required) chain = chain.notEmpty().withMessage(`${field.label} must not be empty`).bail();
    return chain
      .isFloat({ min: field.min, max: field.maxValue })
      .withMessage(`${field.label} must be a number from ${field.min} to ${field.maxValue}`);
  }
  chain = chain.trim();
  if (field.required) chain = chain.notEmpty().withMessage(`${field.label} must not be empty`).bail();
  chain = chain.isLength({ max: field.max }).withMessage(`${field.label} must be at most ${field.max} characters`);
  if (field.pattern) chain = chain.matches(field.pattern).withMessage(field.patternMessage);
  return chain;
};

const rulesFor = (t, mode) => {
  const rules = t.fields.map(fieldRule);
  if (t.parent) {
    rules.push(
      body(t.parent.column).isInt({ min: 1 }).withMessage(`${t.parent.column} must be a positive integer`)
    );
  }
  if (t.code && mode === "create") {
    rules.push(
      body("code").trim().notEmpty().withMessage("code is required").bail()
        .matches(CATEGORY_CODE_PATTERN).withMessage(CATEGORY_CODE_FORMAT_MESSAGE)
    );
  }
  return rules;
};

// LookupError → its status, as the validation envelope when it names a
// field. Anything else is a real 500, never a 200 NAK.
const respond = (res, error) => {
  if (error instanceof lookupTables.LookupError) {
    if (error.field) return res.status(error.statusCode).json({ errors: [{ field: error.field, message: error.message }] });
    return res.status(error.statusCode).json({ status: "NAK", message: error.message });
  }
  console.error(error.message);
  return res.status(500).json({ status: "NAK", message: "Something went wrong" });
};

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    respond(res, error);
  }
};

const lookupRouter = (t) => {
  const router = express.Router();

  router.get("/", authorize(READ), handle(async (req, res) => {
    res.json({ status: "AK", data: await lookupTables.list(t) });
  }));

  if (t.parent) {
    router.get(`/${t.parent.route}`, authorize(READ), handle(async (req, res) => {
      res.json({ status: "AK", data: await lookupTables.listByParent(t, req.query[t.parent.column]) });
    }));
  }

  router.get("/:id", authorize(READ), handle(async (req, res) => {
    res.json({ status: "AK", data: await lookupTables.get(t, req.params.id) });
  }));

  router.post("/", authorize(WRITE), rulesFor(t, "create"), validate, handle(async (req, res) => {
    const data = await lookupTables.create(t, req.body);
    res.json({ status: "AK", message: `${t.label} created successfully`, data });
  }));

  const update = handle(async (req, res) => {
    const data = await lookupTables.update(t, req.params.id ?? req.query.id, req.body);
    res.json({ status: "AK", message: `${t.label} updated successfully`, data });
  });
  router.put("/:id", authorize(WRITE), rulesFor(t, "update"), validate, update);
  router.put("/", authorize(WRITE), rulesFor(t, "update"), validate, update);

  router.delete("/:id", authorize(WRITE), handle(async (req, res) => {
    await lookupTables.remove(t, req.params.id);
    res.json({ status: "AK", message: `${t.label} deleted successfully` });
  }));

  return router;
};

// Mounts every lookup table at /<path>.
const mountLookupTables = (app) => {
  for (const t of lookupTables.LOOKUP_TABLES) app.use(`/${t.path}`, lookupRouter(t));
};

module.exports = { lookupRouter, mountLookupTables };
