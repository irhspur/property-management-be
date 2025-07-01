const jwt = require("jsonwebtoken");
require("dotenv").config();

const jwtGenerator = (id) => {
  const payload = { id };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
};

const generateVerificationToken = (email) => {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "24h" });
};

const generateResetToken = (email) => {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "15m" });
};

module.exports = {
  jwtGenerator,
  generateVerificationToken,
  generateResetToken,
};
