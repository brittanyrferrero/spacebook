ALTER TABLE workspaces ADD CONSTRAINT workspace_name_length CHECK (name IS NULL OR char_length(name) <= 200);
