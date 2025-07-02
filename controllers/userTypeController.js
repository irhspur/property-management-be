const pool = require("../config/database");

const getAllUserTypes = async (req, res) => {
  try {
    const userTypes = await pool.query("SELECT * FROM user_type");
    res.json({ status: "AK", data: userTypes.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user types" });
  }
};

const getUserTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const userType = await pool.query("SELECT * FROM user_type WHERE id = $1", [
      id,
    ]);
    if (userType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User type not found" });
    }
    res.json({ status: "AK", data: userType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user type" });
  }
};

const createUserType = async (req, res) => {
  try {
    const { name } = req.body;
    const userType = await pool.query(
      "SELECT * FROM user_type WHERE lower(name) = lower($1)",
      [name]
    );
    if (userType.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "User type already exists" });
    }
    const newUserType = await pool.query(
      "INSERT INTO user_type (name) VALUES (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({ status: "AK", data: newUserType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating user type" });
  }
};

const updateUserType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userType = await pool.query("SELECT * FROM user_type WHERE id = $1", [
      id,
    ]);
    if (userType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User type not found" });
    }
    const updatedUserType = await pool.query(
      "UPDATE user_type SET name = INITCAP($1) WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedUserType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating user type" });
  }
};

const deleteUserType = async (req, res) => {
  try {
    const { id } = req.params;
    const userType = await pool.query("SELECT * FROM user_type WHERE id = $1", [
      id,
    ]);
    if (userType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User type not found" });
    }
    await pool.query("DELETE FROM user_type WHERE id = $1", [id]);
    res.json({ status: "AK", message: "User type deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting user type" });
  }
};

const getUserTypeByName = async (req, res) => {
  try {
    const { name } = req.params;
    const userType = await pool.query(
      "SELECT * FROM user_type WHERE lower(name) = lower($1)",
      [name]
    );
    if (userType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "User type not found" });
    }
    res.json({ status: "AK", data: userType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching user type" });
  }
};

module.exports = {
  getAllUserTypes,
  getUserTypeById,
  createUserType,
  updateUserType,
  deleteUserType,
  getUserTypeByName,
};
