const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const morgan = require("morgan");

const countryRoutes = require("./routes/countryRoutes");
const provinceRoutes = require("./routes/provinceRoutes");
const municipalityRoutes = require("./routes/municipalityRoutes");
const districtRoutes = require("./routes/districtRoutes");
const genderRoutes = require("./routes/genderRoutes");
const userRoutes = require("./routes/userRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev")); //log the requests

app.use("/country", countryRoutes);
app.use("/province", provinceRoutes);
app.use("/municipality", municipalityRoutes);
app.use("/district", districtRoutes);
app.use("/gender", genderRoutes);
app.use("/user", userRoutes);

app.listen(PORT, () => {
  console.log("Server is running on port " + PORT); 

});