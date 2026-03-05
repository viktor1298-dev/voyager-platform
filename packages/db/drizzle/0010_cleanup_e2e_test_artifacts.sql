-- M-P0-003: Cleanup E2E test artifact alerts that were never cleaned up
-- Removes alerts named E2E-Alert-*, Toggle-Alert-*, Delete-Alert-* created by test suite
DELETE FROM alerts
WHERE name ~ '^(E2E|Toggle|Delete)-Alert-\d+$';
