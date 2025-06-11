-- ========================================================================
-- Script to fix Onboarding DateTime columns for PostgreSQL + Npgsql
-- ========================================================================
-- Problem: Npgsql throws error when writing DateTime with Kind=UTC to 
--          PostgreSQL columns that are 'timestamp without time zone'
-- Solution: Change columns to 'timestamp with time zone' (timestamptz)
-- ========================================================================

-- Check current column types
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('onboarding', 'onboardingfielddata') 
  AND column_name IN ('createddate', 'dateutc')
ORDER BY table_name, column_name;

-- Alter onboarding.createddate column
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'onboarding' AND column_name = 'createddate') THEN
        
        -- Check current type
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'onboarding' 
                     AND column_name = 'createddate' 
                     AND data_type = 'timestamp without time zone') THEN
            
            -- Alter to timestamptz
            ALTER TABLE onboarding ALTER COLUMN createddate TYPE timestamptz;
            RAISE NOTICE 'SUCCESS: Changed onboarding.createddate from timestamp to timestamptz';
            
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'onboarding' 
                        AND column_name = 'createddate' 
                        AND data_type = 'timestamp with time zone') THEN
            
            RAISE NOTICE 'INFO: onboarding.createddate is already timestamptz - no change needed';
            
        ELSE
            RAISE NOTICE 'WARNING: onboarding.createddate has unexpected type - manual review needed';
        END IF;
    ELSE
        RAISE NOTICE 'INFO: onboarding.createddate column does not exist';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR altering onboarding.createddate: %', SQLERRM;
END $$;

-- Alter onboardingfielddata.dateutc column  
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'onboardingfielddata' AND column_name = 'dateutc') THEN
        
        -- Check current type
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'onboardingfielddata' 
                     AND column_name = 'dateutc' 
                     AND data_type = 'timestamp without time zone') THEN
            
            -- Alter to timestamptz
            ALTER TABLE onboardingfielddata ALTER COLUMN dateutc TYPE timestamptz;
            RAISE NOTICE 'SUCCESS: Changed onboardingfielddata.dateutc from timestamp to timestamptz';
            
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'onboardingfielddata' 
                        AND column_name = 'dateutc' 
                        AND data_type = 'timestamp with time zone') THEN
            
            RAISE NOTICE 'INFO: onboardingfielddata.dateutc is already timestamptz - no change needed';
            
        ELSE
            RAISE NOTICE 'WARNING: onboardingfielddata.dateutc has unexpected type - manual review needed';
        END IF;
    ELSE
        RAISE NOTICE 'INFO: onboardingfielddata.dateutc column does not exist';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR altering onboardingfielddata.dateutc: %', SQLERRM;
END $$;

-- Verify the changes
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('onboarding', 'onboardingfielddata') 
  AND column_name IN ('createddate', 'dateutc')
ORDER BY table_name, column_name;

-- ========================================================================
-- Expected final result:
-- onboarding.createddate -> timestamp with time zone
-- onboardingfielddata.dateutc -> timestamp with time zone
-- ======================================================================== 