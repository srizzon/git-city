-- 056_job_counter_rpcs.sql — Atomic counter increments for job listings

CREATE OR REPLACE FUNCTION increment_job_counter(
  p_listing_id uuid,
  p_column text
)
RETURNS void AS $$
BEGIN
  IF p_column = 'view_count' THEN
    UPDATE job_listings SET view_count = view_count + 1 WHERE id = p_listing_id;
  ELSIF p_column = 'apply_count' THEN
    UPDATE job_listings SET apply_count = apply_count + 1 WHERE id = p_listing_id;
  ELSIF p_column = 'profile_count' THEN
    UPDATE job_listings SET profile_count = profile_count + 1 WHERE id = p_listing_id;
  ELSE
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic hired_count increment
CREATE OR REPLACE FUNCTION increment_hired_count(p_company_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE job_company_profiles SET hired_count = hired_count + 1 WHERE id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
