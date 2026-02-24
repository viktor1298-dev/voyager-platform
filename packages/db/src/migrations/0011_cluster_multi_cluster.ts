export const up = `
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS credential_ref VARCHAR(255);
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;
`

export const down = `
ALTER TABLE clusters DROP COLUMN IF EXISTS credential_ref;
ALTER TABLE clusters DROP COLUMN IF EXISTS is_active;
ALTER TABLE clusters DROP COLUMN IF EXISTS last_connected_at;
`
