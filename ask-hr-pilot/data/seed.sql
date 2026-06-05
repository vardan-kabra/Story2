-- ask-hr-pilot sample schema + seed data
-- This represents an ERP-like HR dataset for a multi-campus school system.
-- In production this would be replaced by Nucleus ERP tables / read replicas.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS hr_requests;
DROP TABLE IF EXISTS leave_balances;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS campuses;

CREATE TABLE campuses (
  id   INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE employees (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  campus_id    INTEGER REFERENCES campuses(id),
  department   TEXT,
  role         TEXT,
  joining_date TEXT,                         -- ISO date (YYYY-MM-DD)
  manager_id   INTEGER REFERENCES employees(id)
);

CREATE TABLE leave_balances (
  id          INTEGER PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  leave_type  TEXT,                          -- casual | sick | earned
  entitled    INTEGER,
  used        INTEGER,
  remaining   INTEGER
);

CREATE TABLE hr_requests (
  id             INTEGER PRIMARY KEY,
  employee_id    INTEGER REFERENCES employees(id),
  request_type   TEXT,                        -- reimbursement | leave_approval | document_request | id_card
  status         TEXT,                        -- pending | approved | rejected
  submitted_date TEXT,                        -- ISO date (YYYY-MM-DD)
  details        TEXT
);

-- ---------------------------------------------------------------------------
-- Campuses
-- ---------------------------------------------------------------------------
INSERT INTO campuses (id, code, name) VALUES
  (1, 'FHQ',  'Fountainhead Corporate Office'),
  (2, 'FSK',  'Fountainhead School Koba'),
  (3, 'FWGS', 'Fountainhead World Green School');

-- ---------------------------------------------------------------------------
-- Employees (manager_id references another employee; NULL = top of hierarchy)
-- ---------------------------------------------------------------------------
INSERT INTO employees (id, name, email, campus_id, department, role, joining_date, manager_id) VALUES
  (1,  'Ankita Sharma',  'ankita.sharma@fountainhead.example',  1, 'Human Resources', 'HR Director',     '2018-01-15', NULL),
  (2,  'Meera Nair',     'meera.nair@fountainhead.example',     2, 'Administration',  'Campus Head',     '2019-04-01', 1),
  (3,  'Vikram Desai',   'vikram.desai@fountainhead.example',   3, 'Administration',  'Campus Head',     '2019-06-10', 1),
  (4,  'Priya Menon',    'priya.menon@fountainhead.example',    2, 'Teaching',        'Teacher',         '2021-06-01', 2),
  (5,  'Ramesh Iyer',    'ramesh.iyer@fountainhead.example',    2, 'Teaching',        'Teacher',         '2020-07-15', 2),
  (6,  'Sneha Patel',    'sneha.patel@fountainhead.example',    2, 'Teaching',        'Teacher',         '2022-08-20', 2),
  (7,  'Arjun Rao',      'arjun.rao@fountainhead.example',      3, 'Teaching',        'Teacher',         '2025-06-15', 3),
  (8,  'Kavya Reddy',    'kavya.reddy@fountainhead.example',    3, 'Teaching',        'Teacher',         '2025-05-10', 3),
  (9,  'Rohan Gupta',    'rohan.gupta@fountainhead.example',    3, 'Teaching',        'Teacher',         '2024-03-01', 3),
  (10, 'Divya Krishnan', 'divya.krishnan@fountainhead.example', 2, 'Administration',  'Admin Executive', '2023-02-11', 2),
  (11, 'Anil Kumar',     'anil.kumar@fountainhead.example',     3, 'Teaching',        'Teacher',         '2025-08-01', 3),
  (12, 'Neha Joshi',     'neha.joshi@fountainhead.example',     2, 'Counselling',     'Counsellor',      '2021-09-05', 2),
  (13, 'Suresh Pillai',  'suresh.pillai@fountainhead.example',  3, 'Teaching',        'Teacher',         '2023-07-01', 3),
  (14, 'Pooja Shah',     'pooja.shah@fountainhead.example',     1, 'Human Resources', 'HR Executive',    '2022-03-18', 1),
  (15, 'Manoj Verma',    'manoj.verma@fountainhead.example',    2, 'Teaching',        'Teacher',         '2024-11-25', 2);

-- ---------------------------------------------------------------------------
-- Leave balances (entitled / used / remaining per leave type)
-- ---------------------------------------------------------------------------
INSERT INTO leave_balances (employee_id, leave_type, entitled, used, remaining) VALUES
  -- Priya Menon
  (4, 'casual', 12, 5, 7),
  (4, 'sick',   10, 2, 8),
  (4, 'earned', 15, 6, 9),
  -- Ramesh Iyer
  (5, 'casual', 12, 9, 3),
  (5, 'sick',   10, 4, 6),
  (5, 'earned', 15, 10, 5),
  -- Sneha Patel
  (6, 'casual', 12, 1, 11),
  (6, 'sick',   10, 0, 10),
  (6, 'earned', 15, 3, 12),
  -- Arjun Rao
  (7, 'casual', 12, 0, 12),
  (7, 'sick',   10, 1, 9),
  (7, 'earned', 15, 0, 15),
  -- Kavya Reddy
  (8, 'casual', 12, 2, 10),
  (8, 'sick',   10, 0, 10),
  (8, 'earned', 15, 1, 14),
  -- Neha Joshi
  (12, 'casual', 12, 6, 6),
  (12, 'sick',   10, 3, 7),
  (12, 'earned', 15, 8, 7),
  -- Manoj Verma
  (15, 'casual', 12, 4, 8),
  (15, 'sick',   10, 2, 8),
  (15, 'earned', 15, 5, 10),
  -- Divya Krishnan
  (10, 'casual', 12, 7, 5),
  (10, 'sick',   10, 5, 5),
  (10, 'earned', 15, 9, 6),
  -- Suresh Pillai
  (13, 'casual', 12, 3, 9),
  (13, 'sick',   10, 1, 9),
  (13, 'earned', 15, 4, 11),
  -- Anil Kumar
  (11, 'casual', 12, 0, 12),
  (11, 'sick',   10, 0, 10),
  (11, 'earned', 15, 0, 15);

-- ---------------------------------------------------------------------------
-- Pending / historical HR requests
-- (Today in the seeded scenario is around 2026-06-05.)
-- ---------------------------------------------------------------------------
INSERT INTO hr_requests (employee_id, request_type, status, submitted_date, details) VALUES
  (4,  'reimbursement',    'pending',  '2026-05-20', 'Travel reimbursement for inter-campus workshop'),
  (5,  'leave_approval',   'pending',  '2026-06-03', 'Casual leave request for 2 days'),
  (7,  'id_card',          'pending',  '2026-05-10', 'Replacement ID card after joining'),
  (6,  'reimbursement',    'approved', '2026-05-01', 'Classroom supplies reimbursement'),
  (8,  'leave_approval',   'pending',  '2026-05-25', 'Earned leave request for family event'),
  (15, 'document_request', 'pending',  '2026-06-04', 'Experience letter request'),
  (12, 'reimbursement',    'pending',  '2026-04-28', 'Counselling certification course fees'),
  (10, 'document_request', 'rejected', '2026-05-15', 'Salary certificate (incomplete form)');
