-- Migration script: Broadcaster to Installation Architecture
-- This script migrates existing broadcasters to the new installation model
-- Run this AFTER the schema.sql has been updated

-- Step 1: Check if migration is needed (old columns still exist)
DO $$
BEGIN
    -- Check if old columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'broadcasters' AND column_name = 'token'
    ) THEN
        RAISE NOTICE 'Starting migration: Moving broadcaster tokens to installations...';
        
        -- Step 2: Add installation_id columns to activities and browser_history if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'activities' AND column_name = 'installation_id'
        ) THEN
            ALTER TABLE activities ADD COLUMN installation_id INTEGER;
            RAISE NOTICE 'Added installation_id to activities table';
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'browser_history' AND column_name = 'installation_id'
        ) THEN
            ALTER TABLE browser_history ADD COLUMN installation_id INTEGER;
            RAISE NOTICE 'Added installation_id to browser_history table';
        END IF;
        
        -- Step 3: Create installation records for ALL existing broadcasters
        -- Each broadcaster gets one installation, even if token is NULL
        -- This ensures ALL activity/history data can be linked
        INSERT INTO broadcaster_installations (
            broadcaster_id, 
            computer_name, 
            jwt_token, 
            jwt_expires_at, 
            is_active,
            last_connected_at,
            created_at
        )
        SELECT 
            id,
            name,  -- Use broadcaster name as initial computer name
            token,
            token_expires_at,
            is_active,
            last_connected_at,
            created_at
        FROM broadcasters
        ON CONFLICT (broadcaster_id, computer_name) DO NOTHING;
        
        RAISE NOTICE 'Created installation records for ALL existing broadcasters';
        
        -- Step 4: Update activities to link to installations
        -- Match by broadcaster_id and use the first (only) installation
        UPDATE activities a
        SET installation_id = (
            SELECT bi.id 
            FROM broadcaster_installations bi 
            WHERE bi.broadcaster_id = a.broadcaster_id 
            LIMIT 1
        )
        WHERE installation_id IS NULL;
        
        RAISE NOTICE 'Linked activities to installations';
        
        -- Step 5: Update browser_history to link to installations
        UPDATE browser_history bh
        SET installation_id = (
            SELECT bi.id 
            FROM broadcaster_installations bi 
            WHERE bi.broadcaster_id = bh.broadcaster_id 
            LIMIT 1
        )
        WHERE installation_id IS NULL;
        
        RAISE NOTICE 'Linked browser history to installations';
        
        -- Step 6: Add foreign key constraints for installation_id
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'activities_installation_id_fkey'
        ) THEN
            ALTER TABLE activities ADD CONSTRAINT activities_installation_id_fkey 
                FOREIGN KEY (installation_id) REFERENCES broadcaster_installations(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added FK constraint for activities.installation_id';
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'browser_history_installation_id_fkey'
        ) THEN
            ALTER TABLE browser_history ADD CONSTRAINT browser_history_installation_id_fkey 
                FOREIGN KEY (installation_id) REFERENCES broadcaster_installations(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added FK constraint for browser_history.installation_id';
        END IF;
        
        -- Step 7: Update browser_history UNIQUE constraint to include installation_id
        ALTER TABLE browser_history DROP CONSTRAINT IF EXISTS browser_history_broadcaster_id_browser_url_visit_timestamp_key;
        ALTER TABLE browser_history ADD CONSTRAINT browser_history_broadcaster_id_installation_id_browser_url_vi_key 
            UNIQUE (broadcaster_id, installation_id, browser, url, visit_timestamp);
        RAISE NOTICE 'Updated browser_history UNIQUE constraint';
        
        -- Step 8: Create indexes for installation_id columns
        CREATE INDEX IF NOT EXISTS idx_activities_installation_timestamp ON activities(installation_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_browser_history_installation_timestamp ON browser_history(installation_id, visit_timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_broadcaster_installations_broadcaster ON broadcaster_installations(broadcaster_id);
        RAISE NOTICE 'Created indexes for installation_id columns';
        
        -- Step 9: Remove old columns from broadcasters table
        ALTER TABLE broadcasters DROP COLUMN IF EXISTS token;
        ALTER TABLE broadcasters DROP COLUMN IF EXISTS token_expires_at;
        ALTER TABLE broadcasters DROP COLUMN IF EXISTS last_connected_at;
        
        RAISE NOTICE 'Removed deprecated columns from broadcasters table';
        
        -- Step 10: Resolve duplicate broadcaster names with guaranteed uniqueness
        -- Use a deterministic approach that ensures no collisions
        DECLARE
            duplicate_record RECORD;
            new_name TEXT;
            counter INTEGER;
        BEGIN
            -- Find and fix each duplicate broadcaster one by one
            FOR duplicate_record IN (
                SELECT b.id, b.owner_id, b.name
                FROM broadcasters b
                INNER JOIN (
                    SELECT owner_id, name, MIN(id) as first_id
                    FROM broadcasters
                    GROUP BY owner_id, name
                    HAVING COUNT(*) > 1
                ) dups ON b.owner_id = dups.owner_id AND b.name = dups.name
                WHERE b.id != dups.first_id
                ORDER BY b.id
            ) LOOP
                -- Try sequential numbers first, then broadcaster ID + counter
                counter := 1;
                LOOP
                    -- For first 10000 attempts, use simple counter: "Name (1)"
                    -- After that, use broadcaster ID + counter: "Name (ID:123-1)"
                    -- This guarantees eventual termination because IDs are unique
                    IF counter <= 10000 THEN
                        new_name := duplicate_record.name || ' (' || counter || ')';
                    ELSE
                        new_name := duplicate_record.name || ' (ID:' || duplicate_record.id || '-' || (counter - 10000) || ')';
                    END IF;
                    
                    -- Check if this name is available for this owner
                    IF NOT EXISTS (
                        SELECT 1 FROM broadcasters 
                        WHERE owner_id = duplicate_record.owner_id 
                        AND name = new_name
                    ) THEN
                        -- Name is free, use it
                        UPDATE broadcasters 
                        SET name = new_name 
                        WHERE id = duplicate_record.id;
                        EXIT;
                    END IF;
                    
                    -- Name taken, try next number
                    counter := counter + 1;
                END LOOP;
            END LOOP;
            
            RAISE NOTICE 'Resolved all duplicate broadcaster names';
        END;
        
        -- Step 11: Add unique constraint on (owner_id, name)
        ALTER TABLE broadcasters DROP CONSTRAINT IF EXISTS broadcasters_owner_id_name_key;
        ALTER TABLE broadcasters ADD CONSTRAINT broadcasters_owner_id_name_key UNIQUE (owner_id, name);
        
        RAISE NOTICE 'Added unique constraint on (owner_id, name)';
        
        RAISE NOTICE 'Migration completed successfully!';
    ELSE
        RAISE NOTICE 'Migration already completed or not needed - old columns do not exist';
    END IF;
END $$;
