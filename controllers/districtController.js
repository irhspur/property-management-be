export const getAllDistricts = async (req, res) => {
    try {
        const districts = await pool.query("SELECT * FROM district");
        res.json({status: "AK", data: districts.rows});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error fetching districts"});
    }
};

export const getDistrictById = async (req, res) => {
    try {
        const { id } = req.params;
        const district = await pool.query("SELECT * FROM district WHERE id = $1", [id]);
        if (district.rows.length === 0) {
            return res.status(404).json({status: "NAK", message: "District not found"});
        }
        res.json({status: "AK", data: district.rows[0]});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error fetching district"});
    }
};

export const createDistrict = async (req, res) => {
    try {
        const { name, province_id } = req.body;
        const district = await pool.query("SELECT * FROM district WHERE name = $1", [name]);
        if (district.rows.length > 0) {
            return res.status(400).json({status: "NAK", message: "District already exists"});
        }
        const newDistrict = await pool.query("INSERT INTO district (name, province_id) VALUES (INITCAP($1), $2) RETURNING *", [name, province_id]);
        res.json({status: "AK", data: newDistrict.rows[0]});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error creating district"});
    }
};

export const updateDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, province_id } = req.body;
        const district = await pool.query("SELECT * FROM district WHERE id = $1", [id]);
        if (district.rows.length === 0) {
            return res.status(404).json({status: "NAK", message: "District not found"});
        }
        const updatedDistrict = await pool.query("UPDATE district SET name = INITCAP($1), province_id = $2 WHERE id = $3 RETURNING *", [name, province_id, id]);
        res.json({status: "AK", data: updatedDistrict.rows[0]});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error updating district"});
    }
};

export const deleteDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        const district = await pool.query("SELECT * FROM district WHERE id = $1", [id]);
        if (district.rows.length === 0) {
            return res.status(404).json({status: "NAK", message: "District not found"});
        }
        await pool.query("DELETE FROM district WHERE id = $1", [id]);
        res.json({status: "AK", message: "District deleted successfully"});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error deleting district"});
    }
};

export const getDistrictsByProvinceId = async (req, res) => {
    try {
        const { province_id } = req.params;
        const districts = await pool.query("SELECT * FROM district WHERE province_id = $1", [province_id]);
        if (districts.rows.length === 0) {
            return res.status(404).json({status: "NAK", message: "No districts found for this province"});
        }
        res.json({status: "AK", data: districts.rows});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error fetching districts"});
    }
};

export const getDistrictsByProvinceName = async (req, res) => {
    try {
        const { province_name } = req.params;
        const districts = await pool.query("SELECT * FROM district WHERE province_id IN (SELECT id FROM province WHERE name = $1)", [province_name]);
        if (districts.rows.length === 0) {
            return res.status(404).json({status: "NAK", message: "No districts found for this province"});
        }
        res.json({status: "AK", data: districts.rows});
    } catch (error) {
        console.error(error.message);
        res.json({status: "NAK", message: "Error fetching districts"});
    }
};