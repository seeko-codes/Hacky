-- Keeps member_profiles.search_tsv current for keyword (full-text) search.
-- A trigger instead of a generated column because array_to_string is not
-- immutable. Weights: skills A, interests + track B, idea + summary C.
CREATE FUNCTION member_profiles_search_tsv() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', array_to_string(NEW.skills, ' ')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ', array_to_string(NEW.interests, ' '), NEW.track)), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ', NEW.idea, NEW.summary)), 'C');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER member_profiles_search_tsv
  BEFORE INSERT OR UPDATE ON member_profiles
  FOR EACH ROW EXECUTE FUNCTION member_profiles_search_tsv();
