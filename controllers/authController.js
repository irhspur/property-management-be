const authService = require("../services/authService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const register = async (req, res) => {
  try {
    const { email, password, user_type_id } = req.body;
    const { user, token } = await authService.register({ email, password, user_type_id });
    res.json({
      status: "AK",
      message: "User registered successfully. Please check your email to verify your account.",
      data: user,
      token,
    });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const verifyEmail = async (req, res) => {
  try {
    await authService.verifyEmail(req.query.token);
    res.json({ status: "AK", message: "Email verified successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(error.statusCode || 400).json({ status: "NAK", message: "Invalid or expired token" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login({ email, password });
    res.json({ status: "AK", data: user, token });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { token } = await authService.forgotPassword(req.body.email);
    res.json({ status: "AK", message: "Password reset link sent to email", token });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const resetPassword = async (req, res) => {
  try {
    await authService.resetPassword(req.query.token, req.body.newPassword);
    res.json({ status: "AK", message: "Password reset successfully" });
  } catch (error) {
    console.error(error.message);
    res.status(error.statusCode || 400).json({ status: "NAK", message: "Invalid or expired token" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    res.json({ status: "AK", message: "Password changed successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = { register, verifyEmail, login, forgotPassword, resetPassword, changePassword };
