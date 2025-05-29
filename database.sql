CREATE DATABASE proptrove;

CREATE TABLE IF NOT EXISTS country_new (
id SERIAL PRIMARY KEY,
code CHAR(2) NOT NULL,
name VARCHAR(100) NOT NULL,
phone INTEGER NOT NULL,
capital VARCHAR(80),
currency VARCHAR(3),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

alter table country add column if not exists capital VARCHAR(80) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS country (
  id SERIAL PRIMARY KEY,
  iso char(2) NOT NULL,
  name varchar(80) NOT NULL,
  nicename varchar(80) NOT NULL,
  iso3 char(3) DEFAULT NULL,
  numcode smallint DEFAULT NULL,
  phonecode int NOT NULL
);

CREATE TABLE IF NOT EXISTS province (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  country_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS district (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  province_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (province_id) REFERENCES province(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS municipality (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  district_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES district(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gender (
  id SMALLINT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_type (
  id SMALLINT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_type (
  id SMALLINT PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  user_type_id SMALLINT NOT NULL,
  verification_token VARCHAR(255) NOT NULL,
  verification_token_expiry TIMESTAMP NOT NULL,
  password_reset_token VARCHAR(255) NOT NULL,
  password_reset_token_expiry TIMESTAMP NOT NULL,
  password_last_changed TIMESTAMP NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY user_type_id REFERENCES user_type(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_info (
  user_info_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  gender_id INTEGER,
  dob DATE,
  country_id INTEGER,
  birth_district_id INTEGER,
  father_full_name VARCHAR(100),
  nin_number VARCHAR(30),
  contact_number VARCHAR(30),
  citizenship_number VARCHAR(30),
  citizenship_issue_district_id INTEGER,
  citizenship_issue_date DATE,
  bank_account_number VARCHAR(100),
  bank_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  FOREIGN KEY user_id REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY gender_id REFERENCES gender(id) ON DELETE SET NULL,
  FOREIGN KEY country_id REFERENCES country(id) ON DELETE SET NULL,
  FOREIGN KEY birth_district_id REFERENCES district(id) ON DELETE SET NULL,
  FOREIGN KEY citizenship_issue_district_id REFERENCES district(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS address_info(
  address_info_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  country_id INTEGER,
  province_id INTEGER,
  district_id INTEGER,
  municipality_id INTEGER,
  ward_number SMALLINT,
  street_name VARCHAR(100),
  house_number VARCHAR(50),
  contact_number_1 VARCHAR(30),
  contact_number_2 VARCHAR(30),
  contact_address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  FOREIGN KEY user_id REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY country_id REFERENCES country(id) ON DELETE SET NULL,
  FOREIGN KEY province_id REFERENCES province(id) ON DELETE SET NULL,
  FOREIGN KEY district_id REFERENCES district(id) ON DELETE SET NULL,
  FOREIGN KEY municipality_id REFERENCES municipality(id) ON DELETE SET NULL
);

