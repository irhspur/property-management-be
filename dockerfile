# Use the official Node.js image
FROM node:18

# Set working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm init -y
npm install express nodemailer multer sequelize sequelize-cli jsonwebtoken bcryptjs pg pg-hstore dotenv
npm install --save-dev nodemon


# Copy the rest of the project files
COPY . .

# Expose port 5000
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]