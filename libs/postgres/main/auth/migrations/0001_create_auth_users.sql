CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  display_name varchar(160),
  password_hash varchar(255) NOT NULL DEFAULT '',
  status varchar(32) NOT NULL DEFAULT 'active',
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_users_email_key UNIQUE (email)
);
