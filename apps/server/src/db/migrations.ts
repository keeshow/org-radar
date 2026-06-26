import Database from 'better-sqlite3';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS departments (
        dept_id TEXT PRIMARY KEY,
        dept_name TEXT NOT NULL,
        parent_dept_id TEXT,
        dept_path TEXT NOT NULL,
        member_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS persons (
        user_id TEXT PRIMARY KEY,
        open_dingtalk_id TEXT,
        name TEXT NOT NULL,
        nick TEXT,
        title TEXT,
        employee_no TEXT,
        corp_name TEXT,
        corp_id TEXT,
        email TEXT,
        mobile TEXT,
        is_admin INTEGER DEFAULT 0,
        has_subordinate INTEGER DEFAULT 0,
        manager_user_id TEXT,
        manager_name TEXT,
        labels_json TEXT,
        status TEXT NOT NULL DEFAULT 'present',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_sync_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS person_departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        dept_name TEXT NOT NULL,
        dept_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, dept_id)
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        total_departments INTEGER DEFAULT 0,
        total_persons INTEGER DEFAULT 0,
        added_count INTEGER DEFAULT 0,
        removed_count INTEGER DEFAULT 0,
        department_changed_count INTEGER DEFAULT 0,
        title_changed_count INTEGER DEFAULT 0,
        profile_updated_count INTEGER DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        sync_run_id TEXT,
        synced_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'dws-contact',
        total_person_count INTEGER DEFAULT 0,
        total_department_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshot_persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        open_dingtalk_id TEXT,
        name TEXT NOT NULL,
        nick TEXT,
        title TEXT,
        employee_no TEXT,
        email TEXT,
        mobile TEXT,
        is_admin INTEGER DEFAULT 0,
        has_subordinate INTEGER DEFAULT 0,
        manager_user_id TEXT,
        manager_name TEXT,
        departments_json TEXT NOT NULL,
        profile_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(snapshot_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS snapshot_departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id TEXT NOT NULL,
        dept_id TEXT NOT NULL,
        dept_name TEXT NOT NULL,
        parent_dept_id TEXT,
        dept_path TEXT NOT NULL,
        member_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(snapshot_id, dept_id)
      );

      CREATE TABLE IF NOT EXISTS change_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        person_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        from_departments_json TEXT,
        to_departments_json TEXT,
        from_title TEXT,
        to_title TEXT,
        changed_fields_json TEXT,
        description TEXT NOT NULL,
        sync_run_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name);
      CREATE INDEX IF NOT EXISTS idx_persons_status ON persons(status);
      CREATE INDEX IF NOT EXISTS idx_person_departments_user_id ON person_departments(user_id);
      CREATE INDEX IF NOT EXISTS idx_person_departments_dept_id ON person_departments(dept_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_synced_at ON snapshots(synced_at);
      CREATE INDEX IF NOT EXISTS idx_snapshot_persons_snapshot_id ON snapshot_persons(snapshot_id);
      CREATE INDEX IF NOT EXISTS idx_snapshot_persons_user_id ON snapshot_persons(user_id);
      CREATE INDEX IF NOT EXISTS idx_change_events_user_id ON change_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_change_events_type ON change_events(type);
      CREATE INDEX IF NOT EXISTS idx_change_events_detected_at ON change_events(detected_at);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as { version: number }[];
  const appliedVersions = new Set(applied.map((r) => r.version));

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      const now = new Date().toISOString();

      const hasPersonDepartments = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='person_departments'")
        .get();

      if (hasPersonDepartments) {
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, now);
        continue;
      }

      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, now);
    }
  }
}
