const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const countryRoutes = require("./routes/countryRoutes");
const provinceRoutes = require("./routes/provinceRoutes");
const municipalityRoutes = require("./routes/municipalityRoutes");
const districtRoutes = require("./routes/districtRoutes");
const genderRoutes = require("./routes/genderRoutes");
const userTypeRoutes = require("./routes/userTypeRoutes");
const fileCategoryRoutes = require("./routes/fileCategoryRoutes");
const propertyFileCategoryRoutes = require("./routes/propertyFileCategoryRoutes");
const propertyTypeRoutes = require("./routes/propertyTypeRoutes");
const userRoutes = require("./routes/userRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev")); //log the requests

/*app.use("/uploads/:mobileNnumber", (req, res, next) => {
  const mobileNumber = req.params.mobileNumber;
  const userUploadsDir = path.join(__dirname, "uploads", mobileNumber);
  express.static(userUploadsDir)(req, res, next);
});*/

app.use("/auth", authRoutes);
app.use("/country", countryRoutes);
app.use("/province", provinceRoutes);
app.use("/municipality", municipalityRoutes);
app.use("/district", districtRoutes);
app.use("/gender", genderRoutes);
app.use("/user-type", userTypeRoutes);
app.use("/file-category", fileCategoryRoutes);
app.use("/property-file-category", propertyFileCategoryRoutes);
app.use("/property-type", propertyTypeRoutes);
app.use("/user", userRoutes);

app.listen(PORT, () => {
  console.log("Server is running on port " + PORT);
});
