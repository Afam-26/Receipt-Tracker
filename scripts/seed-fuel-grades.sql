-- OPTIONAL DEV REFERENCE DATA. Run manually only against the dedicated receipt-tracker database.
-- Generic grades without octane assertions. Verify existing grades before executing.
INSERT INTO fuel_grades(canonical_name,grade_group,octane_rating,fuel_type)
SELECT 'Regular','regular',NULL,'gasoline' WHERE NOT EXISTS
 (SELECT 1 FROM fuel_grades WHERE canonical_name='Regular' AND grade_group='regular' AND fuel_type='gasoline' AND octane_rating IS NULL);
INSERT INTO fuel_grades(canonical_name,grade_group,octane_rating,fuel_type)
SELECT 'Plus','plus',NULL,'gasoline' WHERE NOT EXISTS
 (SELECT 1 FROM fuel_grades WHERE canonical_name='Plus' AND grade_group='plus' AND fuel_type='gasoline' AND octane_rating IS NULL);
INSERT INTO fuel_grades(canonical_name,grade_group,octane_rating,fuel_type)
SELECT 'Super','super',NULL,'gasoline' WHERE NOT EXISTS
 (SELECT 1 FROM fuel_grades WHERE canonical_name='Super' AND grade_group='super' AND fuel_type='gasoline' AND octane_rating IS NULL);
