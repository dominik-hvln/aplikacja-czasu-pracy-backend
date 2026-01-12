-- Default Modules Seed
INSERT INTO modules (code, name, description) VALUES
('reports', 'Raporty i Analizy', 'Dostęp do generowania raportów PDF i Excel oraz statystyk.'),
('projects', 'Zarządzanie Projektami', 'Tworzenie projektów, przypisywanie ludzi i budżetowanie.'),
('tasks', 'Zadania i Delegowanie', 'System ticketowy i zadania dla pracowników.'),
('geolocation', 'Geolokalizacja i QR', 'Śledzenie GPS przy start/stop oraz obsługa kodów QR.'),
('ai_assistant', 'Asystent AI', 'Automatyczne podsumowania i sugestie oparte na sztucznej inteligencji.')
ON CONFLICT (code) DO NOTHING;
