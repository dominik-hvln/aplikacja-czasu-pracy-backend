-- Skrypt naprawiający błąd 500 w endpoincie /projects/:id/qr-code
-- Błąd pojawiał się, ponieważ tabela qr_codes (używana przez projects.service.ts)
-- nie posiadała kolumny project_id, w przeciwieństwie do kolumny task_id używanej dla zadań.

ALTER TABLE public.qr_codes
ADD COLUMN IF NOT EXISTS project_id uuid;

ALTER TABLE public.qr_codes 
ADD CONSTRAINT qr_codes_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES public.projects(id) 
ON DELETE CASCADE;
