DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ListingObservationKind'
  ) THEN
    EXECUTE 'ALTER TYPE "ListingObservationKind" ADD VALUE IF NOT EXISTS ''verified_missing''';
  END IF;
END
$$;
