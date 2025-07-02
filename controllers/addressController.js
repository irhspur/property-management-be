const pool = require("../config/database");

const getAddressByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;
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
    const {
      user_id,
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number1,
      contact_number2,
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
                  contact_number1, 
                  contact_number2, 
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
        contact_number1,
        contact_number2,
        contact_address,
      ]
    );
    res.json({ status: "AK", data: newAddress.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating address" });
  }
};
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      user_id,
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      contact_number1,
      contact_number2,
      contact_address,
    } = req.body;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1 AND address_info_id = $2",
      [user_id, id]
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
                  user_id = $1, 
                  country_id = $2, 
                  province_id = $3, 
                  district_id = $4, 
                  municipality_id = $5, 
                  ward_number = $6, 
                  street_name = INITCAP($7), 
                  house_number = INITCAP($8), 
                  contact_number1 = $9, 
                  contact_number2 = $10, 
                  contact_address = INITCAP($11)
              WHERE address_info_id = $12 RETURNING *
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
        contact_number1,
        contact_number2,
        contact_address,
        id,
      ]
    );
    res.json({ status: "AK", data: updatedAddress.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating address" });
  }
};
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1 AND address_info_id = $2",
      [user_id, id]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found" });
    }
    await pool.query("DELETE FROM address WHERE id = $1", [id]);
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
