// What this changes and why. Rules (ADR-0012): never edit a migration once it
// is merged to main, and keep it compatible with the release before it, since
// rolling back the image does not roll back the schema.

exports.up = (pgm) => {
  pgm.sql(`
  `);
};

// Write a down where it is cheap and safe; otherwise `exports.down = false;`.
exports.down = (pgm) => {
  pgm.sql(`
  `);
};
