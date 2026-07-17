import sqlite3
import pandas as pd
import os

# Path to your SQLite database
db_path = "daily_water_situation.sqlite"

# Folder where CSV files will be saved
output_folder = "csv_exports"
os.makedirs(output_folder, exist_ok=True)

# Connect to the SQLite database
conn = sqlite3.connect(db_path)

# Get all table names
cursor = conn.cursor()
cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    AND name NOT LIKE 'sqlite_%';
""")

tables = [row[0] for row in cursor.fetchall()]

print("Found tables:")
for table in tables:
    print(f" - {table}")

# Export each table to CSV (always sorted by recorded_date then id)
for table in tables:
    # Use recorded_date for ordering if the column exists, otherwise fall back to id
    col_info = pd.read_sql_query(f'PRAGMA table_info("{table}")', conn)
    if "recorded_date" in col_info["name"].values:
        query = f'SELECT * FROM "{table}" ORDER BY "recorded_date" ASC, "id" ASC'
    else:
        query = f'SELECT * FROM "{table}" ORDER BY "id" ASC'
    df = pd.read_sql_query(query, conn)

    csv_path = os.path.join(output_folder, f"{table}.csv")
    df.to_csv(csv_path, index=False)

    print(f"Exported {table} -> {csv_path}")

conn.close()

print("\nAll tables exported successfully.")