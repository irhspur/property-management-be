const pool = require("../config/database");

const getAddressByUserId = async (req, res) => {
  try {
    const user_id = req.user.id;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1",
      [user_id]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found for this user" });
    }
    res.json({ status: "AK", data: address.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching address" });
  }
};
const createAddress = async (req, res) => {
  try {
    const user_id = req.user.id;
    const {
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number_1,
      contact_number_2,
      contact_address,
    } = req.body;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1 AND country_id = $2 AND province_id = $3 AND district_id = $4 AND municipality_id = $5",
      [user_id, country_id, province_id, district_id, municipality_id]
    );
    if (address.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Address already exists for this user",
      });
    }
    const newAddress = await pool.query(
      `
              INSERT INTO address (
                  user_id, 
                  country_id, 
                  province_id, 
                  district_id, 
                  municipality_id, 
                  ward_number, 
                  street_name, 
                  house_number, 
                  contact_number_1, 
                  contact_number_2, 
                  contact_address
              ) 
              VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), INITCAP($8), $9, $10, INITCAP($11)) RETURNING *
              `,
      [
        user_id,
        country_id,
        province_id,
        district_id,
        municipality_id,
        ward_number,
        street_name,
        house_number,
        contact_number_1,
        contact_number_2,
        contact_address,
      ]
    );
    res.json({
      status: "AK",
      data: newAddress.rows[0],
      message: "Address created successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating address" });
  }
};
const updateAddress = async (req, res) => {
  try {
    const user_id = req.user.id;
    const {
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number_1,
      contact_number_2,
      contact_address,
    } = req.body;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1",
      [user_id]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found" });
    }
    const updatedAddress = await pool.query(
      `
              UPDATE address 
              SET 
                  country_id = $1, 
                  province_id = $2, 
                  district_id = $3, 
                  municipality_id = $4, 
                  ward_number = $5, 
                  street_name = INITCAP($6), 
                  house_number = INITCAP($7), 
                  contact_number_1 = $8, 
                  contact_number_2 = $9, 
                  contact_address = INITCAP($10),
                  updated_at = NOW()
              WHERE user_id = $11 RETURNING *
              `,
      [
        country_id,
        province_id,
        district_id,
        municipality_id,
        ward_number,
        street_name,
        house_number,
        contact_number_1,
        contact_number_2,
        contact_address,
        user_id,
      ]
    );
    res.json({
      status: "AK",
      data: updatedAddress.rows[0],
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating address" });
  }
};
const deleteAddress = async (req, res) => {
  try {
    const user_id = req.user.id;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1",
      [user_id]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found" });
    }
    await pool.query("DELETE FROM address WHERE user_id = $1", [user_id]);
    res.json({ status: "AK", message: "Address deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting address" });
  }
};

module.exports = {
  getAddressByUserId,
  createAddress,
  updateAddress,
  deleteAddress,
};
