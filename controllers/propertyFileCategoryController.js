export const getPropertyFileCategories = async (req, res) => {
  try {
    const propertyFileCategories = await pool.query(
      "SELECT * FROM property_file_categories"
    );
    res.json({ status: "AK", data: propertyFileCategories.rows });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching property file categories",
    });
  }
};

export const getPropertyFileCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    res.json({ status: "AK", data: propertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching property file category",
    });
  }
};

export const createPropertyFileCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const newPropertyFileCategory = await pool.query(
      "INSERT INTO property_file_categories (name) VALUES (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({ status: "AK", data: newPropertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error creating property file category",
    });
  }
};

export const updatePropertyFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    const updatedPropertyFileCategory = await pool.query(
      "UPDATE property_file_categories SET name = INITCAP($1) WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedPropertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error updating property file category",
    });
  }
};

export const deletePropertyFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    await pool.query("DELETE FROM property_file_categories WHERE id = $1", [
      id,
    ]);
    res.json({
      status: "AK",
      message: "Property file category deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error deleting property file category",
    });
  }
};
