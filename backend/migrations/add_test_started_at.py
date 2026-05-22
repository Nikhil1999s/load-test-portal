"""
Migration: Add test_started_at column to test_runs table.

Run this once after updating the code:
    python migrations/add_test_started_at.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "loadtest.db")


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. It will be created on first app start.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("PRAGMA table_info(test_runs)")
    columns = [col[1] for col in cursor.fetchall()]

    if "test_started_at" in columns:
        print("Column 'test_started_at' already exists. Nothing to do.")
        conn.close()
        return

    # Add the new column
    cursor.execute("ALTER TABLE test_runs ADD COLUMN test_started_at DATETIME")
    conn.commit()
    print("Added 'test_started_at' column to test_runs table.")

    # Backfill: set test_started_at = created_at for existing runs (approximate)
    cursor.execute("UPDATE test_runs SET test_started_at = created_at WHERE test_started_at IS NULL")
    conn.commit()
    print("Backfilled existing runs with created_at as test_started_at.")

    conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    migrate()
