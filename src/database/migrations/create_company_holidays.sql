-- backend/src/database/migrations/create_company_holidays.sql

CREATE TABLE IF NOT EXISTS company_holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, department_id, date)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_company_holidays_company_id ON company_holidays(company_id);
CREATE INDEX IF NOT EXISTS idx_company_holidays_department_id ON company_holidays(department_id);
CREATE INDEX IF NOT EXISTS idx_company_holidays_date ON company_holidays(date);
