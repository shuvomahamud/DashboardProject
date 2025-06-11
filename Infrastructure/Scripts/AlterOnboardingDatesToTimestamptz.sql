-- Script to alter Onboarding DateTime columns from timestamp to timestamptz
-- Run this directly in PostgreSQL or via a migration

-- Alter onboarding.createddate column
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding') THEN
        -- Check if column exists and alter it
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'onboarding' AND column_name = 'createddate') THEN
            ALTER TABLE onboarding ALTER COLUMN createddate TYPE timestamptz;
            RAISE NOTICE 'Altered onboarding.createddate to timestamptz';
        END IF;
    ELSE
        RAISE NOTICE 'Table onboarding does not exist';
    END IF;
END $$;

-- Alter onboardingfielddata.dateutc column  
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboardingfielddata') THEN
        -- Check if column exists and alter it
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'onboardingfielddata' AND column_name = 'dateutc') THEN
            ALTER TABLE onboardingfielddata ALTER COLUMN dateutc TYPE timestamptz;
            RAISE NOTICE 'Altered onboardingfielddata.dateutc to timestamptz';
        END IF;
    ELSE
        RAISE NOTICE 'Table onboardingfielddata does not exist';
    END IF;
END $$; 