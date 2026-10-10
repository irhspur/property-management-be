// Baseline: the production schema as it stood when migrations were adopted
// (ADR-0012), taken from prod prop_db_2 (PostgreSQL 16.15, 2026-10-10) with
// `pg_dump --schema-only --no-owner --no-privileges`. It replaces database.sql and
// database_modification_query.sql. The two CHECK constraints written as
// `IN (...)` are as originally declared: pg_dump's own rendering of them
// re-parses into a different (equivalent) expression.
//
// Existing databases record this as applied without running it:
//   npm run migrate -- --fake --file <this file's name, without .js>
//
// The user_type rows are part of the schema contract: authorize() and the
// services check user types by these ids and names. Every other lookup table is
// data, loaded by seed/.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

    CREATE TABLE public.activity_event (
        event_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        owner_id uuid NOT NULL,
        type character varying(40) NOT NULL,
        subject_kind character varying(20) NOT NULL,
        subject_id uuid NOT NULL,
        context jsonb DEFAULT '{}'::jsonb NOT NULL,
        occurred_at timestamp with time zone DEFAULT date_trunc('milliseconds'::text, now()) NOT NULL
    );

    CREATE TABLE public.address (
        address_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        country_id integer,
        province_id integer,
        district_id integer,
        municipality_id integer,
        ward_number smallint,
        street_name character varying(100),
        house_number character varying(50),
        contact_number_1 character varying(30),
        contact_number_2 character varying(30),
        contact_address character varying(255),
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.agreement_duration (
        id smallint NOT NULL,
        duration_in_years smallint NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.agreement_file_categories (
        id smallint NOT NULL,
        name character varying(50) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        code character varying(40) NOT NULL,
        CONSTRAINT agreement_file_categories_code_format CHECK (((code)::text ~ '^[a-z][a-z0-9_]{1,39}$'::text))
    );

    CREATE TABLE public.agreements (
        agreement_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        property_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        start_date date NOT NULL,
        end_date date,
        rent_amount numeric(15,2) NOT NULL,
        security_deposit numeric(15,2),
        status character varying(10) DEFAULT 'active'::character varying NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        agreement_duration_id smallint NOT NULL,
        payment_period_id smallint NOT NULL,
        increment_duration_id smallint,
        increment_percentage_id smallint,
        advance_amount numeric(15,2),
        agreement_reference bigint NOT NULL,
        created_by uuid,
        updated_by uuid,
        ended_at timestamp without time zone,
        CONSTRAINT agreements_increment_terms_together CHECK (((increment_duration_id IS NULL) = (increment_percentage_id IS NULL))),
        CONSTRAINT agreements_status_check CHECK (status IN ('active', 'ended'))
    );

    CREATE SEQUENCE public.agreements_agreement_reference_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.agreements_agreement_reference_seq OWNED BY public.agreements.agreement_reference;

    CREATE TABLE public.bs_month (
        id integer NOT NULL,
        bs_year smallint NOT NULL,
        bs_month smallint NOT NULL,
        month_name character varying(20) NOT NULL,
        ad_start_date date NOT NULL,
        days smallint NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT bs_month_bs_month_check CHECK (((bs_month >= 1) AND (bs_month <= 12)))
    );

    CREATE SEQUENCE public.bs_month_id_seq
        AS integer
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.bs_month_id_seq OWNED BY public.bs_month.id;

    CREATE TABLE public.country (
        id integer NOT NULL,
        iso character(2) NOT NULL,
        name character varying(80) NOT NULL,
        nicename character varying(80) NOT NULL,
        iso3 character(3) DEFAULT NULL::bpchar,
        numcode smallint,
        phonecode integer NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE SEQUENCE public.country_id_seq
        AS integer
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.country_id_seq OWNED BY public.country.id;

    CREATE TABLE public.district (
        id bigint NOT NULL,
        name character varying(80) NOT NULL,
        province_id integer NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE SEQUENCE public.district_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.district_id_seq OWNED BY public.district.id;

    CREATE TABLE public.file_categories (
        id smallint NOT NULL,
        name character varying(50) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        code character varying(40) NOT NULL,
        CONSTRAINT file_categories_code_format CHECK (((code)::text ~ '^[a-z][a-z0-9_]{1,39}$'::text))
    );

    CREATE TABLE public.files (
        file_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        file_category_id smallint,
        property_file_category_id smallint,
        agreement_file_category_id smallint,
        file_name character varying(255) NOT NULL,
        original_name character varying(255) NOT NULL,
        mimetype character varying(255) NOT NULL,
        file_size bigint NOT NULL,
        file_path character varying(255) NOT NULL,
        upload_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        property_id uuid,
        agreement_id uuid,
        payment_id uuid
    );

    CREATE TABLE public.gender (
        id smallint NOT NULL,
        name character varying(20) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.increment_duration (
        id smallint NOT NULL,
        increment_duration_in_years smallint NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.increment_percentage (
        id smallint NOT NULL,
        increment_percentage numeric(5,2) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.municipality (
        id bigint NOT NULL,
        name character varying(80) NOT NULL,
        district_id integer NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE SEQUENCE public.municipality_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.municipality_id_seq OWNED BY public.municipality.id;

    CREATE TABLE public.owner_tenant (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        property_owner_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.payment_method (
        id smallint NOT NULL,
        payment_method character varying(30) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.payment_period (
        id smallint NOT NULL,
        payment_period character varying(20) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.payment_purpose (
        id smallint NOT NULL,
        payment_purpose character varying(30) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.payments (
        payment_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        payment_reference bigint NOT NULL,
        agreement_id uuid NOT NULL,
        payment_purpose_id smallint NOT NULL,
        payment_method_id smallint NOT NULL,
        amount numeric(15,2) NOT NULL,
        paid_on date NOT NULL,
        covers_period_start date,
        remarks character varying(255),
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
    );

    CREATE SEQUENCE public.payments_payment_reference_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.payments_payment_reference_seq OWNED BY public.payments.payment_reference;

    CREATE TABLE public.properties (
        property_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        property_type_id smallint NOT NULL,
        country_id integer NOT NULL,
        province_id integer NOT NULL,
        district_id integer NOT NULL,
        municipality_id integer NOT NULL,
        ward_number integer NOT NULL,
        street_name character varying(100) NOT NULL,
        house_number character varying(50) NOT NULL,
        property_name character varying(255) NOT NULL,
        property_description text,
        property_value numeric(15,2),
        is_vacant boolean DEFAULT true,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        land_area_sqft numeric(16,6),
        land_area_unit character varying(10),
        number_of_units smallint,
        year_built_bs smallint,
        latitude numeric(9,6),
        longitude numeric(9,6),
        CONSTRAINT properties_area_unit_pair CHECK (((land_area_sqft IS NULL) = (land_area_unit IS NULL))),
        CONSTRAINT properties_land_area_sqft_check CHECK ((land_area_sqft > (0)::numeric)),
        CONSTRAINT properties_land_area_unit_check CHECK (land_area_unit IN ('ropani', 'bigha')),
        CONSTRAINT properties_lat_lng_pair CHECK (((latitude IS NULL) = (longitude IS NULL))),
        CONSTRAINT properties_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
        CONSTRAINT properties_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
        CONSTRAINT properties_number_of_units_check CHECK (((number_of_units >= 1) AND (number_of_units <= 999))),
        CONSTRAINT properties_year_built_bs_check CHECK ((year_built_bs >= 1900))
    );

    CREATE TABLE public.property_file_categories (
        id smallint NOT NULL,
        name character varying(50) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        code character varying(40) NOT NULL,
        CONSTRAINT property_file_categories_code_format CHECK (((code)::text ~ '^[a-z][a-z0-9_]{1,39}$'::text))
    );

    CREATE TABLE public.property_types (
        id smallint NOT NULL,
        name character varying(50) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.province (
        id bigint NOT NULL,
        name character varying(80) NOT NULL,
        country_id integer NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE SEQUENCE public.province_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;

    ALTER SEQUENCE public.province_id_seq OWNED BY public.province.id;

    CREATE TABLE public.user_details (
        user_details_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        user_id uuid NOT NULL,
        first_name character varying(100) NOT NULL,
        middle_name character varying(100),
        last_name character varying(100) NOT NULL,
        gender_id integer,
        dob date,
        country_id integer,
        birth_province_id integer,
        birth_district_id integer,
        father_full_name character varying(100),
        nin_number character varying(30),
        mobile_number character varying(30),
        citizenship_number character varying(30),
        citizenship_issue_district_id integer,
        citizenship_issue_date date,
        bank_account_number character varying(100),
        bank_name character varying(255),
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.user_type (
        id smallint NOT NULL,
        name character varying(20) NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE public.users (
        user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        email character varying(100) NOT NULL,
        password character varying(255) NOT NULL,
        user_type_id smallint NOT NULL,
        password_last_changed timestamp without time zone,
        is_verified boolean DEFAULT false,
        is_active boolean DEFAULT true,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        profile_photo_path character varying(255)
    );

    ALTER TABLE ONLY public.agreements ALTER COLUMN agreement_reference SET DEFAULT nextval('public.agreements_agreement_reference_seq'::regclass);

    ALTER TABLE ONLY public.bs_month ALTER COLUMN id SET DEFAULT nextval('public.bs_month_id_seq'::regclass);

    ALTER TABLE ONLY public.country ALTER COLUMN id SET DEFAULT nextval('public.country_id_seq'::regclass);

    ALTER TABLE ONLY public.district ALTER COLUMN id SET DEFAULT nextval('public.district_id_seq'::regclass);

    ALTER TABLE ONLY public.municipality ALTER COLUMN id SET DEFAULT nextval('public.municipality_id_seq'::regclass);

    ALTER TABLE ONLY public.payments ALTER COLUMN payment_reference SET DEFAULT nextval('public.payments_payment_reference_seq'::regclass);

    ALTER TABLE ONLY public.province ALTER COLUMN id SET DEFAULT nextval('public.province_id_seq'::regclass);

    ALTER TABLE ONLY public.activity_event
        ADD CONSTRAINT activity_event_pkey PRIMARY KEY (event_id);

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_pkey PRIMARY KEY (address_id);

    ALTER TABLE ONLY public.agreement_duration
        ADD CONSTRAINT agreement_duration_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.agreement_file_categories
        ADD CONSTRAINT agreement_file_categories_code_key UNIQUE (code);

    ALTER TABLE ONLY public.agreement_file_categories
        ADD CONSTRAINT agreement_file_categories_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_agreement_reference_key UNIQUE (agreement_reference);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_pkey PRIMARY KEY (agreement_id);

    ALTER TABLE ONLY public.bs_month
        ADD CONSTRAINT bs_month_bs_year_bs_month_key UNIQUE (bs_year, bs_month);

    ALTER TABLE ONLY public.bs_month
        ADD CONSTRAINT bs_month_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.country
        ADD CONSTRAINT country_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.district
        ADD CONSTRAINT district_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.file_categories
        ADD CONSTRAINT file_categories_code_key UNIQUE (code);

    ALTER TABLE ONLY public.file_categories
        ADD CONSTRAINT file_categories_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_pkey PRIMARY KEY (file_id);

    ALTER TABLE ONLY public.gender
        ADD CONSTRAINT gender_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.increment_duration
        ADD CONSTRAINT increment_duration_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.increment_percentage
        ADD CONSTRAINT increment_percentage_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.municipality
        ADD CONSTRAINT municipality_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.owner_tenant
        ADD CONSTRAINT owner_tenant_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.payment_method
        ADD CONSTRAINT payment_method_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.payment_period
        ADD CONSTRAINT payment_period_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.payment_purpose
        ADD CONSTRAINT payment_purpose_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_payment_reference_key UNIQUE (payment_reference);

    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_pkey PRIMARY KEY (payment_id);

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_pkey PRIMARY KEY (property_id);

    ALTER TABLE ONLY public.property_file_categories
        ADD CONSTRAINT property_file_categories_code_key UNIQUE (code);

    ALTER TABLE ONLY public.property_file_categories
        ADD CONSTRAINT property_file_categories_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.property_types
        ADD CONSTRAINT property_types_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.province
        ADD CONSTRAINT province_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_pkey PRIMARY KEY (user_details_id);

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_user_id_unique UNIQUE (user_id);

    ALTER TABLE ONLY public.user_type
        ADD CONSTRAINT user_type_pkey PRIMARY KEY (id);

    ALTER TABLE ONLY public.users
        ADD CONSTRAINT users_email_key UNIQUE (email);

    ALTER TABLE ONLY public.users
        ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);

    CREATE INDEX activity_event_owner_feed_idx ON public.activity_event USING btree (owner_id, occurred_at DESC, event_id DESC);

    CREATE UNIQUE INDEX agreements_one_active_per_property ON public.agreements USING btree (property_id) WHERE ((status)::text = 'active'::text);

    CREATE UNIQUE INDEX agreements_one_active_per_tenant ON public.agreements USING btree (tenant_id) WHERE ((status)::text = 'active'::text);

    CREATE INDEX agreements_status_end_date_idx ON public.agreements USING btree (status, end_date);

    CREATE INDEX bs_month_ad_start_date_idx ON public.bs_month USING btree (ad_start_date);

    CREATE INDEX files_agreement_idx ON public.files USING btree (agreement_id) WHERE (agreement_id IS NOT NULL);

    CREATE INDEX files_payment_idx ON public.files USING btree (payment_id) WHERE (payment_id IS NOT NULL);

    CREATE INDEX owner_tenant_owner_created_idx ON public.owner_tenant USING btree (property_owner_id, created_at DESC);

    CREATE INDEX payments_agreement_paid_on_idx ON public.payments USING btree (agreement_id, paid_on DESC);

    CREATE INDEX payments_agreement_period_idx ON public.payments USING btree (agreement_id, covers_period_start);

    ALTER TABLE ONLY public.activity_event
        ADD CONSTRAINT activity_event_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.district(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_municipality_id_fkey FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_province_id_fkey FOREIGN KEY (province_id) REFERENCES public.province(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.address
        ADD CONSTRAINT address_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_agreement_duration_id_fkey FOREIGN KEY (agreement_duration_id) REFERENCES public.agreement_duration(id);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_increment_duration_id_fkey FOREIGN KEY (increment_duration_id) REFERENCES public.increment_duration(id);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_increment_percentage_id_fkey FOREIGN KEY (increment_percentage_id) REFERENCES public.increment_percentage(id);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_payment_period_id_fkey FOREIGN KEY (payment_period_id) REFERENCES public.payment_period(id);

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(property_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.agreements
        ADD CONSTRAINT agreements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.district
        ADD CONSTRAINT district_province_id_fkey FOREIGN KEY (province_id) REFERENCES public.province(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_agreement_file_category_id_fkey FOREIGN KEY (agreement_file_category_id) REFERENCES public.agreement_file_categories(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.agreements(agreement_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_file_category_id_fkey FOREIGN KEY (file_category_id) REFERENCES public.file_categories(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_property_file_category_id_fkey FOREIGN KEY (property_file_category_id) REFERENCES public.property_file_categories(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(property_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.files
        ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.municipality
        ADD CONSTRAINT municipality_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.district(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.owner_tenant
        ADD CONSTRAINT owner_tenant_property_owner_id_fkey FOREIGN KEY (property_owner_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.owner_tenant
        ADD CONSTRAINT owner_tenant_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.agreements(agreement_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_method(id);

    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_payment_purpose_id_fkey FOREIGN KEY (payment_purpose_id) REFERENCES public.payment_purpose(id);

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.district(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_municipality_id_fkey FOREIGN KEY (municipality_id) REFERENCES public.municipality(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_property_type_id_fkey FOREIGN KEY (property_type_id) REFERENCES public.property_types(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_province_id_fkey FOREIGN KEY (province_id) REFERENCES public.province(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.properties
        ADD CONSTRAINT properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.province
        ADD CONSTRAINT province_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_birth_district_id_fkey FOREIGN KEY (birth_district_id) REFERENCES public.district(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_birth_province_id_fkey FOREIGN KEY (birth_province_id) REFERENCES public.province(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_citizenship_issue_district_id_fkey FOREIGN KEY (citizenship_issue_district_id) REFERENCES public.district(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_gender_id_fkey FOREIGN KEY (gender_id) REFERENCES public.gender(id) ON DELETE SET NULL;

    ALTER TABLE ONLY public.user_details
        ADD CONSTRAINT user_details_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

    ALTER TABLE ONLY public.users
        ADD CONSTRAINT users_user_type_id_fkey FOREIGN KEY (user_type_id) REFERENCES public.user_type(id) ON DELETE SET NULL;
  `);

  pgm.sql(`
    INSERT INTO public.user_type (id, name) VALUES
      (1, 'admin'),
      (2, 'property_owner'),
      (3, 'tenant');
  `);
};

// There is no schema to go back to.
exports.down = false;
