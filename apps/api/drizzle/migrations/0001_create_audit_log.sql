CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" text NOT NULL,
  "user_email" text,
  "action" varchar(100) NOT NULL,
  "resource" varchar(100) NOT NULL,
  "resource_id" text,
  "details" text,
  "ip_address" varchar(45),
  "timestamp" timestamptz DEFAULT now() NOT NULL
);
