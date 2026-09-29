-- Runs once when the dev volume is created.
-- Separate database for integration/e2e tests so they never touch dev data.
CREATE DATABASE dopl_test OWNER dopl;
