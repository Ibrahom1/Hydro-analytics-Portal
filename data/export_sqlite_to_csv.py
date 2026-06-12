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

# Export each table to CSV
for table in tables:
    query = f'SELECT * FROM "{table}"'
    df = pd.read_sql_query(query, conn)

    csv_path = os.path.join(output_folder, f"{table}.csv")
    df.to_csv(csv_path, index=False)

    print(f"Exported {table} → {csv_path}")

conn.close()

print("\nAll tables exported successfully.")